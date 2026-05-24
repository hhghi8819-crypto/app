// Local JSON-file database for the offline desktop pharmacy.
// Stored at Electron's userData path so it survives app updates.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let DB_PATH = null;
let data = { items: [], sales: [] };

const SEED_ITEMS = [
    { name: 'Paracetamol 500mg', barcode: '6291100100015', buying_price: 750, selling_price: 1250, supplier: 'Pioneer Pharma', type: 'Tablet', stock_qty: 120 },
    { name: 'Amoxicillin 250mg', barcode: '6291100100022', buying_price: 2500, selling_price: 3500, supplier: 'Pioneer Pharma', type: 'Capsule', stock_qty: 60 },
    { name: 'Ibuprofen 400mg', barcode: '6291100100039', buying_price: 1000, selling_price: 1750, supplier: 'Awa Medica', type: 'Tablet', stock_qty: 90 },
    { name: 'Vitamin C 1000mg', barcode: '6291100100046', buying_price: 3000, selling_price: 5000, supplier: 'NutriPlus', type: 'Effervescent', stock_qty: 45 },
    { name: 'Cough Syrup 120ml', barcode: '6291100100053', buying_price: 2750, selling_price: 4500, supplier: 'Awa Medica', type: 'Syrup', stock_qty: 30 },
    { name: 'Loratadine 10mg', barcode: '6291100100060', buying_price: 1500, selling_price: 2500, supplier: 'Pioneer Pharma', type: 'Tablet', stock_qty: 75 },
    { name: 'Bandage Roll', barcode: '6291100100077', buying_price: 500, selling_price: 1000, supplier: 'MedSupply Co', type: 'First Aid', stock_qty: 200 },
    { name: 'Antiseptic Solution 250ml', barcode: '6291100100084', buying_price: 2000, selling_price: 3500, supplier: 'MedSupply Co', type: 'Antiseptic', stock_qty: 40 },
    { name: 'Insulin Pen', barcode: '6291100100091', buying_price: 18000, selling_price: 25000, supplier: 'Novo Pharm', type: 'Injection', stock_qty: 15 },
    { name: 'Omeprazole 20mg', barcode: '6291100100107', buying_price: 2000, selling_price: 3250, supplier: 'Awa Medica', type: 'Capsule', stock_qty: 5 },
    { name: 'Hydrocortisone Cream', barcode: '6291100100114', buying_price: 1750, selling_price: 3000, supplier: 'DermaCare', type: 'Ointment', stock_qty: 25 },
    { name: 'Surgical Mask (50pcs)', barcode: '6291100100121', buying_price: 4000, selling_price: 7500, supplier: 'MedSupply Co', type: 'PPE', stock_qty: 80 },
];

const nowIso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

