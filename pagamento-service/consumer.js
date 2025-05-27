const amqp = require('amqplib');
const { inserirOuAtualizarPagamento } = require('./db');

async function consumir() {
  try {
    const conexao = await amqp.connect('amqp://localhost');
    const canal = await conexao.createChannel();

    const fila = 'pagamento';

    await canal.assertQueue(fila, { durable: true });

    console.log(`Aguardando mensagens na fila: ${fila}`);

    canal.consume(fila, async (msg) => {
      if (msg !== null) {
        const conteudo = msg.content.toString();
        console.log(`Mensagem recebida: ${conteudo}`);

        const pagamento = JSON.parse(conteudo);

        console.log(`Processando pagamento do pedido ${pagamento.pedidoId} com valor R$${pagamento.valor} e status ${pagamento.status}`);

        try {
          // Aqui está o importante: salvar no banco!
          await inserirOuAtualizarPagamento(pagamento.pedidoId, pagamento.status, pagamento.valor);
          console.log(`Pagamento registrado/atualizado no banco.`);
        } catch (dbError) {
          console.error(`Erro ao salvar no banco:`, dbError);
        }

        // Confirma que mensagem foi processada
        canal.ack(msg);
      }
    }, { noAck: false });
  } catch (error) {
    console.error('Erro no consumer:', error);
  }
}

consumir();


