import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, Package, Barcode } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import BarcodeScanner from "@/components/BarcodeScanner";
import { api, formatIQD } from "@/lib/api";

const emptyForm = {
    name: "",
    barcode: "",
    buying_price: "",
    selling_price: "",
    supplier: "",
    type: "",
    stock_qty: "",
};

const StoragePage = () => {
    const [items, setItems] = useState([]);
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [editingId, setEditingId] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        try {
            const res = await api.get("/items");
            setItems(res.data);
        } catch (e) {
            toast.error("Failed to load items");
        }
    };
    useEffect(() => {
        load();
    }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return items;
        return items.filter(
            (it) =>
                it.name.toLowerCase().includes(q) ||
                (it.barcode || "").toLowerCase().includes(q) ||
                (it.supplier || "").toLowerCase().includes(q) ||
                (it.type || "").toLowerCase().includes(q)
        );
    }, [items, search]);

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm);
        setOpen(true);
    };

    const openEdit = (it) => {
        setEditingId(it.id);
        setForm({
            name: it.name,
            barcode: it.barcode || "",
            buying_price: String(it.buying_price),
            selling_price: String(it.selling_price),
            supplier: it.supplier,
            type: it.type,
            stock_qty: String(it.stock_qty),
        });
        setOpen(true);
    };

    const onChange = (key, value) => setForm((f) => ({ ...f, [key]: value }));

    const submit = async (e) => {
        e?.preventDefault?.();
        if (!form.name.trim()) return toast.error("Name is required");
        if (form.buying_price === "" || form.selling_price === "")
            return toast.error("Prices are required");

        const payload = {
            name: form.name.trim(),
            barcode: form.barcode.trim() || null,
            buying_price: parseFloat(form.buying_price),
            selling_price: parseFloat(form.selling_price),
            supplier: form.supplier.trim(),
            type: form.type.trim(),
            stock_qty: parseInt(form.stock_qty || "0", 10),
        };

        setSaving(true);
        try {
            if (editingId) {
                await api.put(`/items/${editingId}`, payload);
                toast.success("Item updated");
            } else {
                await api.post("/items", payload);
                toast.success("Item added");
            }
            setOpen(false);
            setForm(emptyForm);
            setEditingId(null);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Save failed");
        } finally {
            setSaving(false);
        }
    };

    const doDelete = async () => {
        if (!confirmDelete) return;
        try {
            await api.delete(`/items/${confirmDelete.id}`);
            toast.success("Item deleted");
            setConfirmDelete(null);
            await load();
        } catch (e) {
            toast.error("Delete failed");
        }
    };

    const stockBadge = (q) => {
        if (q <= 0)
            return (
                <Badge className="rounded-full bg-rose-100 text-rose-700 hover:bg-rose-100">
                    Out of stock
                </Badge>
            );
        if (q <= 10)
            return (
                <Badge className="rounded-full bg-amber-100 text-amber-800 hover:bg-amber-100 low-stock">
                    Low · {q}
                </Badge>
            );
        return (
            <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                {q} in stock
            </Badge>
        );
    };

    const totals = useMemo(() => {
        const inv = items.reduce((s, x) => s + x.buying_price * x.stock_qty, 0);
        const ret = items.reduce((s, x) => s + x.selling_price * x.stock_qty, 0);
        const low = items.filter((x) => x.stock_qty <= 10).length;
        return { inv, ret, low };
    }, [items]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                    label="Total Items"
                    value={items.length}
                    color="emerald"
                    testId="stat-total-items"
                />
                <StatCard
                    label="Inventory Value (cost)"
                    value={formatIQD(totals.inv)}
                    color="indigo"
                    testId="stat-inventory-value"
                />
                <StatCard
                    label="Low / Out of Stock"
                    value={totals.low}
                    color="rose"
                    testId="stat-low-stock"
                />
            </div>

            <div className="bg-white rounded-2xl border border-stone-100 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div className="flex flex-col md:flex-row md:items-center gap-4 mb-5">
                    <div>
                        <h1 className="font-display text-2xl font-bold text-stone-900">
                            Inventory
                        </h1>
                        <p className="text-sm text-stone-500">
                            Manage your pharmacy stock, prices and suppliers.
                        </p>
                    </div>
                    <div className="md:ml-auto flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-72">
                            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <Input
                                data-testid="storage-search-input"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search items…"
                                className="h-11 pl-10 rounded-xl"
                            />
                        </div>
                        <Button
                            data-testid="add-item-button"
                            onClick={openCreate}
                            className="h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-[0_8px_20px_rgba(16,185,129,0.3)]"
                        >
                            <Plus className="w-4 h-4 mr-1" /> Add Item
                        </Button>
                    </div>
                </div>

                <div className="overflow-x-auto" data-testid="storage-table">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase tracking-wide text-stone-500 border-b border-stone-100">
                                <th className="py-3 px-2 font-semibold">Item</th>
                                <th className="py-3 px-2 font-semibold">Type</th>
                                <th className="py-3 px-2 font-semibold">Supplier</th>
                                <th className="py-3 px-2 font-semibold text-right">Buy</th>
                                <th className="py-3 px-2 font-semibold text-right">Sell</th>
                                <th className="py-3 px-2 font-semibold">Stock</th>
                                <th className="py-3 px-2 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                            {filtered.map((it) => (
                                <tr
                                    key={it.id}
                                    data-testid={`storage-row-${it.id}`}
                                    className="hover:bg-stone-50/60"
                                >
                                    <td className="py-3 px-2">
                                        <div className="font-semibold text-stone-900">{it.name}</div>
                                        {it.barcode && (
                                            <div className="text-xs text-stone-400 flex items-center gap-1 mt-0.5">
                                                <Barcode className="w-3 h-3" />
                                                {it.barcode}
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-3 px-2 text-stone-600">{it.type}</td>
                                    <td className="py-3 px-2 text-stone-600">{it.supplier}</td>
                                    <td className="py-3 px-2 text-right text-stone-600">
                                        {formatIQD(it.buying_price)}
                                    </td>
                                    <td className="py-3 px-2 text-right font-display font-bold text-emerald-700">
                                        {formatIQD(it.selling_price)}
                                    </td>
                                    <td className="py-3 px-2">{stockBadge(it.stock_qty)}</td>
                                    <td className="py-3 px-2 text-right">
                                        <div className="inline-flex gap-1">
                                            <button
                                                data-testid={`edit-${it.id}`}
                                                onClick={() => openEdit(it)}
                                                className="w-8 h-8 rounded-lg bg-stone-100 hover:bg-emerald-100 hover:text-emerald-700 text-stone-600 flex items-center justify-center btn-soft"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                data-testid={`delete-${it.id}`}
                                                onClick={() => setConfirmDelete(it)}
                                                className="w-8 h-8 rounded-lg bg-stone-100 hover:bg-rose-100 hover:text-rose-700 text-stone-600 flex items-center justify-center btn-soft"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="py-12 text-center text-stone-400">
                                        <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                        No items found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add / Edit Dialog */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    data-testid="item-form-dialog"
                    className="rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto"
                >
                    <DialogHeader>
                        <DialogTitle className="font-display">
                            {editingId ? "Edit Item" : "Add New Item"}
                        </DialogTitle>
                        <DialogDescription>
                            Fill in the details. Barcode is optional.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field label="Name *" testId="form-name">
                                <Input
                                    data-testid="form-name-input"
                                    value={form.name}
                                    onChange={(e) => onChange("name", e.target.value)}
                                    className="h-11 rounded-xl"
                                    placeholder="e.g. Paracetamol 500mg"
                                />
                            </Field>
                            <Field label="Type (free text)" testId="form-type">
                                <Input
                                    data-testid="form-type-input"
                                    value={form.type}
                                    onChange={(e) => onChange("type", e.target.value)}
                                    className="h-11 rounded-xl"
                                    placeholder="e.g. Tablet, Syrup, Injection"
                                />
                            </Field>
                            <Field label="Buying Price (IQD) *" testId="form-buy">
                                <Input
                                    data-testid="form-buy-input"
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={form.buying_price}
                                    onChange={(e) => onChange("buying_price", e.target.value)}
                                    className="h-11 rounded-xl"
                                />
                            </Field>
                            <Field label="Selling Price (IQD) *" testId="form-sell">
                                <Input
                                    data-testid="form-sell-input"
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={form.selling_price}
                                    onChange={(e) => onChange("selling_price", e.target.value)}
                                    className="h-11 rounded-xl"
                                />
                            </Field>
                            <Field label="Supplier" testId="form-supplier">
                                <Input
                                    data-testid="form-supplier-input"
                                    value={form.supplier}
                                    onChange={(e) => onChange("supplier", e.target.value)}
                                    className="h-11 rounded-xl"
                                    placeholder="e.g. Pioneer Pharma"
                                />
                            </Field>
                            <Field label="Stock Quantity" testId="form-stock">
                                <Input
                                    data-testid="form-stock-input"
                                    type="number"
                                    min="0"
                                    value={form.stock_qty}
                                    onChange={(e) => onChange("stock_qty", e.target.value)}
                                    className="h-11 rounded-xl"
                                />
                            </Field>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-stone-600 mb-1.5 block uppercase tracking-wide">
                                Barcode (optional)
                            </label>
                            <Input
                                data-testid="form-barcode-input"
                                value={form.barcode}
                                onChange={(e) => onChange("barcode", e.target.value)}
                                className="h-11 rounded-xl"
                                placeholder="Type or scan a barcode"
                            />
                            <div className="mt-3">
                                <BarcodeScanner
                                    testIdPrefix="storage-scanner"
                                    onDetected={(code) => {
                                        onChange("barcode", code);
                                        toast.success("Barcode captured");
                                    }}
                                />
                            </div>
                        </div>

                        <DialogFooter className="gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setOpen(false)}
                                data-testid="form-cancel"
                                className="rounded-xl"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={saving}
                                data-testid="form-submit"
                                className="bg-emerald-500 hover:bg-emerald-600 rounded-xl"
                            >
                                {saving ? "Saving…" : editingId ? "Save Changes" : "Add Item"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete confirm */}
            <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
                <AlertDialogContent data-testid="delete-confirm-dialog" className="rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmDelete?.name} will be permanently removed from inventory.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel data-testid="delete-cancel" className="rounded-xl">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            data-testid="delete-confirm"
                            onClick={doDelete}
                            className="bg-rose-500 hover:bg-rose-600 rounded-xl"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

const Field = ({ label, children, testId }) => (
    <div data-testid={testId}>
        <label className="text-xs font-semibold text-stone-600 mb-1.5 block uppercase tracking-wide">
            {label}
        </label>
        {children}
    </div>
);

const StatCard = ({ label, value, color, testId }) => {
    const map = {
        emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
        indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
        rose: "bg-rose-50 text-rose-700 border-rose-100",
    };
    return (
        <div
            data-testid={testId}
            className={`rounded-2xl border p-5 ${map[color]}`}
        >
            <div className="text-xs uppercase tracking-wide font-semibold opacity-80">
                {label}
            </div>
            <div className="font-display text-3xl font-bold mt-2">{value}</div>
        </div>
    );
};

export default StoragePage;
