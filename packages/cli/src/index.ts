#!/usr/bin/env node

import { SenderClient, ReceiverClient } from 'share.io';
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

        const host = new ReceiverClient({
            sharedFilesFolder: folder,
            password: options.password,
            port: port ?? 5523,
            passwordTimeout: 10000
        });

        await host.start();
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

        const senderClient = new SenderClient({
            host: host as `http://`,
            password
        });

        senderClient.on('error', error => {
            console.error(`${chalk.red((error.name + ': ') + error.message)}`);
            process.exit(1);
        });

        for (const file of files) {
            senderClient.sendFile(file);
        }
    });