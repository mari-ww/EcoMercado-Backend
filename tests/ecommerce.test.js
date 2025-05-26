const axios = require('axios');

const BASE_URL = 'http://localhost';
const user = {
  email: 'user@teste.com',
  password: 'senha123'
};

let token = '';
let usuario_id = '';

describe('Testes E2E da API de E-commerce', () => {
  beforeAll(async () => {
    try {
      // Tenta cadastrar o usuário
      const res = await axios.post(`${BASE_URL}/auth/register`, user);
      usuario_id = res.data.id || '123'; // Ajuste se o retorno for diferente
    } catch (err) {
      // Se já estiver cadastrado, ignora erro
      if (err.response && err.response.status !== 409) {
        console.error('Erro ao registrar usuário:', err.response.data);
      }
    }
  });

  test('Login retorna token', async () => {
    const res = await axios.post(`${BASE_URL}/auth/login`, user);
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('token');
    token = res.data.token;
    usuario_id = res.data.usuario_id || usuario_id;
  });

  // ... (resto dos testes)
});
