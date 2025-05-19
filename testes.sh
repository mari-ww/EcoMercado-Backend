#!/bin/bash
# Configurações para compatibilidade com WSL/VSCode
stty -icanon  # Desativa buffer de linha
stty -echoctl # Oculta caracteres de controle

# Verifica dependências críticas
command -v jq >/dev/null 2>&1 || { 
  echo >&2 "Erro: jq não instalado. Instale com 'sudo apt-get install jq'.";
  exit 1;
}

TOKEN=""
EMAIL="user@teste.com"  # Valor padrão para facilitar testes
USUARIO_ID="123"        # ID padrão do mock de usuário
PRODUTO_ID=""
QUANTIDADE=""

input_senha() {
  echo -n "Senha: "
  SENHA=""
  while IFS= read -r -s -n1 char; do
    [[ $char == $'\177' ]] && { [ -n "$SENHA" ] && SENHA=${SENHA%?} && echo -ne "\b \b"; continue; }
    [[ -z $char || $char == $'\n' || $char == $'\r' ]] && break
    SENHA+="$char"
    echo -n "*"
  done
  echo
}

login() {
  read -p "Email (padrão: user@teste.com): " EMAIL_INPUT
  EMAIL=${EMAIL_INPUT:-$EMAIL}
  input_senha
  
  TOKEN_RESPONSE=$(curl -s -X POST http://localhost/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$EMAIL\", \"senha\": \"$SENHA\"}")
  
  TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.token // empty')
  [ -z "$TOKEN" ] && echo "Erro: token não obtido. Resposta: $TOKEN_RESPONSE" || echo "TOKEN obtido com sucesso."
}

input_numero() {
  while :; do
    read -p "$1" input
    [[ $input =~ ^[0-9]+$ ]] && eval "$2"="$input" && break
    echo "Erro: Insira um número válido."
  done
}

add_carrinho() {
  [ -z "$TOKEN" ] && { echo "Faça login primeiro."; return 1; }
  
  input_numero "ID do produto (1-6): " PRODUTO_ID
  input_numero "Quantidade: " QUANTIDADE

  curl -X POST http://localhost/carrinho \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"usuario_id\": \"$USUARIO_ID\", \"produto_id\": $PRODUTO_ID, \"quantidade\": $QUANTIDADE}"
  echo
}

listar_carrinho() {
  if [[ -z "$TOKEN" ]]; then
    echo "Faça login primeiro."
    return 1
  fi
  [[ -z "$USUARIO_ID" ]] && read -p "ID do usuário: " USUARIO_ID

  curl -s -X GET "http://localhost/carrinho/$USUARIO_ID" \
    -H "Authorization: Bearer $TOKEN" | jq
}

limpar_carrinho() {
  if [[ -z "$TOKEN" || -z "$USUARIO_ID" ]]; then
    echo "Faça login e defina o ID do usuário primeiro."
    return 1
  fi

  echo "Limpando carrinho do usuário $USUARIO_ID..."
  curl -X DELETE "http://localhost/carrinho/$USUARIO_ID" \
    -H "Authorization: Bearer $TOKEN"
  echo
}

confirmar_pagamento() {
  read -p "ID do pedido: " pedido_id
  curl -X POST "http://localhost/pedidos/$pedido_id/pagar" \
    -H "Authorization: Bearer $TOKEN"
  echo
}

ver_pedidos() {
  if [[ -z "$TOKEN" || -z "$USUARIO_ID" ]]; then
    echo "Faça login e defina o ID do usuário primeiro."
    return 1
  fi

  curl -X GET http://localhost/pedidos/$USUARIO_ID \
    -H "Authorization: Bearer $TOKEN" | jq
}

validar_token() {
  if [[ -z "$TOKEN" ]]; then
    echo "Faça login primeiro."
    return 1
  fi

  curl -X GET http://localhost/auth/validate \
    -H "Authorization: Bearer $TOKEN"
  echo
}

testar_cache() {
  [ -z "$TOKEN" ] && { echo "Faça login primeiro."; return 1; }

  echo "Testando cache com HEADERS COMPLETOS:"
  echo -e "\nPrimeira requisição (DEVE SER MISS):"
  curl -s -v -H "Authorization: Bearer $TOKEN" http://localhost/produtos 2>&1 | grep -E 'X-Cache-Status|< Cache-Control| < Vary'

  echo -e "\nSegunda requisição (DEVE SER HIT):"
  curl -s -v -H "Authorization: Bearer $TOKEN" http://localhost/produtos 2>&1 | grep -E 'X-Cache-Status|< Cache-Control| < Vary'
}

limpar_cache() {
  local container_name=$(docker-compose ps -q api-gateway)
  [ -z "$container_name" ] && { echo "Erro: Container não encontrado!"; return 1; }

  echo "Limpando cache de forma segura..."
  docker exec "$container_name" sh -c 'rm -rf /var/cache/nginx/* && nginx -s reload'
  sleep 3
}

teste_circuit_breaker() {
  echo "Parando produtos-service..."
  docker-compose stop produtos-service
  sleep 3

  echo "Fazendo 4 requisições:"
  for i in {1..4}; do
    curl -i http://localhost/produtos
    sleep 1
  done

  echo "Iniciando produtos-service..."
  docker-compose start produtos-service
  sleep 5

  echo "Teste final:"
  curl -i http://localhost/produtos
  echo
}

ver_metricas() {
  curl -s http://localhost:9113/metrics | head -n 20
  echo
}

mostrar_urls() {
  echo "- Prometheus: http://localhost:9090"
  echo "- Grafana:    http://localhost:3000 (admin/admin)"
  echo
}

# Menu principal
while true; do
  clear
  echo "==== MENU DE TESTES ECOMMERCE ===="
  PS3=$'\nSelecione uma opção: '
  options=(
    "Login (obter token)"
    "Adicionar item ao carrinho"
    "Listar carrinho"
    "Limpar carrinho"
    "Listar pedidos"
    "Efetuar pagamento"       # Nova opção
    "Ver status do pedido"    # Nova opção
    "Validar token"
    "Testar cache"
    "Limpar cache"
    "Testar Circuit Breaker"
    "Ver métricas"
    "URLs úteis"
    "Sair"
  )
  
  select opt in "${options[@]}"; do
    case $REPLY in
      1) login ;;
      2) add_carrinho ;;
      3) listar_carrinho ;;
      4) limpar_carrinho ;;
      5) ver_pedidos ;;
      6) confirmar_pagamento ;;    # Renomeado de confirmar_pagamento para efetuar_pagamento
      7) ver_status_pedido ;;      # Nova função a ser implementada
      8) validar_token ;;     # Antiga opção 6
      9) testar_cache ;;      # Antiga opção 7
      10) limpar_cache ;;      # Antiga opção 8
      11) teste_circuit_breaker ;; # Antiga opção 9
      12) ver_metricas ;;     # Antiga opção 10
      13) mostrar_urls ;;     # Antiga opção 11
      14) echo "Saindo..."; exit 0 ;; # Ajustado para 13
      *) echo "Opção inválida." ;;
    esac
    read -p "Pressione ENTER para continuar..."
    break
  done
done