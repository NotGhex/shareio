#!/usr/bin/env node

import chalk from 'chalk';
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
    .option('-F, --folder [folder]', 'Shared files will appear here')
    .option('-P, --password [password]', 'Add connection password')
    .action(async options => {
        const port = !isNaN(Number(options.port)) ? Number(options.port) : undefined;
        const folder = options.folder ?? process.cwd();

        const host = new Host({
            sharedFilesFolder: folder,
            password: options.password,
        });

        await host.start(port ?? 5523);
    })

command.command('connect')
    .alias('send')
    .argument('<file>', 'Files to send')
    .allowExcessArguments(true)
    .option('-H, --host [host]', 'Receiver\'s server', 'http://127.0.0.1:5523/')
    .option('-P, --password [password]', 'Host password')
    .action(async (arg, options, command) => {
        const host = options.host;
        const files: string[] = command.args ?? [];

        const invalidFiles = files.filter(file => !existsSync(file));
        if (invalidFiles.length) return console.log(`The following file(s) doesn't exists:\n${chalk.cyan(invalidFiles.join("\n"))}`);

        const connect = new Connect({
            server: host,
            password: options.password
        });

        await connect.handleConnection();

        for (const file of files) {
            connect.sendFile(file);
        }
    })

command.parse();