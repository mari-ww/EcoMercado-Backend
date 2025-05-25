const mysql = require('mysql2/promise');

// Configurações de conexão com seu banco de dados MySQL
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',             // Use root como user
  password: 'password',     // A senha que você definiu
  database: 'eco_mercado',  // O nome da sua base de dados
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function inserirOuAtualizarPagamento(pedidoId, status, valor) {
  try {
    const sqlSelect = 'SELECT id FROM pagamentos WHERE pedido_id = ?';
    const [rows] = await pool.execute(sqlSelect, [pedidoId]);

    if (rows.length === 0) {
      const sqlInsert = 'INSERT INTO pagamentos (pedido_id, status, valor) VALUES (?, ?, ?)';
      await pool.execute(sqlInsert, [pedidoId, status, valor]);
      console.log(`Pagamento inserido para pedido ${pedidoId}`);
    } else {
      const sqlUpdate = 'UPDATE pagamentos SET status = ?, valor = ? WHERE pedido_id = ?';
      await pool.execute(sqlUpdate, [status, valor, pedidoId]);
      console.log(`Pagamento atualizado para pedido ${pedidoId}`);
    }
  } catch (error) {
    console.error('Erro ao inserir ou atualizar pagamento:', error);
  }
}

module.exports = {
  inserirOuAtualizarPagamento,
};
