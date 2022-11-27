import { Socket, io } from 'socket.io-client';
import { StreamFileChunkData, StreamFileDoneData, StreamFileErrorData, StreamFileReadyData } from '../types/stream';
import chalk from 'chalk';
import { createReadStream, existsSync, lstatSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export interface ConnectOptions {
    server: string;
    password?: string;
}

export class Connect {
    public socket: Socket;
    public options: ConnectOptions;

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

                res(void 0);
            });

            this.socket.on('disconnect', (reason, description) => {
                console.log(`Disconnected: ${chalk.magenta(this.socket.id)}`);
                res(void 0);
            });

            this.socket.on('connect_error', err => {
                console.log(`Connection error: `, err.stack);
                this.socket.close();
                rej(err);
            });
        });
    }

    public async sendFile(filePath: string): Promise<void> {
        if (!existsSync(filePath)) throw new Error(`File doesn't exists: ${chalk.cyan(filePath)}`);
        if (!this.socket.connected) throw new Error(`Not connected to socket`);

        const fileInfo = lstatSync(filePath);
        const pathInfo = path.parse(filePath);
        const fileId = randomUUID();

        if (!fileInfo.isFile()) throw new Error(`Invalid file: ${chalk.cyan(filePath)}`);

        const file = createReadStream(filePath, {
            autoClose: true,
            emitClose: true,
        });

        await new Promise(async (res, rej) => {
            this.socket.emit('fileReady', <StreamFileReadyData>({
                type: 'ready',
                id: fileId,
                fileName: pathInfo.base
            }));

            console.log(`Sending: ${chalk.cyan('File: '+ filePath)} | ${chalk.green('Id: ' + fileId)}`);

            await new Promise((res, rej) => {
                console.log(chalk.gray(`Waiting for file stream confirmation...`));

                this.socket.on('fileReadyReceived', (id) => {
                    if (id === fileId) return res(void 9);
                });
            });

            file.on('close', () => res(void 0));

            file.on('end', () => {
                this.socket.emit('fileDone', <StreamFileDoneData>({
                    type: 'done',
                    id: fileId,
                    fileName: pathInfo.base
                }));

                console.log(`File sent ${chalk.cyan(filePath)}`);
            });

            file.on('error', err => {
                this.socket.emit('fileError', <StreamFileErrorData>({
                    type: 'error',
                    id: fileId,
                    fileName: pathInfo.base,
                    reason: err.message
                }));

                rej(err);
            });

            file.on('data', chunk => {
                chunk = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;

                this.socket.emit('fileChunk', <StreamFileChunkData>({
                    type: 'chunk',
                    id: fileId,
                    fileName: pathInfo.base,
                    data: chunk
                }));

                console.log(`File chunk sent ${chalk.cyan('File: ' + pathInfo.base)} | ${chalk.yellow('Size: ' + chunk.length.toLocaleString('en-US') + 'B')}`)
            });
        });
    }
}