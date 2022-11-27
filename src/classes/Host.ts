import { Server, ServerOptions, Socket } from 'socket.io';
import chalk from 'chalk';
import { StreamFileChunkData, StreamFileDoneData, StreamFileErrorData, StreamFileReadyData } from '../types/stream';
import { createWriteStream, existsSync, mkdirSync, rmSync, WriteStream } from 'fs';
import path from 'path';

export interface HostOptions extends Partial<ServerOptions> {
    sharedFilesFolder: string;
}

export class Host {
    public socket: Server;
    public options: HostOptions;
    public files: (Omit<StreamFileChunkData, 'data'> & { writeStream: WriteStream; })[] = [];

    constructor (options: HostOptions) {
        this.socket = new Server(options);

        this.options = options;

        if (!existsSync(this.options.sharedFilesFolder)) mkdirSync(this.options.sharedFilesFolder, { recursive: true });
    }

    public async start(port: number): Promise<void> {
        this.socket.on('connection', socket => {
            console.log(`${chalk.magenta(socket.id)} connected!`);
            this.listenToSocket(socket);
        });

        this.socket.listen(port);
        console.log(`Listening to ${chalk.green('http://127.0.0.1:' + port + '/')}`)
    }

    public listenToSocket(socket: Socket): void {
        socket.on('fileReady', (data: StreamFileReadyData) => {
            let fileName = data.fileName;
            let writeStream: WriteStream;

            if (existsSync(path.join(this.options.sharedFilesFolder, fileName))) {
                const pathInfo = path.parse(fileName);
                fileName = pathInfo.name + ' (1)' + pathInfo.ext;
            }

            console.log(`Receiving: ${chalk.cyan('File: ' + fileName)} | ${chalk.green('Id: ' + data.id)}`);
            this.socket.sockets.emit('fileReadyReceived', data.id);

            writeStream = createWriteStream(path.join(this.options.sharedFilesFolder, fileName));

            this.files.push({
                ...data,
                type: 'chunk',
                fileName,
                writeStream
            });
        });

        socket.on('fileChunk', (data: StreamFileChunkData) => {
            const file = this.files.find(file => file.id === data.id);
            if (!file) return;

            console.log(`File chunk received: ${chalk.cyan('File: ' + file.fileName)} | ${chalk.yellow('Size: ' + data.data.length.toLocaleString('en-US') + 'B')}`)
            file.writeStream.write(data.data);
        });

        socket.on('fileError', (data: StreamFileErrorData) => {
            const file = this.files.find(file => file.id === data.id);
            if (!file) return;

            console.log(`An error occured transferring ${chalk.cyan(file.fileName)}: ${chalk.red(data.reason)}`);

            file.writeStream.close();
            rmSync(path.join(this.options.sharedFilesFolder, file.fileName), { force: true, recursive: true });

            const index = this.files.findIndex(f => f.id === data.id);
            this.files.splice(index);
        });

        socket.on('fileDone', (data: StreamFileDoneData) => {
            const file = this.files.find(file => file.id === data.id);
            if (!file) return;

            console.log(`Filed transfered ${chalk.cyan(file.fileName)}`);
            file.writeStream.close();

            const index = this.files.findIndex(f => f.id === data.id);
            this.files.splice(index);
        });
    }
}