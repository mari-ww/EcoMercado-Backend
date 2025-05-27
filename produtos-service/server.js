const express = require('express');
const cors = require('cors');    // importar cors
const app = express();

app.use(cors());                // habilitar CORS para todas origens
app.options('*', cors());
app.use(express.json());

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
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.setHeader('Vary', 'Authorization'); // Isso é essencial!
  res.json(produtos);
});

app.get('/teste', (req,res)=>{
  res.send("Produtos - Teste!")
})

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Serviço de produtos rodando na porta ${PORT}`);
});
