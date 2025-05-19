const express = require('express');
const amqp = require('amqplib');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// PostgreSQL (mesmo DATABASE_URL apontando para 'db:5432/ecommerce')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Cria a tabela 'carrinhos' se não existir
async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS carrinhos (
      id SERIAL PRIMARY KEY,
      usuario_id VARCHAR(255) NOT NULL,
      produto_id INT NOT NULL,
      quantidade INT NOT NULL
    );
  `);
}

// Middleware para validar JWT
function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ erro: 'Token ausente!' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ erro: 'Token inválido!' });
    req.user = user;
    next();
  });
}

// Conecta no RabbitMQ e declara fila 'carrinho-evento'
let channel;
async function connectRabbitMQ(retries = 10) {
  while (retries > 0) {
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
      channel = await connection.createChannel();
      await channel.assertQueue('carrinho-evento');
      console.log('✅ carrinho-service conectado ao RabbitMQ!');
      return;
    } catch (err) {
      console.error(`❌ Erro ao conectar ao RabbitMQ (${retries} tentativas restantes):`, err.message);
      retries--;
      await new Promise(res => setTimeout(res, 5000));
    }
  }
  throw new Error('🛑 Não foi possível conectar ao RabbitMQ após várias tentativas.');
}

// Endpoint para adicionar item ao carrinho
app.post('/carrinho', authenticateToken, async (req, res) => {
  const { produto_id, quantidade } = req.body;
  const usuario_id = req.user.id;

  if (!usuario_id || !produto_id || !quantidade) {
    return res.status(400).json({ mensagem: 'Dados incompletos.' });
  }

  try {
    // Insere no banco (mesmo 'ecommerce', tabela carrinhos)
    await pool.query(
      'INSERT INTO carrinhos (usuario_id, produto_id, quantidade) VALUES ($1, $2, $3)',
      [usuario_id, produto_id, quantidade]
    );

    // Publica evento no RabbitMQ
    if (channel) {
      channel.sendToQueue(
        'carrinho-evento',
        Buffer.from(JSON.stringify({
          tipo: 'CARRINHO_ATUALIZADO',
          usuario_id,
          produto_id,
          quantidade
        }))
      );
    } else {
      console.warn('⚠️ Canal RabbitMQ não disponível. Evento não publicado.');
    }

    res.status(201).json({ mensagem: 'Item adicionado ao carrinho!' });
  } catch (err) {
    console.error('Erro ao adicionar item ao banco:', err.message);
    res.status(500).json({ erro: 'Erro ao adicionar item ao carrinho.' });
  }
});

// Endpoint para listar itens do carrinho de um usuário (GET /carrinho/:usuario_id)
app.get('/carrinho/:usuario_id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM carrinhos WHERE usuario_id = $1',
      [req.params.usuario_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Erro ao buscar carrinho:', err.message);
    res.status(500).json({ erro: 'Erro ao buscar carrinho.' });
  }
});

// Endpoint para limpar o carrinho de um usuário (DELETE /carrinho/:usuario_id)
app.delete('/carrinho/:usuario_id', async (req, res) => {
  try {
    await pool.query('DELETE FROM carrinhos WHERE usuario_id = $1', [req.params.usuario_id]);
    res.status(204).end();
  } catch (err) {
    console.error('Erro ao limpar carrinho:', err);
    res.status(500).json({ erro: 'Erro ao limpar carrinho.' });
  }
});

// Inicialização
const PORT = 3000;
(async () => {
  try {
    await createTables();
    await connectRabbitMQ();
    app.listen(PORT, () => {
      console.log(`🚀 carrinho-service rodando na porta ${PORT}`);
    });
  } catch (err) {
    console.error('🛑 Erro na inicialização:', err);
    process.exit(1);
  }
})();
