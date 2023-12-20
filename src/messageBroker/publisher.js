const amqplib = require('amqplib');

var conn = null;
var channel = null;

const channelName = "edgeml"

const MQ = {
    init: async () => {
        if (channel == null) {
            try {
                conn = await amqplib.connect("amqp://localhost:5672");
                channel = await conn.createChannel(channelName);
            } catch (exception) {
                console.log(exception)
            }
        }
    },
    close: async () => {
        await channel.close()
        await conn.close()
    },
    send: async (command, payload) => {
        const msgBuffer = Buffer.from(JSON.stringify({command: command, payload: payload})) 
        await channel.assertQueue(channelName);
        await channel.sendToQueue(channelName, msgBuffer);
    }
}

module.exports = {
    MQ: MQ
}