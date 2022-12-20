#!/usr/bin/env node

import { SenderClient, ReceiverClient, StreamType } from 'share.io';
import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import chalk from 'chalk';

var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);

const packageJson = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));

const command = new Command()
    .name('shareio')
    .description(packageJson.description)
    .version(packageJson.version, '-v, --version');

command.command('host')
    .alias('receive')
    .option('-p, --port [port]', 'Set host port')
    .option('-F, --folder [folder]', 'Shared files will appear here')
    .option('-P, --password [password]', 'Add connection password')
    .action(async options => {
        const port = !isNaN(Number(options.port)) ? Number(options.port) : undefined;
        const folder = options.folder ?? process.cwd();

        const receiverClient = new ReceiverClient({
            sharedFilesFolder: folder,
            password: options.password,
            port: port ?? 5523,
            passwordTimeout: 10000
        });

        receiverClient.on('ready', () => console.log(`Listening to ${chalk.cyan('http://127.0.0.1:' + (port ?? 5523))}`));
        receiverClient.on('connected', socket => console.log(`Client connected ${chalk.blue('SOCKET: ' + socket.id)}`));
        receiverClient.on('newFile', file => console.log(`Receiving ${chalk.green('FILE: ' + file.file)}`));
        receiverClient.on('receivedFile', file => console.log(`Received ${chalk.green('FILE: ' + file.file)}`));
        receiverClient.on('disconnected', (reason, socket) => console.log(`Disconnected ${chalk.blue('SOCKET: ' + socket.id)} | ${chalk.gray('REASON: ' + reason)}`));
        receiverClient.on('fileStream', data => data.type === StreamType.CHUNK
            ? console.log(`Chunk received ${chalk.green('FILE: ' + data.file)} | ${chalk.magenta('SIZE: ' + (data.data.byteLength / 1024) + 'KB')}`)
            : data.type === StreamType.ERROR
                ? console.error(`An error occured transferring ${chalk.green('FILE: ' + data.file)} | ${chalk.red('ERROR: ' + data.reason)}`)
                : data.type === StreamType.ABORT
                    ? console.log(`File transfer aborted ${chalk.green('FILE: ' + data.file)}`)
                    : void 0);

        await receiverClient.start();
    });

command.command('send')
    .alias('connect')
    .argument('<...files>', 'Files to send')
    .option('-H, --host [host]', 'Receiver\'s server', 'http://127.0.0.1:5523/')
    .option('-P, --password [password]', 'Host password')
    .action(async (arg, options, command) => {
        const host: string = options.host;
        const files: string[] = command.args ?? [];
        const password: string|undefined = options.password;

        const invalidFiles = files.filter(file => !existsSync(file));
        if (invalidFiles.length) return console.log(`The following file(s) doesn't exists:\n${chalk.cyan(invalidFiles.join("\n"))}`);

        console.log(`Connecting to ${chalk.cyan(host)}...`);

        const senderClient = new SenderClient({
            host: host as `http://`,
            password
        });

        senderClient.on('error', error => {
            console.error(`${chalk.red((error.name + ': ') + error.message)}`);
            process.exit(1);
        });

        senderClient.on('fileStreamCreate', file => console.log(`Sending ${chalk.green('FILE: ' + file.path)}`));
        senderClient.on('fileStreamChunk', (file, chunk) => console.log(`Sent chunk ${chalk.green('FILE: ' + file.path)} | ${chalk.magenta('SIZE: ' + (chunk.byteLength / 1024) + 'KB')}`));
        senderClient.on('fileStreamError', (file, error) => console.error(`An error occured transferring ${chalk.green('FILE: ' + file.path)} | ${chalk.red('ERROR: ' + error.message)}`));
        senderClient.on('fileStreamAbort', (file) => console.error(`File transfer aborted ${chalk.green('FILE: ' + file.path)}`));
        senderClient.on('fileStreamDone', file => console.log(`File transfered ${chalk.green('FILE: ' + file.path)}`));
        senderClient.once('disconnect', reason => console.log(`Socket disconnected ${chalk.gray('REASON: ' + reason)}`));

        senderClient.on('sentFile', () => {
            if (!senderClient.files.size) {
                console.log(`Done!`);
                senderClient.socket.disconnect();
            }
        });

        senderClient.once('ready', () => {
            console.log(`Connected to ${chalk.cyan(host)}`);

            for (const file of files) {
                senderClient.sendFile(file);
            }
        });
    });

command.parse();