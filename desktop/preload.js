// Securely expose the local pharmacy API to the React renderer.
const { contextBridge, ipcRenderer } = require('electron');

const call = async (channel, ...args) => {
    const res = await ipcRenderer.invoke(channel, ...args);
    if (!res || res.ok === false) {
        const err = new Error((res && res.error) || 'IPC call failed');
        err.detail = (res && res.error) || 'IPC call failed';
        throw err;
    }
    return res.data;
};

contextBridge.exposeInMainWorld('pharmacyAPI', {
    isElectron: true,
    listItems: () => call('items:list'),
    getItemByBarcode: (code) => call('items:getByBarcode', code),
    getItem: (id) => call('items:get', id),
    createItem: (payload) => call('items:create', payload),
    updateItem: (id, payload) => call('items:update', id, payload),
    deleteItem: (id) => call('items:delete', id),
    checkout: (payload) => call('sales:checkout', payload),
    listSales: () => call('sales:list'),
    dbPath: () => call('app:dbPath'),
    backupSave: () => call('backup:save'),
    backupRestore: () => call('backup:restore'),
});
