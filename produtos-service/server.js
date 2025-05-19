const express = require('express');
const app = express();
app.use(express.json());

// Mock de produtos (conforme o frontend)
const produtos = [
  { id: 1, nome: "Product 1", preco: 193 },
  { id: 2, nome: "Product 2", preco: 253 },
  { id: 3, nome: "Product 3", preco: 89 },
  { id: 4, nome: "Product 4", preco: 112 },
  { id: 5, nome: "Product 5", preco: 599 },
  { id: 6, nome: "Product 6", preco: 799 }
];

// Endpoint para listar produtos
app.get('/produtos', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.setHeader('Vary', 'Authorization'); // Isso é essencial!
  res.json(produtos);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Serviço de produtos rodando na porta ${PORT}`);
});