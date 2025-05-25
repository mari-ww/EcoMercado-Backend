const amqp = require('amqplib');

async function start() {
    const connection = await amqp.connect('amqp://rabbitmq');
    const channel = await connection.createChannel();
    const queue = 'pagamento';

    await channel.assertQueue(queue, { durable: true });

    console.log(" [*] Aguardando mensagens em %s", queue);
    channel.consume(queue, async (msg) => {
        const pedido = JSON.parse(msg.content.toString());
        console.log(" [x] Processando pagamento do pedido: %s", pedido.id);

        // Simular processamento
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log(" [✔] Pagamento confirmado para o pedido: %s", pedido.id);

        // Opcional: enviar mensagem de volta (ex: confirmação)
        // channel.sendToQueue('confirmacao_pagamento', Buffer.from(JSON.stringify({ id: pedido.id, status: 'Pago' })));

        channel.ack(msg);
    }, { noAck: false });
}

start().catch(console.error);
