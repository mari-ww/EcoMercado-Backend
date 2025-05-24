# Etapa 1: Build (opcional se usar TypeScript ou bundler)
# FROM node:20-alpine as builder

# Etapa 2: Execução
FROM node:20-alpine

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia apenas arquivos essenciais para instalar dependências primeiro (para cache eficiente)
COPY package*.json ./

# Instala as dependências
RUN npm install --production

# Copia o restante do código para dentro da imagem
COPY . .

# Expõe a porta do Fastify (por padrão 3000)
EXPOSE 3000

# Define a variável de ambiente NODE_ENV como production
ENV NODE_ENV=production

# Comando para rodar a aplicação
CMD ["node", "index.js"]
