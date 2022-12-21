import { app, BrowserWindow } from 'electron';
import mainWindow from './shareio/windows/mainWindow';

app.on('ready', async () => {
    const window = await mainWindow();
});