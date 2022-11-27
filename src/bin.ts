#!/usr/bin/env node

import { Command } from 'commander';
import { existsSync } from 'fs';
import { Connect } from './classes/Connect';
import { Host } from './classes/Host';

const command = new Command()
    .name('share')
    .description('Share files');

command.command('host')
    .alias('receive')
    .option('-p, --port [port]', 'Set host port')
    .option('-F, --folder [share files folder]', 'Shared files will appear here')
    .action(async options => {
        const port = !isNaN(Number(options.port)) ? Number(options.port) : undefined;
        const folder = options.folder ?? process.cwd();

        const host = new Host({ sharedFilesFolder: folder });

        await host.start(port ?? 5523);
    })

command.command('connect')
    .alias('send')
    .option('-h, --host [host]', 'Receiver\'s server', 'http://127.0.0.1:5523/')
    .option('-f, --file <share file>', 'File to share')
    .action(async options => {
        const host = options.host;
        const file = options.file;

        if (!existsSync(file)) throw new Error(`File '${file}' doesn't exists`);

        const connect = new Connect({
            server: host
        });

        await connect.handleConnection();
        await connect.sendFile(file);
        connect.socket.close();
    })

command.parse();