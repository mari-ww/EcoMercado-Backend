const express = require('express');
const bodyParser = require('body-parser');
const { publicarPagamento } = require('./publisher'); // Importa a função do publisher.js

const app = express();
app.use(bodyParser.json());

// Rota para receber o pedido do frontend
app.post('/api/pagamento', async (req, res) => {
    const { pedidoId, valor, status } = req.body;
    try {
        await publicarPagamento({ pedidoId, valor, status }); // Publica na fila RabbitMQ
        res.status(200).json({ message: 'Pagamento enviado para processamento!' });
    } catch (error) {
        console.error('Erro ao processar pagamento:', error);
        res.status(500).json({ error: 'Erro ao processar pagamento' });
    }
});

// Inicia o servidor
app.listen(3001, () => {
    console.log('Servidor do pagamento rodando na porta 3001');
});

