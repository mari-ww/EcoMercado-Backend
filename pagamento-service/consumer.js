const amqp = require('amqplib');
const { inserirOuAtualizarPagamento } = require('./db');
const prometheus = require('prom-client');

// ========== CONFIGURAÇÃO PROMETHEUS ==========
const paymentProcessingCounter = new prometheus.Counter({
  name: 'payment_processing_total',
  help: 'Total de pagamentos processados',
  labelNames: ['status']
});

// Iniciar coleta de métricas padrão
prometheus.collectDefaultMetrics();

async function consumir() {
  try {
    const conexao = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    const canal = await conexao.createChannel();
    const fila = 'pagamentos';

    await canal.assertQueue(fila, { durable: true });

    console.log(`Aguardando mensagens na fila: ${fila}`);

    canal.consume(fila, async (msg) => {
      if (msg !== null) {
        const conteudo = msg.content.toString();
        console.log(`Mensagem recebida: ${conteudo}`);

        const pagamento = JSON.parse(conteudo);

        console.log(`Processando pagamento do pedido ${pagamento.pedidoId} com valor R$${pagamento.valor} e status ${pagamento.status}`);

        try {
          await inserirOuAtualizarPagamento(pagamento.pedidoId, pagamento.status, pagamento.valor);
          paymentProcessingCounter.labels('success').inc();
          console.log(`Pagamento registrado/atualizado no banco.`);
        } catch (dbError) {
          paymentProcessingCounter.labels('error').inc();
          console.error(`Erro ao salvar no banco:`, dbError);
        }

        canal.ack(msg);
      }
    }, { noAck: false });
  } catch (error) {
    console.error('Erro no consumer:', error);
  }
}

// Exportar o registro de métricas para o endpoint
module.exports = {
  consumir,
  register: prometheus.register
};