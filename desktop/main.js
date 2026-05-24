// Avicenna Pharmacy — Fully offline Electron main process.
// Bundles the React build + local JSON database. No internet required.

const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db');

let mainWindow;

function wireIpc() {
    const safe = (fn) => async (_evt, ...args) => {
        try {
            return { ok: true, data: await fn(...args) };
        } catch (e) {
            return { ok: false, error: e.message || String(e) };
        }
    };

    ipcMain.handle('items:list', safe(() => db.listItems()));
    ipcMain.handle('items:getByBarcode', safe((code) => db.getItemByBarcode(code)));
    ipcMain.handle('items:get', safe((id) => db.getItem(id)));
    ipcMain.handle('items:create', safe((payload) => db.createItem(payload)));
    ipcMain.handle('items:update', safe((id, payload) => db.updateItem(id, payload)));
    ipcMain.handle('items:delete', safe((id) => db.deleteItem(id)));
    ipcMain.handle('sales:checkout', safe((payload) => db.checkout(payload)));
    ipcMain.handle('sales:list', safe(() => db.listSales()));
    ipcMain.handle('app:dbPath', safe(() => db.getDbPath()));

    ipcMain.handle(
        'backup:save',
        safe(async () => {
            const stamp = new Date().toISOString().slice(0, 10);
            const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
                title: 'Save backup',
                defaultPath: `avicenna-pharmacy-backup-${stamp}.json`,
                filters: [{ name: 'Backup file', extensions: ['json'] }],
            });
            if (canceled || !filePath) return { canceled: true };
            const payload = db.exportAll();
            fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
            return { canceled: false, path: filePath };
        })
    );

    ipcMain.handle(
        'backup:restore',
        safe(async () => {
            const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
                title: 'Choose a backup file to restore',
                properties: ['openFile'],
                filters: [
                    { name: 'Backup file', extensions: ['json'] },
                    { name: 'All files', extensions: ['*'] },
                ],
            });
            if (canceled || !filePaths || filePaths.length === 0) {
                return { canceled: true };
            }
            const raw = fs.readFileSync(filePaths[0], 'utf8');
            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (_e) {
                throw new Error('Selected file is not valid JSON');
            }
            const result = db.importAll(parsed);
            return { canceled: false, ...result, path: filePaths[0] };
        })
    );
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'Avicenna Pharmacy',
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        backgroundColor: '#F9FAFB',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.webContents.session.setPermissionRequestHandler(
        (_wc, permission, callback) => {
            callback(permission === 'media' || permission === 'camera');
        }
    );

    const indexPath = path.join(__dirname, 'app', 'index.html');
    mainWindow.loadFile(indexPath).catch((err) => {
        dialog.showErrorBox(
            'Failed to start Avicenna Pharmacy',
            `Could not load app from:\n${indexPath}\n\n${err.message}\n\nThe app build may be missing. Re-run build-exe.bat.`
        );
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function buildMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Open data folder',
                    click: () => shell.showItemInFolder(db.getDbPath()),
                },
                { type: 'separator' },
                { role: 'reload', label: 'Reload' },
                { role: 'quit', label: 'Exit' },
            ],
        },
        {
            label: 'View',
            submenu: [
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { role: 'resetZoom' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About Avicenna Pharmacy',
                            message: 'Avicenna Pharmacy Desktop',
                            detail: `Version 1.0.0 — Offline edition.\nData file: ${db.getDbPath()}`,
                        });
                    },
                },
            ],
        },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
    db.init(app.getPath('userData'));
    wireIpc();
    buildMenu();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
