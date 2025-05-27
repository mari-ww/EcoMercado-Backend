FROM nginx:alpine

# Cria a pasta de logs padrão do nginx (geralmente já existe, mas só para garantir)
RUN mkdir -p /var/log/nginx

# Copia o arquivo customizado do nginx
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

