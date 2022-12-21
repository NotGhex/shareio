import { BrowserWindow, Menu } from 'electron';
import loadingWindow from './loadingWindow';

export default async function(url?: string, file?: boolean) {
    const loading = await loadingWindow();
    const window = new BrowserWindow({
        height: 600,
        width: 350,
        show: false,
        resizable: false,
        center: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    window.setMenu(null);

    if (url) {
        await (file ? window.loadFile : window.loadURL)(url);
    } else {
        await window.loadFile('../static/index.html');
    }

    window.webContents.openDevTools();

    window.show();
    loading.destroy();

    return window;
}