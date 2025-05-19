const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());

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
    return res.status(400).json({ erro: 'Credenciais obrigatórias!' });
  }

  const user = users.find(u => u.email === email);
  
  if (!user || !bcrypt.compareSync(senha, user.senha)) {
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