const express = require('express');
const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Criação das tabelas, se não existirem
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

// Conexão com RabbitMQ e consumo de eventos
// Conexão simplificada com RabbitMQ
async function connectRabbitMQ() {
  const connection = await amqp.connect(process.env.RABBITMQ_URL);
  return connection.createChannel();
}

// Novo endpoint para simular pagamento
app.post('/pedidos/:id/pagar', async (req, res) => {
  try {
    // Atualizar status
    await pool.query(
      `UPDATE pedidos SET status = 'pagamento efetuado' WHERE id = $1`,
      [req.params.id]
    );

    // Agendar atualização de status
    setTimeout(async () => {
      await pool.query(
        `UPDATE pedidos SET status = 'saiu para entrega' WHERE id = $1`,
        [req.params.id]
      );
    }, 180000); // 3 minutos

    res.json({ mensagem: 'Pagamento confirmado! Pedido sairá em 3 minutos.' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao processar pagamento' });
  }
});

// Endpoint para atualizar status do pedido
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
      res.json({ mensagem: 'Status atualizado!' });
    }
  } catch (err) {
    console.error('Erro ao atualizar status:', err.message);
    res.status(500).json({ erro: 'Erro ao atualizar status do pedido.' });
  }
});

// Inicia servidor após conexão com RabbitMQ e criação de tabelas
const PORT = 3000;
(async () => {
  try {
    await createTables();
    await connectRabbitMQ();
    app.listen(PORT, () => {
      console.log(`🚀 Serviço de pedidos rodando na porta ${PORT}`);
    });
  } catch (err) {
    console.error('🛑 Erro fatal na inicialização:', err);
    process.exit(1);
  }
})();