const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
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

const loginCounter = new prometheus.Counter({
  name: 'auth_login_attempts_total',
  help: 'Total de tentativas de login',
  labelNames: ['status']
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

// Verifica variáveis de ambiente obrigatórias
if (!process.env.JWT_SECRET) {
  console.error('🛑 ERRO: JWT_SECRET não está definido!');
  process.exit(1);
}

// Mock de usuários
const users = [
  { 
    id: "123", 
    email: "user@teste.com", 
    senha: bcrypt.hashSync("senha123", 8)
  }
];

// Endpoint de login
app.post('/login', (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    loginCounter.labels('missing_credentials').inc();
    return res.status(400).json({ erro: 'Credenciais obrigatórias!' });
  }

  const user = users.find(u => u.email === email);
  
  if (!user || !bcrypt.compareSync(senha, user.senha)) {
    loginCounter.labels('invalid_credentials').inc();
    return res.status(401).json({ erro: 'Credenciais inválidas!' });
  }

  const token = jwt.sign(
    { 
      id: user.id,
      email: user.email 
    }, 
    process.env.JWT_SECRET, 
    { expiresIn: '1h' }
  );

  loginCounter.labels('success').inc();
  res.json({ token });
});

// Endpoint único de validação
app.get('/validate', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ valido: false, erro: 'Token ausente' });
  }

  const [bearer, token] = authHeader.split(' ');

  if (bearer !== 'Bearer' || !token) {
    return res.status(401).json({ valido: false, erro: 'Formato inválido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ 
      valido: true,
      usuario: {
        id: decoded.id,
        email: decoded.email,
        expiracao: new Date(decoded.exp * 1000)
      }
    });
  } catch (err) {
    res.status(403).json({ 
      valido: false,
      erro: 'Token inválido',
      detalhes: err.message
    });
  }
});

// Middleware de autenticação reutilizável
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) return res.status(401).json({ erro: 'Token ausente' });

  const token = authHeader.split(' ')[1];
  
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ erro: 'Token inválido' });
    req.user = decoded;
    next();
  });
};

// Rota protegida de exemplo
app.get('/protegido', authenticateToken, (req, res) => {
  res.json({
    mensagem: 'Acesso autorizado',
    usuario: req.user
  });
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'online' });
});

// Inicialização do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔐 Auth service rodando na porta ${PORT}`);
});