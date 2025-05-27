const amqp = require('amqplib');

async function publicar() {
  try {
    const conexao = await amqp.connect('amqp://localhost');
    const canal = await conexao.createChannel();

    const fila = 'pagamento';

    await canal.assertQueue(fila, { durable: true });

    const mensagem = {
      pedidoId: 123,
      valor: 150,
      status: 'pendente',
    };

    canal.sendToQueue(fila, Buffer.from(JSON.stringify(mensagem)), { persistent: true });
    console.log('Mensagem de pagamento enviada:', mensagem);

    await canal.close();
    await conexao.close();
  } catch (error) {
    console.error('Erro no publisher:', error);
  }
}

publicar();
