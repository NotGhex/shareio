export enum StreamType {
    READY = 1,
    CHUNK,
    DONE,
    ERROR,
    ABORT
}

export type AnyStreamData = DoneStreamData|AbortStreamData|ErrorStreamData|ChunkStreamData|ReadyStreamData;

export interface BaseStreamData {
    type: StreamType;
    file: string;
    id: string;
}

export interface DoneStreamData extends BaseStreamData {
    type: StreamType.DONE;
}

export interface AbortStreamData extends BaseStreamData {
    type: StreamType.ABORT;
}

export interface ErrorStreamData extends BaseStreamData {
    type: StreamType.ERROR;
    reason: string;
}

export interface ChunkStreamData extends BaseStreamData {
    type: StreamType.CHUNK;
    data: Buffer;
}

export interface ReadyStreamData extends BaseStreamData {
    type: StreamType.READY;
}