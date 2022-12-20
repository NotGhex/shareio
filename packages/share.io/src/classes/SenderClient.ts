import { Collection } from '@discordjs/collection';
import { randomUUID } from 'crypto';
import { Awaitable } from 'fallout-utility';
import { createReadStream, existsSync, lstatSync } from 'fs';
import path from 'path';
import { io, ManagerOptions, Socket, SocketOptions } from 'socket.io-client';
import { TypedEmitter } from 'tiny-typed-emitter';
import { SentFileData } from '../types/files';
import { AbortStreamData, AnyStreamData, ReadyStreamData, StreamType } from '../types/stream';
import { ReceiverClientSocketEvents } from './ReceiverClient';

export interface SenderClientOptions {
    socketOptions?: Partial<ManagerOptions & SocketOptions>;
    host: `${'http://'|'https://'}${string}`;
    password?: string;
}

export interface SenderClientEvents {
    ready: (client: SenderClient) => Awaitable<void>;
    fileStreamCreate: (fileData: SentFileData) => Awaitable<void>;
    fileStreamChunk: (fileData: SentFileData, chunk: Buffer) => Awaitable<void>;
    fileStreamError: (fileData: SentFileData, reason: Error) => Awaitable<void>;
    fileStreamDone: (fileData: SentFileData) => Awaitable<void>;
    sentFile: (fileData: SentFileData) => Awaitable<void>;
}

export interface SenderSocketEvents {
    passwordAuth: (password: string) => Awaitable<void>;
    fileStream: (streamData: AnyStreamData) => Awaitable<void>;
}

export class SenderClient extends TypedEmitter<SenderClientEvents> {
    readonly options: SenderClientOptions;
    readonly socket: Socket<ReceiverClientSocketEvents, SenderSocketEvents>;
    readonly files: Collection<string, SentFileData> = new Collection();

    constructor(options: SenderClientOptions) {
        super();

        this.options = options;
        this.socket = io(options.host, options.socketOptions);

        this.socket.on('connect', async () => {
            this.socket.once('passwordRequired', async () => {
                if (!this.options.password) throw new Error(`Password is required`);

                this.socket.emit('passwordAuth', this.options.password);

                this.socket.once('passwordInvalid', () => { throw new Error(`Password is invalid`); });
                this.socket.once('authenticationTimeout', () => { throw new Error(`Authentication timeout`); });
            });

            this.socket.once('ready', () => {
                this._handleSocketMessages();
                this.emit('ready', this);
            });
        });

        this.socket.on('connect_error', err => {
            this.socket.close();
            throw err;
        });
    }

    public async sendFile(filePath: string): Promise<SentFileData> {
        if (!existsSync(filePath)) throw new Error(`File doesn't exists: ${filePath}`);
        if (!this.socket.connected) throw new Error(`Not connected to host`);

        const fileInfo = lstatSync(filePath);
        const pathInfo = path.parse(filePath);
        const fileId = randomUUID();

        if (!fileInfo.isFile()) throw new Error(`Invalid file: ${filePath}`);

        this.socket.emit('fileStream', {
            type: StreamType.READY,
            id: fileId,
            file: pathInfo.base
        });

        const fileData: SentFileData = {
            id: fileId,
            file: pathInfo.base,
            path: filePath,
            readStream: null
        };

        this.files.set(fileData.id, fileData);
        return fileData;
    }

    public async abort(fileId: string, emit: boolean = true): Promise<SentFileData|undefined> {
        const fileData = this.files.find(file => file.id === fileId);
        if (!fileData) return fileData;

        fileData.readStream?.close();

        if (emit) this.socket.emit('fileStream', {
            type: StreamType.ABORT,
            file: fileData.file,
            id: fileData.id
        });

        this.files.delete(fileData.id);
    }

    private _handleSocketMessages(): void {
        this.socket.on('fileStream', async data => {
            const fileData = this.files.find(file => file.id === data.id);
            if (!fileData) return;

            switch (data.type) {
                case StreamType.READY:
                    await this._handleReadyStream(fileData);
                    break;
                case StreamType.ABORT:
                    await this._handleAbortStream(fileData);
                    break;
                case StreamType.DONE:
                    await this._handleDoneStream(fileData);
                    break;
            }
        });
    }

    private async _handleDoneStream(fileData: SentFileData): Promise<void> {
        fileData.readStream?.close();

        this.files.delete(fileData.id);
        this.emit('sentFile', fileData);
    }

    private async _handleAbortStream(fileData: SentFileData): Promise<void> {
        await this.abort(fileData.id);
    }

    private async _handleReadyStream(fileData: SentFileData): Promise<void> {
        fileData.readStream = createReadStream(fileData.path);

        fileData.readStream.on('end', () => {
            this.socket.emit('fileStream', {
                type: StreamType.DONE,
                id: fileData.id,
                file: fileData.file
            });

            this.emit('fileStreamDone', fileData);
        });

        fileData.readStream.on('error', async error => {
            this.socket.emit('fileStream', {
                type: StreamType.ERROR,
                id: fileData.id,
                file: fileData.file,
                reason: error.message
            });

            await this.abort(fileData.id);
            this.emit('fileStreamError', fileData, error);
        });

        fileData.readStream.on('data', chunk => {
            chunk = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;

            this.socket.emit('fileStream', {
                type: StreamType.CHUNK,
                id: fileData.id,
                file: fileData.file,
                data: chunk
            });

            this.emit('fileStreamChunk', fileData, chunk);
        });
    }
}