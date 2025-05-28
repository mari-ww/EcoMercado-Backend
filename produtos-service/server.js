const express = require('express');
const cors = require('cors');
const prometheus = require('prom-client');

const app = express();
app.use(cors());
app.use(express.json());

// ========== CONFIGURAÇÃO PROMETHEUS ==========
// Criar métricas
const httpRequestDurationMicroseconds = new prometheus.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duração das requisições HTTP em ms',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 5, 15, 50, 100, 200, 300, 400, 500]
});

const productRequestsCounter = new prometheus.Counter({
  name: 'product_requests_total',
  help: 'Total de requisições para produtos',
  labelNames: ['endpoint']
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

// Mock de produtos (conforme o frontend)
const produtos = [
  { id: 1, nome: "teste 1", preco: 193 },
  { id: 2, nome: "teste 2", preco: 253 },
  { id: 3, nome: "teste 3", preco: 89 },
  { id: 4, nome: "Product 4", preco: 112 },
  { id: 5, nome: "Product 5", preco: 599 },
  { id: 6, nome: "Product 6", preco: 799 }
];

// Endpoint para listar produtos
app.get('/produtos', (req, res) => {
  productRequestsCounter.labels('list').inc();
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.setHeader('Vary', 'Authorization');
  res.json(produtos);
});

const PORT = 8080;
app.listen(PORT, () => {
  console.log(`Serviço de produtos rodando na porta ${PORT}`);
});