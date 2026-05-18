import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Search, Plus, Minus, Trash2, ShoppingBag, CheckCircle2, Barcode } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import BarcodeScanner from "@/components/BarcodeScanner";
import { api, formatIQD } from "@/lib/api";

const CashierPage = () => {
    const [items, setItems] = useState([]);
    const [search, setSearch] = useState("");
    const [cart, setCart] = useState([]); // [{id,name,unit_price,qty,stock_qty}]
    const [barcodeInput, setBarcodeInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [summary, setSummary] = useState(null);
    const barcodeRef = useRef(null);

    const loadItems = async () => {
        try {
            const res = await api.get("/items");
            setItems(res.data);
        } catch (e) {
            toast.error("Failed to load items");
        }
    };

    useEffect(() => {
        loadItems();
        // auto-focus barcode for USB scanners
        setTimeout(() => barcodeRef.current?.focus(), 300);
    }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return items;
        return items.filter(
            (it) =>
                it.name.toLowerCase().includes(q) ||
                (it.barcode || "").toLowerCase().includes(q) ||
                (it.type || "").toLowerCase().includes(q)
        );
    }, [items, search]);

    const addToCart = (item) => {
        if (!item) return;
        if (item.stock_qty <= 0) {
            toast.error(`${item.name} is out of stock`);
            return;
        }
        setCart((prev) => {
            const existing = prev.find((x) => x.id === item.id);
            if (existing) {
                if (existing.qty + 1 > item.stock_qty) {
                    toast.error(`Only ${item.stock_qty} in stock`);
                    return prev;
                }
                return prev.map((x) =>
                    x.id === item.id ? { ...x, qty: x.qty + 1 } : x
                );
            }
            return [
                ...prev,
                {
                    id: item.id,
                    name: item.name,
                    unit_price: item.selling_price,
                    qty: 1,
                    stock_qty: item.stock_qty,
                },
            ];
        });
    };

    const inc = (id) => {
        setCart((prev) =>
            prev.map((x) => {
                if (x.id !== id) return x;
                if (x.qty + 1 > x.stock_qty) {
                    toast.error(`Only ${x.stock_qty} in stock`);
                    return x;
                }
                return { ...x, qty: x.qty + 1 };
            })
        );
    };

    const dec = (id) => {
        setCart((prev) =>
            prev.flatMap((x) => {
                if (x.id !== id) return [x];
                if (x.qty - 1 <= 0) return [];
                return [{ ...x, qty: x.qty - 1 }];
            })
        );
    };

    const remove = (id) => setCart((prev) => prev.filter((x) => x.id !== id));

    const handleBarcodeSubmit = async (codeOverride) => {
        const code = (codeOverride ?? barcodeInput).trim();
        if (!code) return;
        try {
            const res = await api.get(`/items/by-barcode/${encodeURIComponent(code)}`);
            addToCart(res.data);
            toast.success(`Added ${res.data.name}`);
        } catch (e) {
            toast.error("No item with that barcode");
        } finally {
            setBarcodeInput("");
            barcodeRef.current?.focus();
        }
    };

    const total = cart.reduce((s, x) => s + x.unit_price * x.qty, 0);

    const checkout = async () => {
        if (cart.length === 0) return;
        setLoading(true);
        try {
            const payload = { items: cart.map((c) => ({ item_id: c.id, qty: c.qty })) };
            const res = await api.post("/sales/checkout", payload);
            setSummary(res.data);
            setCart([]);
            await loadItems();
            toast.success("Sale completed");
        } catch (e) {
            toast.error(e.response?.data?.detail || "Checkout failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
            {/* LEFT: Search + Items */}
            <section className="space-y-5">
                <div className="bg-white rounded-2xl border border-stone-100 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <h1 className="font-display text-2xl font-bold text-stone-900 mb-1">
                        Point of Sale
                    </h1>
                    <p className="text-sm text-stone-500 mb-5">
                        Scan a barcode or search to add items to the bill.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-stone-600 mb-1.5 block uppercase tracking-wide">
                                Barcode (scanner-friendly)
                            </label>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    handleBarcodeSubmit();
                                }}
                            >
                                <div className="relative">
                                    <Barcode className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <Input
                                        ref={barcodeRef}
                                        data-testid="cashier-barcode-input"
                                        value={barcodeInput}
                                        onChange={(e) => setBarcodeInput(e.target.value)}
                                        placeholder="Scan or type barcode, press Enter"
                                        className="h-12 pl-10 rounded-xl"
                                    />
                                </div>
                            </form>
                            <div className="mt-3">
                                <BarcodeScanner
                                    testIdPrefix="cashier-scanner"
                                    onDetected={(code) => handleBarcodeSubmit(code)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-stone-600 mb-1.5 block uppercase tracking-wide">
                                Search
                            </label>
                            <div className="relative">
                                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <Input
                                    data-testid="cashier-search-input"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search by name, type, barcode…"
                                    className="h-12 pl-10 rounded-xl"
                                />
                            </div>
                            <div className="mt-3 p-3 rounded-xl bg-emerald-50/70 border border-emerald-100">
                                <div className="text-xs text-emerald-800">
                                    <span className="font-bold">Tip:</span> USB barcode scanners
                                    type into the barcode field and auto-submit on Enter.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-stone-100 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-display text-lg font-bold text-stone-900">
                            Items ({filtered.length})
                        </h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="cashier-items-grid">
                        {filtered.map((it) => {
                            const out = it.stock_qty <= 0;
                            return (
                                <button
                                    type="button"
                                    key={it.id}
                                    data-testid={`cashier-item-${it.id}`}
                                    onClick={() => addToCart(it)}
                                    disabled={out}
                                    className={`text-left p-4 rounded-xl border transition btn-soft ${
                                        out
                                            ? "bg-stone-50 border-stone-100 opacity-60 cursor-not-allowed"
                                            : "bg-white border-stone-100 hover:border-emerald-300 hover:shadow-[0_8px_20px_rgba(16,185,129,0.12)]"
                                    }`}
                                >
                                    <div className="text-xs text-emerald-700 font-semibold mb-1">
                                        {it.type}
                                    </div>
                                    <div className="font-semibold text-stone-900 leading-tight line-clamp-2 min-h-[2.5rem]">
                                        {it.name}
                                    </div>
                                    <div className="flex items-center justify-between mt-3">
                                        <div className="font-display font-bold text-emerald-700">
                                            {formatIQD(it.selling_price)}
                                        </div>
                                        <Badge
                                            variant="secondary"
                                            className={`rounded-full text-[10px] ${
                                                it.stock_qty <= 0
                                                    ? "bg-rose-100 text-rose-700"
                                                    : it.stock_qty <= 10
                                                    ? "bg-amber-100 text-amber-800 low-stock"
                                                    : "bg-emerald-100 text-emerald-700"
                                            }`}
                                        >
                                            {it.stock_qty} left
                                        </Badge>
                                    </div>
                                </button>
                            );
                        })}
                        {filtered.length === 0 && (
                            <div className="col-span-full text-center py-12 text-stone-400">
                                No items match your search.
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* RIGHT: Cart */}
            <aside className="bg-white rounded-2xl border border-stone-100 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display text-xl font-bold text-stone-900 flex items-center gap-2">
                        <ShoppingBag className="w-5 h-5 text-emerald-600" />
                        Current Bill
                    </h2>
                    <Badge variant="secondary" className="rounded-full bg-stone-100 text-stone-700">
                        {cart.length} {cart.length === 1 ? "item" : "items"}
                    </Badge>
                </div>

                {cart.length === 0 ? (
                    <div className="cart-empty-illustration flex-1 rounded-xl flex flex-col items-center justify-center py-12 px-4 text-center min-h-[260px]">
                        <ShoppingBag className="w-10 h-10 text-emerald-400 mb-3" strokeWidth={1.5} />
                        <div className="font-semibold text-stone-700">Bill is empty</div>
                        <div className="text-sm text-stone-500 mt-1">
                            Scan or click items to add.
                        </div>
                    </div>
                ) : (
                    <ScrollArea className="flex-1 -mx-2 px-2 max-h-[520px]">
                        <ul className="divide-y divide-stone-100" data-testid="cart-list">
                            {cart.map((c) => (
                                <li
                                    key={c.id}
                                    data-testid={`cart-item-${c.id}`}
                                    className="py-3 flex items-start gap-3"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-stone-900 text-sm leading-tight truncate">
                                            {c.name}
                                        </div>
                                        <div className="text-xs text-stone-500 mt-0.5">
                                            {formatIQD(c.unit_price)} each
                                        </div>
                                        <div className="flex items-center gap-2 mt-2">
                                            <button
                                                type="button"
                                                data-testid={`cart-dec-${c.id}`}
                                                onClick={() => dec(c.id)}
                                                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-rose-100 hover:text-rose-700 text-stone-700 flex items-center justify-center btn-soft"
                                                aria-label="Decrease"
                                            >
                                                <Minus className="w-4 h-4" />
                                            </button>
                                            <span
                                                data-testid={`cart-qty-${c.id}`}
                                                className="font-display font-bold text-stone-900 w-7 text-center"
                                            >
                                                {c.qty}
                                            </span>
                                            <button
                                                type="button"
                                                data-testid={`cart-inc-${c.id}`}
                                                onClick={() => inc(c.id)}
                                                className="w-8 h-8 rounded-full bg-emerald-100 hover:bg-emerald-500 hover:text-white text-emerald-700 flex items-center justify-center btn-soft"
                                                aria-label="Increase"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                data-testid={`cart-remove-${c.id}`}
                                                onClick={() => remove(c.id)}
                                                className="ml-auto text-stone-400 hover:text-rose-600 btn-soft"
                                                aria-label="Remove"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <div
                                        className="text-right font-display font-bold text-stone-900 whitespace-nowrap"
                                        data-testid={`cart-subtotal-${c.id}`}
                                    >
                                        {formatIQD(c.unit_price * c.qty)}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </ScrollArea>
                )}

                <div className="mt-4 pt-4 border-t border-stone-100 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-stone-500">Total</span>
                        <span
                            data-testid="cart-total"
                            className="font-display text-3xl font-bold text-emerald-700 tracking-tight"
                        >
                            {formatIQD(total)}
                        </span>
                    </div>
                    <Button
                        data-testid="checkout-button"
                        disabled={cart.length === 0 || loading}
                        onClick={checkout}
                        className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-base shadow-[0_8px_20px_rgba(16,185,129,0.3)]"
                    >
                        {loading ? "Processing…" : "Complete Sale"}
                    </Button>
                </div>
            </aside>

            {/* Summary Dialog */}
            <Dialog open={!!summary} onOpenChange={(o) => !o && setSummary(null)}>
                <DialogContent data-testid="sale-summary-dialog" className="rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="font-display flex items-center gap-2 text-emerald-700">
                            <CheckCircle2 className="w-5 h-5" />
                            Sale Completed
                        </DialogTitle>
                    </DialogHeader>
                    {summary && (
                        <div className="space-y-3">
                            <div className="text-xs text-stone-500">
                                Receipt #{summary.id.slice(0, 8).toUpperCase()}
                            </div>
                            <ul className="divide-y divide-stone-100 max-h-64 overflow-auto">
                                {summary.lines.map((l, i) => (
                                    <li key={i} className="py-2 flex justify-between text-sm">
                                        <span className="text-stone-700">
                                            {l.name} × {l.qty}
                                        </span>
                                        <span className="font-semibold">
                                            {formatIQD(l.subtotal)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <div className="flex justify-between items-center pt-3 border-t border-stone-100">
                                <span className="text-stone-500">Total Paid</span>
                                <span className="font-display font-bold text-2xl text-emerald-700">
                                    {formatIQD(summary.total)}
                                </span>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            data-testid="summary-close"
                            onClick={() => setSummary(null)}
                            className="bg-emerald-500 hover:bg-emerald-600 rounded-xl"
                        >
                            New Sale
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default CashierPage;
