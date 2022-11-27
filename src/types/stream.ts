import { Encoding } from 'crypto';

export interface BaseStreamFileData {
    type: string;
    id: string;
    fileName: string;
}

export interface StreamFileChunkData extends BaseStreamFileData {
    type: 'chunk';
    data: Buffer;
}

export interface StreamFileErrorData extends BaseStreamFileData {
    type: 'error';
    reason: string;
}

export interface StreamFileDoneData extends BaseStreamFileData {
    type: 'done';
}

export interface StreamFileReadyData extends BaseStreamFileData {
    type: 'ready';
}