const express = require('express');
const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const fetch = require('node-fetch');
const prometheus = require('prom-client');

const app = express();
app.use(express.json());

// ========== CONFIGURAÇÃO PROMETHEUS ==========
// Criar métricas
const httpRequestDurationMicroseconds = new prometheus.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duração das requisições HTTP em ms',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 5, 15, 50, 100, 200, 300, 400, 500]
});

const orderStatusCounter = new prometheus.Counter({
  name: 'order_status_changes_total',
  help: 'Total de mudanças de status de pedido',
  labelNames: ['from_status', 'to_status']
});

// Coletar métricas padrão
prometheus.collectDefaultMetrics();

// Middleware para medir tempo das requisições
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    httpRequestDurationMicroseconds
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);
  });
  next();
});

// Endpoint para métricas
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', prometheus.register.contentType);
  res.end(await prometheus.register.metrics());
});
// ========== FIM CONFIGURAÇÃO PROMETHEUS ==========

// PostgreSQL: todos usam o mesmo banco "ecommerce"
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Criação das tabelas (pedidos e pedido_itens)
async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pedidos (
      id UUID PRIMARY KEY,
      usuario_id VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pedido_itens (
      pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE,
      produto_id INT NOT NULL,
      quantidade INT NOT NULL
    );
  `);
}

// Conexão simplificada com RabbitMQ
async function connectRabbitMQ() {
  const connection = await amqp.connect(process.env.RABBITMQ_URL);
  return connection.createChannel();
}

// Novo endpoint para simular pagamento
app.post('/pedidos/:id/pagar', async (req, res) => {
  try {
    const pedidoId = req.params.id;
    
    // Obter status atual
    const statusResult = await pool.query(
      'SELECT status FROM pedidos WHERE id = $1',
      [pedidoId]
    );
    
    if (statusResult.rowCount === 0) {
      return res.status(404).json({ erro: 'Pedido não encontrado' });
    }
    
    const currentStatus = statusResult.rows[0].status;
    
    // Atualizar status para 'pagamento efetuado'
    await pool.query(
      `UPDATE pedidos SET status = 'pagamento efetuado' WHERE id = $1`,
      [pedidoId]
    );
    
    // Registrar mudança de status
    orderStatusCounter.labels(currentStatus, 'pagamento efetuado').inc();

    // Em 3 minutos, atualiza para 'saiu para entrega'
    setTimeout(async () => {
      await pool.query(
        `UPDATE pedidos SET status = 'saiu para entrega' WHERE id = $1`,
        [pedidoId]
      );
      orderStatusCounter.labels('pagamento efetuado', 'saiu para entrega').inc();
    }, 180000);

    res.json({ mensagem: 'Pagamento confirmado! Pedido sairá em 3 minutos.' });
  } catch (err) {
    console.error('Erro ao processar pagamento:', err);
    res.status(500).json({ erro: 'Erro ao processar pagamento' });
  }
});

// Consumer: a cada item no carrinho, cria um pedido pendente separado
async function setupRabbitMQConsumer() {
  try {
    const channel = await connectRabbitMQ();
    await channel.assertQueue('carrinho-evento');

    channel.consume('carrinho-evento', async (msg) => {
      if (!msg) return;

      const event = JSON.parse(msg.content.toString());
      console.log('Evento recebido em pedidos-service:', event);

      if (event.tipo === 'CARRINHO_ATUALIZADO') {
        const { usuario_id } = event;

        // 1) Apaga todos os pedidos pendentes antigos deste usuário
        await pool.query(
          `DELETE FROM pedidos WHERE usuario_id = $1 AND status = 'pendente'`,
          [usuario_id]
        );

        // 2) Busca itens atuais do carrinho
        let carrinhoItens = [];
        try {
          const carrinhoResponse = await fetch(`http://carrinho-service:3000/carrinho/${usuario_id}`);
          if (carrinhoResponse.ok) {
            carrinhoItens = await carrinhoResponse.json();
          } else {
            console.warn(`pedidos-service: status HTTP ${carrinhoResponse.status} ao buscar carrinho/${usuario_id}`);
          }
        } catch (err) {
          console.error(`pedidos-service: falha ao buscar carrinho de ${usuario_id}:`, err.message);
          channel.ack(msg);
          return;
        }

        // 3) Para cada item no carrinho, criar UM pedido pendente individual
        if (Array.isArray(carrinhoItens) && carrinhoItens.length > 0) {
          for (const item of carrinhoItens) {
            const pedidoId = uuidv4();

            // 3a) Insere na tabela pedidos (status = 'pendente')
            await pool.query(
              `INSERT INTO pedidos (id, usuario_id, status) VALUES ($1, $2, 'pendente')`,
              [pedidoId, usuario_id]
            );

            // 3b) Insere na tabela pedido_itens apenas o item atual
            await pool.query(
              `INSERT INTO pedido_itens (pedido_id, produto_id, quantidade) VALUES ($1, $2, $3)`,
              [pedidoId, item.produto_id, item.quantidade]
            );

            console.log(`Novo pedido ${pedidoId} criado para usuario ${usuario_id} (produto ${item.produto_id}, quantidade ${item.quantidade})`);
          }
        }
      }

      // Confirma que a mensagem foi processada
      channel.ack(msg);
    });
  } catch (err) {
    console.error('Erro no consumer RabbitMQ:', err);
  }
}

