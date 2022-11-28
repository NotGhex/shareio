import { Socket, io } from 'socket.io-client';
import { StreamFileChunkData, StreamFileDoneData, StreamFileErrorData, StreamFileReadyData } from '../types/stream';
import chalk from 'chalk';
import { createReadStream, existsSync, lstatSync, ReadStream } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export interface ConnectOptions {
    server: string;
    password?: string;
}

export class Connect {
    public socket: Socket;
    public options: ConnectOptions;
    public files: (Omit<StreamFileChunkData, 'data' | 'type'> & { readStream: ReadStream|null; path: string; })[] = [];

    constructor(options: ConnectOptions) {
        console.log(`Connecting to ${chalk.green(options.server)}`);

        this.socket = io(options.server);
        this.options = options;
    }

    public async handleConnection(): Promise<void> {
        await new Promise((res, rej) => {
            this.socket.on('connect', () => {
                console.log(`Connected: ${chalk.magenta('Id: ' + this.socket.id)}`);

                this.socket.once('needPassword', () => {
                    if (this.options.password == undefined) {
                        console.log(`Password needed to connect`);
                        this.socket.close();
                        rej(void 0);
                    }

                    this.socket.emit('password', this.options.password);
                    this.socket.once('invalidPassword', () => {
                        console.log(`Invalid password given`);
                        this.socket.close();
                        rej(void 0);
                    });
                });

                this.handleFileTransfer();
                res(void 0);
            });

            this.socket.on('disconnect', reason => {
                console.log(`Disconnected: ${reason}`);
                res(void 0);
            });

            this.socket.on('connect_error', err => {
                console.log(`Connection error: `, err.stack);
                this.socket.close();
                rej(err);
            });
        });
    }

    public handleFileTransfer(): void {
        this.socket.on('fileReadyReceived', id => {
            const file = this.files.find(file => file.id === id);
            if (!file) return;

            console.log(`Starting stream: ${chalk.cyan('File: '+ file.path)} | ${chalk.green('Id: ' + file.id)}`);

            file.readStream = createReadStream(file.path);

            file.readStream.on('end', () => {
                this.socket.emit('fileDone', <StreamFileDoneData>({
                    type: 'done',
                    id: file.id,
                    fileName: file.fileName
                }));

                console.log(`File read stream done ${chalk.cyan(file.path)}`);
            });

            file.readStream.on('error', err => {
                this.socket.emit('fileError', <StreamFileErrorData>({
                    type: 'error',
                    id: file.id,
                    fileName: file.fileName,
                    reason: err.message
                }));

                console.log(`File read stream error ${chalk.red(err.message)}`);

                const index = this.files.findIndex(f => f.id === id);
                if (index < 0) return;

                this.files[index].readStream?.close();
                this.files.splice(index, 1);
            });

            file.readStream.on('data', chunk => {
                chunk = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;

                this.socket.emit('fileChunk', <StreamFileChunkData>({
                    type: 'chunk',
                    id: file.id,
                    fileName: file.fileName,
                    data: chunk
                }));

                console.log(`File chunk sent ${chalk.cyan('File: ' + file.fileName)} | ${chalk.yellow('Size: ' + chunk.length.toLocaleString('en-US') + 'B')}`)
            });
        });

        this.socket.on('fileReceived', id => {
            const index = this.files.findIndex(file => file.id === id);
            if (index < 0) return;

            console.log(`File sent: ${chalk.cyan(`File: ` + this.files[index].path)}`);
            this.files[index].readStream?.close();
            this.files.splice(index, 1);

            if (!this.files.length) this.socket.emit('allDone');
        });
    }

    public sendFile(filePath: string): void {
        if (!existsSync(filePath)) throw new Error(`File doesn't exists: ${chalk.cyan(filePath)}`);
        if (!this.socket.connected) throw new Error(`Not connected to socket`);

        const fileInfo = lstatSync(filePath);
        const pathInfo = path.parse(filePath);
        const fileId = randomUUID();

        if (!fileInfo.isFile()) throw new Error(`Invalid file: ${chalk.cyan(filePath)}`);

        this.socket.emit('fileReady', <StreamFileReadyData>({
            type: 'ready',
            id: fileId,
            fileName: pathInfo.base
        }));

        this.files.push({
            id: fileId,
            fileName: pathInfo.base,
            readStream: null,
            path: filePath
        });

        console.log(`Sending: ${chalk.cyan('File: '+ filePath)} | ${chalk.green('Id: ' + fileId)}`);
    }
}