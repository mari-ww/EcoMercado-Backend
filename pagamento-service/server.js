const express = require('express');
const bodyParser = require('body-parser');
const { publicarPagamento } = require('./publisher');
const { consumir, register } = require('./consumer');
const prometheus = require('prom-client');

const app = express();
app.use(bodyParser.json());

// ========== CONFIGURAÇÃO PROMETHEUS ==========
const httpRequestDurationMicroseconds = new prometheus.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duração das requisições HTTP em ms',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 5, 15, 50, 100, 200, 300, 400, 500]
});

const paymentCounter = new prometheus.Counter({
  name: 'payment_operations_total',
  help: 'Total de operações de pagamento',
  labelNames: ['status']
});

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
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
});

// Rota para receber o pedido do frontend
app.post('/api/pagamento', async (req, res) => {
  const { pedidoId, valor, status } = req.body;
  try {
    await publicarPagamento({ pedidoId, valor, status });
    paymentCounter.labels('published').inc();
    res.status(200).json({ message: 'Pagamento enviado para processamento!' });
  } catch (error) {
    paymentCounter.labels('error').inc();
    console.error('Erro ao processar pagamento:', error);
    res.status(500).json({ error: 'Erro ao processar pagamento' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'online' });
});

// Inicia o servidor
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Servidor do pagamento rodando na porta ${PORT}`);
  // Inicia o consumer
  consumir();
});