function persist() {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function init(userDataPath) {
    DB_PATH = path.join(userDataPath, 'pharmacy.json');

    // One-time migration from previous app folder (renamed from "Avicenna Pharmacy").
    // If there's no data yet here but the old folder has a pharmacy.json, copy it.
    if (!fs.existsSync(DB_PATH)) {
        try {
            const parent = path.dirname(userDataPath);
            const oldCandidates = ['Avicenna Pharmacy'];
            for (const oldName of oldCandidates) {
                const oldPath = path.join(parent, oldName, 'pharmacy.json');
                if (fs.existsSync(oldPath)) {
                    fs.mkdirSync(userDataPath, { recursive: true });
                    fs.copyFileSync(oldPath, DB_PATH);
                    console.log(`Migrated existing data from "${oldName}" to current folder.`);
                    break;
                }
            }
        } catch (e) {
            console.warn('Auto-migration of legacy data folder failed:', e);
        }
    }

    try {
        if (fs.existsSync(DB_PATH)) {
            const raw = fs.readFileSync(DB_PATH, 'utf8');
            data = JSON.parse(raw);
            if (!Array.isArray(data.items)) data.items = [];
            if (!Array.isArray(data.sales)) data.sales = [];
        }
    } catch (e) {
        console.error('Failed to load pharmacy.json, starting fresh:', e);
        data = { items: [], sales: [] };
    }

    if (data.items.length === 0) {
        data.items = SEED_ITEMS.map((raw) => ({
            id: uuid(),
            created_at: nowIso(),
            sheets_per_pack: null,
            sheet_selling_price: null,
            loose_sheets: 0,
            ...raw,
        }));
        persist();
        console.log(`Seeded ${data.items.length} pharmacy items at ${DB_PATH}`);
    } else {
        // Migrate older items to include new sheet-tracking fields
        let migrated = false;
        data.items = data.items.map((it) => {
            const next = {
                sheets_per_pack: null,
                sheet_selling_price: null,
                loose_sheets: 0,
                ...it,
            };
            if (next !== it) migrated = true;
            return next;
        });
        if (migrated) persist();
    }
}

function listItems() {
    return [...data.items].sort((a, b) => a.name.localeCompare(b.name));
}

function getItemByBarcode(barcode) {
    const it = data.items.find((x) => x.barcode === barcode);
    if (!it) {
        const err = new Error('Item not found');
        err.code = 404;
        throw err;
    }
    return it;
}

function getItem(id) {
    const it = data.items.find((x) => x.id === id);
    if (!it) {
        const err = new Error('Item not found');
        err.code = 404;
        throw err;
    }
    return it;
}

function createItem(payload) {
    if (!payload || !payload.name || !payload.name.trim()) {
        throw new Error('Name is required');
    }
    if (payload.barcode) {
        const dup = data.items.find((x) => x.barcode === payload.barcode);
        if (dup) throw new Error('An item with this barcode already exists');
    }
    const sheetsPerPack = parseInt(payload.sheets_per_pack, 10);
    const hasSheets = Number.isFinite(sheetsPerPack) && sheetsPerPack > 0;
    if (hasSheets) {
        const sheetPrice = Number(payload.sheet_selling_price);
        if (!Number.isFinite(sheetPrice) || sheetPrice <= 0) {
            throw new Error('Sheet selling price is required when sheets per pack is set');
        }
    }
    const item = {
        id: uuid(),
        created_at: nowIso(),
        name: String(payload.name).trim(),
        barcode: payload.barcode ? String(payload.barcode).trim() : null,
        buying_price: Number(payload.buying_price) || 0,
        selling_price: Number(payload.selling_price) || 0,
        supplier: payload.supplier ? String(payload.supplier).trim() : '',
        type: payload.type ? String(payload.type).trim() : '',
        stock_qty: parseInt(payload.stock_qty, 10) || 0,
        sheets_per_pack: hasSheets ? sheetsPerPack : null,
        sheet_selling_price: hasSheets ? Number(payload.sheet_selling_price) : null,
        loose_sheets: parseInt(payload.loose_sheets, 10) || 0,
        buying_bill_number: payload.buying_bill_number
            ? String(payload.buying_bill_number).trim()
            : null,
        expiry_date: payload.expiry_date ? String(payload.expiry_date).trim() : null,
    };
    data.items.push(item);
    persist();
    return item;
}

function updateItem(id, payload) {
    const idx = data.items.findIndex((x) => x.id === id);
    if (idx === -1) throw new Error('Item not found');
    const updates = { ...payload };
    if (updates.barcode) {
        const conflict = data.items.find(
            (x) => x.barcode === updates.barcode && x.id !== id
        );
        if (conflict) throw new Error('Another item already uses this barcode');
    }
    const allowed = [
        'name', 'barcode', 'buying_price', 'selling_price',
        'supplier', 'type', 'stock_qty',
        'sheets_per_pack', 'sheet_selling_price', 'loose_sheets',
        'buying_bill_number', 'expiry_date',
    ];
    for (const key of allowed) {
        if (updates[key] === undefined) continue;
        if (key === 'buying_price' || key === 'selling_price' || key === 'sheet_selling_price') {
            if (updates[key] === null || updates[key] === '') {
                data.items[idx][key] = key === 'sheet_selling_price' ? null : 0;
            } else {
                data.items[idx][key] = Number(updates[key]) || 0;
            }
        } else if (key === 'stock_qty' || key === 'sheets_per_pack' || key === 'loose_sheets') {
            if (updates[key] === null || updates[key] === '') {
                data.items[idx][key] = key === 'sheets_per_pack' ? null : 0;
            } else {
                data.items[idx][key] = parseInt(updates[key], 10) || 0;
            }
        } else if (key === 'barcode' || key === 'buying_bill_number' || key === 'expiry_date') {
            data.items[idx][key] = updates[key] ? String(updates[key]).trim() : null;
        } else {
            data.items[idx][key] = String(updates[key]).trim();
        }
    }
    // Sanity: if sheets_per_pack is set, sheet price must be > 0
    const it = data.items[idx];
    if (it.sheets_per_pack && it.sheets_per_pack > 0) {
        if (!it.sheet_selling_price || it.sheet_selling_price <= 0) {
            throw new Error('Sheet selling price is required when sheets per pack is set');
        }
    } else {
        // Clear sheet-only fields when sheets disabled
        it.sheets_per_pack = null;
        it.sheet_selling_price = null;
        it.loose_sheets = 0;
    }
    persist();
    return data.items[idx];
}

function deleteItem(id) {
    const idx = data.items.findIndex((x) => x.id === id);
    if (idx === -1) throw new Error('Item not found');
    data.items.splice(idx, 1);
    persist();
    return { ok: true };
}

function checkout(payload) {
    const cart = (payload && payload.items) || [];
    if (cart.length === 0) throw new Error('No items in cart');

    // Normalise + validate per line
    const norm = cart.map((ci) => {
        const qty = parseInt(ci.qty, 10);
        if (!qty || qty <= 0) throw new Error('Invalid quantity');
        return {
            item_id: ci.item_id,
            qty,
            mode: ci.mode === 'sheet' ? 'sheet' : 'pack',
        };
    });

    // Group by item to validate combined availability
    const grouped = {};
    for (const ci of norm) {
        if (!grouped[ci.item_id]) grouped[ci.item_id] = { packs: 0, sheets: 0 };
        grouped[ci.item_id][ci.mode === 'sheet' ? 'sheets' : 'packs'] += ci.qty;
    }

    for (const itemId of Object.keys(grouped)) {
        const it = data.items.find((x) => x.id === itemId);
        if (!it) throw new Error(`Item ${itemId} not found`);
        const { packs, sheets } = grouped[itemId];
        const sheetsPerPack = it.sheets_per_pack || 0;
        const looseSheets = it.loose_sheets || 0;

        if (packs > it.stock_qty) {
            throw new Error(`Insufficient packs for ${it.name} (have ${it.stock_qty})`);
        }
        if (sheets > 0) {
            if (!sheetsPerPack) {
                throw new Error(`${it.name} cannot be sold by the sheet`);
            }
            const sheetsAvailable = (it.stock_qty - packs) * sheetsPerPack + looseSheets;
            if (sheets > sheetsAvailable) {
                throw new Error(
                    `Insufficient sheets for ${it.name} (have ${sheetsAvailable})`
                );
            }
        }
    }

    // Build sale lines
    const lines = [];
    let total = 0;
    for (const ci of norm) {
        const it = data.items.find((x) => x.id === ci.item_id);
        const unit_price =
            ci.mode === 'sheet'
                ? Number(it.sheet_selling_price || 0)
                : Number(it.selling_price);
        const subtotal = unit_price * ci.qty;
        total += subtotal;
        lines.push({
            item_id: it.id,
            name: it.name,
            qty: ci.qty,
            unit_price,
            subtotal,
            mode: ci.mode,
        });
    }

    // Apply stock decrements (packs first, then sheets — may open new packs)
    for (const itemId of Object.keys(grouped)) {
        const it = data.items.find((x) => x.id === itemId);
        const { packs, sheets } = grouped[itemId];
        const sheetsPerPack = it.sheets_per_pack || 0;

        it.stock_qty -= packs;

        let sheetsToSell = sheets;
        let loose = it.loose_sheets || 0;
        while (sheetsToSell > 0) {
            if (loose > 0) {
                const take = Math.min(loose, sheetsToSell);
                loose -= take;
                sheetsToSell -= take;
            } else if (it.stock_qty > 0) {
                it.stock_qty -= 1;
                loose = sheetsPerPack;
            } else {
                throw new Error(`Stock inconsistency for ${it.name}`);
            }
        }
        it.loose_sheets = loose;
    }

    const sale = {
        id: uuid(),
        lines,
        subtotal: total,
        discount: Number(payload.discount) || 0,
        total: total - (Number(payload.discount) || 0),
        created_at: nowIso(),
    };
    data.sales.unshift(sale);
    persist();
    return sale;
}

function listSales() {
    return data.sales;
}

function getDbPath() {
    return DB_PATH;
}

function exportAll() {
    return {
        version: 1,
        app: 'Jory Corner Pharmacy',
        exported_at: nowIso(),
        items: data.items,
        sales: data.sales,
    };
}

function importAll(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Backup file is empty or unreadable');
    }
    if (!Array.isArray(payload.items)) {
        throw new Error('Backup file is invalid: missing "items" list');
    }
    // Basic shape validation on each item
    for (const it of payload.items) {
        if (!it || typeof it !== 'object' || !it.id || !it.name) {
            throw new Error('Backup file is invalid: malformed item entry');
        }
    }
    data.items = payload.items;
    data.sales = Array.isArray(payload.sales) ? payload.sales : [];
    persist();
    return { items: data.items.length, sales: data.sales.length };
}

module.exports = {
    init,
    listItems,
    getItem,
    getItemByBarcode,
    createItem,
    updateItem,
    deleteItem,
    checkout,
    listSales,
    getDbPath,
    exportAll,
    importAll,
};
