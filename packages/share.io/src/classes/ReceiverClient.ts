import { Collection } from '@discordjs/collection';
import { Awaitable } from 'fallout-utility';
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import { Server, ServerOptions, Socket } from 'socket.io';
import { TypedEmitter } from 'tiny-typed-emitter';
import { ReceivedFileData } from '../types/files';
import { AbortStreamData, AnyStreamData, ChunkStreamData, ErrorStreamData, ReadyStreamData, StreamType } from '../types/stream';
import { SenderSocketEvents } from './SenderClient.js';
import { setTimeout as setTimeoutAsync } from 'timers/promises';

export interface ReceiverClientOptions {
    socketServerOptions?: Partial<ServerOptions>;
    password?: string;
    passwordTimeout?: number;
    port: number;
    sharedFilesFolder: string;
}

export interface ReceiverClientEvents {
    ready: (client: ReceiverClient, port: number) => Awaitable<void>;
    connected: (socket: Socket<SenderSocketEvents>, client: ReceiverClient) => Awaitable<void>;
    newFile: (data: ReceivedFileData) => Awaitable<void>;
    fileStream: (data: AnyStreamData) => Awaitable<void>;
    receivedFile: (data: ReceivedFileData) => Awaitable<void>;
}

export interface ReceiverClientSocketEvents {
    ready: () => Awaitable<void>;
    passwordRequired: () => Awaitable<void>;
    passwordInvalid: () => Awaitable<void>;
    authenticationTimeout: () => Awaitable<void>;
    fileStream: (data: AnyStreamData) => Awaitable<void>;
}

export class ReceiverClient extends TypedEmitter<ReceiverClientEvents> {
    readonly options: ReceiverClientOptions;
    readonly server: Server<SenderSocketEvents, ReceiverClientSocketEvents>;
    readonly files: Collection<string, ReceivedFileData> = new Collection();

    constructor(options: ReceiverClientOptions) {
        super();

        this.options = options;
        this.server = new Server(options.socketServerOptions);
    }

    public async start(): Promise<void> {
        this._handleNewSocketConnections();
        this.server.listen(this.options.port);
        this.emit('ready', this, this.options.port);
    }

    public async abort(fileId: string, disconnect?: boolean): Promise<ReceivedFileData|undefined> {
        const fileData = this.files.find(file => file.id === fileId);
        if (!fileData) return fileData;

        fileData.writeStream.close();

        const file = path.join(this.options.sharedFilesFolder, fileData.file);

        if (existsSync(file)) rmSync(file, { recursive: true, force: true });
        if (disconnect && !fileData.socket.disconnected) fileData.socket.emit('fileStream', {
            type: StreamType.ABORT,
            file: fileData.file,
            id: fileData.id
        });

        this.files.delete(fileData.id);

        return fileData;
    }

    private _handleNewSocketConnections(): void {
        this.server.on('connection', async socket => {
            if (this.options.password) socket.emit('passwordRequired');

            const allowConnection = !this.options.password || await new Promise(res => {
                if (this.options.passwordTimeout) {
                    setTimeout(() => {
                        socket.emit('authenticationTimeout');
                        res(true);
                    }, this.options.passwordTimeout);
                }

                socket.once('passwordAuth', password => {
                    if (password === this.options.password) res(true);
                    socket.emit('passwordInvalid');
                    res(false);
                });
            });

            if (!allowConnection) return socket.disconnect(true);

            socket.emit('ready');
            this.emit('connected', socket, this);
            this._listenToSocketEvents(socket);
        });
    }

    private _listenToSocketEvents(socket: Socket<SenderSocketEvents, ReceiverClientSocketEvents>): void {
        socket.on('fileStream', async streamData => {
            this.emit('fileStream', streamData);

            switch (streamData.type) {
                case StreamType.READY:
                    await this._handleReadyFileStream(socket, streamData);
                    break;
                case StreamType.CHUNK:
                    await this._handleChunkFileStream(socket, streamData);
                    break;
                case StreamType.ERROR:
                    await this._handleAbortFileStream(socket, streamData);
                    break;
                case StreamType.ABORT:
                    await this._handleAbortFileStream(socket, streamData);
                    break;
                case StreamType.DONE:
                    await this._handleDoneFileStream(socket, streamData);
                    break;
            }
        });

        socket.on('disconnect', async () => {
            await setTimeoutAsync(1000);
            await Promise.all(this.files
                .filter(file => file.socket.id === socket.id)
                .map(async fileData => this.abort(fileData.id, true)));
        });
    }

    private async _handleDoneFileStream(socket: Socket<SenderSocketEvents, ReceiverClientSocketEvents>, data: AnyStreamData): Promise<void> {
        const fileData = this.files.find(file => file.id === data.id && file.socket.id === socket.id);
        if (!fileData) return;

        fileData.writeStream.close();

        socket.emit('fileStream', data);
        this.emit('receivedFile', fileData);
        this.files.delete(fileData.id);
    }

    private async _handleAbortFileStream(socket: Socket<SenderSocketEvents, ReceiverClientSocketEvents>, data: AbortStreamData|ErrorStreamData): Promise<void> {
        const fileData = this.files.find(file => file.id === data.id && file.socket.id === socket.id);
        if (fileData?.id) await this.abort(fileData.id);
    }

    private async _handleChunkFileStream(socket: Socket<SenderSocketEvents, ReceiverClientSocketEvents>, data: ChunkStreamData): Promise<void> {
        const fileData = this.files.find(file => file.id === data.id && file.socket.id === socket.id);

        fileData?.writeStream.write(data.data);
    }

    private async _handleReadyFileStream(socket: Socket<SenderSocketEvents, ReceiverClientSocketEvents>, data: ReadyStreamData): Promise<ReceivedFileData> {
        let fileName = data.file;

        if (!existsSync(this.options.sharedFilesFolder)) mkdirSync(this.options.sharedFilesFolder, { recursive: true });
        if (existsSync(path.join(this.options.sharedFilesFolder, fileName))) {
            const pathInfo = path.parse(fileName);
            fileName = pathInfo.name + ' (1)' + pathInfo.ext;
        }

        const fileData: ReceivedFileData = {
            file: fileName,
            id: data.id,
            socket: socket,
            writeStream: createWriteStream(path.join(this.options.sharedFilesFolder, fileName))
        };

        this.files.set(fileData.id, fileData);
        this.emit('newFile', fileData);
        socket.emit('fileStream', data);

        return fileData;
    }
}