// Atualizar status de um pedido manualmente (PUT /pedidos/:id/status)
app.put('/pedidos/:id/status', async (req, res) => {
  const { status } = req.body;
  try {
    const result = await pool.query(
      'UPDATE pedidos SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ erro: 'Pedido não encontrado.' });
    } else {
      res.json({ mensagem: 'Status atualizado!', pedido: result.rows[0] });
    }
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
    res.status(500).json({ erro: 'Erro ao atualizar status do pedido.' });
  }
});

/// Listar todos os pedidos de um usuário (GET /pedidos/:usuario_id)
app.get('/pedidos/:usuario_id', async (req, res) => {
  try {
    const { usuario_id } = req.params;

    // Busca todos os pedidos desse usuário (incluindo itens)
    const pedidosResult = await pool.query(
      'SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY id DESC',
      [usuario_id]
    );

    const pedidosComItens = await Promise.all(
      pedidosResult.rows.map(async (pedido) => {
        const itensResult = await pool.query(
          'SELECT produto_id, quantidade FROM pedido_itens WHERE pedido_id = $1',
          [pedido.id]
        );
        return {
          ...pedido,
          itens: itensResult.rows
        };
      })
    );

    res.json(pedidosComItens);
  } catch (err) {
    console.error('Erro ao buscar pedidos:', err);
    res.status(500).json({ erro: 'Erro interno no servidor' });
  }
});

// Apagar todos os pedidos pendentes de um usuário (DELETE /pedidos/pendentes/:usuario_id)
app.delete('/pedidos/pendentes/:usuario_id', async (req, res) => {
  try {
    const { usuario_id } = req.params;
    await pool.query(
      `DELETE FROM pedidos WHERE usuario_id = $1 AND status = 'pendente'`,
      [usuario_id]
    );
    res.json({ mensagem: `Pedidos pendentes do usuário ${usuario_id} foram apagados.` });
  } catch (err) {
    console.error('Erro ao apagar pedidos pendentes:', err);
    res.status(500).json({ erro: 'Erro interno ao apagar pedidos pendentes.' });
  }
});

// Inicializa servidor após criar tabelas e conectar ao RabbitMQ
const PORT = 3000;
(async () => {
  try {
    await createTables();
    await setupRabbitMQConsumer();
    app.listen(PORT, () => {
      console.log(`🚀 pedidos-service rodando na porta ${PORT}`);
    });
  } catch (err) {
    console.error('🛑 Erro fatal na inicialização:', err);
    process.exit(1);
  }
})();