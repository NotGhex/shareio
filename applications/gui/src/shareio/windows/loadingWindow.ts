import { BrowserWindow } from 'electron';

export default async () => {
    const window = new BrowserWindow({
        height: 200,
        width: 350,
        hasShadow: false,
        focusable: false,
        alwaysOnTop: true,
        movable: false,
        center: true,
        frame: false,
        resizable: false,
        show: false,
    });

    await window.loadFile('../static/loading.html');
    window.show();

    return window;
}