import { ReadStream, WriteStream } from 'fs';
import { Socket } from 'socket.io';
import { ReceiverClientSocketEvents } from '../classes/ReceiverClient';
import { SenderSocketEvents } from '../classes/SenderClient.js';
import { BaseStreamData } from './stream';

export interface ReceivedFileData extends Omit<BaseStreamData, 'type'> {
    id: string;
    socket: Socket<SenderSocketEvents, ReceiverClientSocketEvents>;
    writeStream: WriteStream;
}

export interface SentFileData extends Omit<BaseStreamData, 'type'> {
    id: string;
    path: string;
    readStream: ReadStream|null;
}