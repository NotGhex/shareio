# Share.io

Share.io is a file sharing library made with socket.io.

## Example

Creating receiver client example

```js
const { ReceiverClient } = require('share.io');

const receiver = new ReceiverClient({
    sharedFilesFolder: folder,
    port: 5523,
});

receiver.on('ready', () => {
    console.log(`Ready to receive files!`);
});

receiver.on('connected', socket => console.log(`Connected ${socket.id}`));
receiver.on('disconnected', (reason, socket) => console.log(`Disconnected ${socket.id}`));
receiver.on('newFile', data => console.log(`Receiving file ${data.file}`));
receiver.on('receivedFile', data => console.log(`File transfered ${data.file}`));
```

Create a sender client example

```js
const { SenderClient } = require('share.io');

const sender = new SenderClient({
    host: 'http://127.0.0.1:5523'
});

sender.on('sentFile', data => console.log(`File transfered ${data.path}`));
sender.on('fileStreamCreate', data => console.log(`Sending ${data.path}`));

sender.on('ready', () => {
    console.log(`Client connected!`);
    await sender.sendFile(`./my_file.txt`);

    sender.once('disconnect', () => console.log('Client disconnected!'));
});
```