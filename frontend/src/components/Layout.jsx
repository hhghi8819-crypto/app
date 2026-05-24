import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import { Pill, ShoppingCart, Boxes, Download, Upload } from "lucide-react";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { IS_DESKTOP } from "@/lib/api";

const Layout = () => {
    const linkBase =
        "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors btn-soft";
    const activeCls =
        "bg-emerald-500 text-white shadow-[0_8px_20px_rgba(16,185,129,0.35)]";
    const idleCls = "text-stone-700 hover:bg-stone-100";

    const [confirmRestore, setConfirmRestore] = useState(false);
    const [busy, setBusy] = useState(false);

    const doBackup = async () => {
        if (!window.pharmacyAPI) return;
        try {
            setBusy(true);
            const res = await window.pharmacyAPI.backupSave();
            if (res?.canceled) return;
            toast.success(`Backup saved`, { description: res.path });
        } catch (e) {
            toast.error("Backup failed", { description: e?.message });
        } finally {
            setBusy(false);
        }
    };

    const doRestore = async () => {
        if (!window.pharmacyAPI) return;
        try {
            setBusy(true);
            const res = await window.pharmacyAPI.backupRestore();
            if (res?.canceled) return;
            toast.success("Backup restored", {
                description: `${res.items} items, ${res.sales} sales loaded. Reloading…`,
            });
            // Reload so all pages re-fetch from the new data
            setTimeout(() => window.location.reload(), 800);
        } catch (e) {
            toast.error("Restore failed", { description: e?.message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col">
            <header className="sticky top-0 z-30 backdrop-blur bg-white/80 border-b border-stone-100">
                <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3" data-testid="brand-logo">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-[0_8px_20px_rgba(16,185,129,0.3)]">
                            <Pill className="w-5 h-5 text-white" strokeWidth={2.5} />
                        </div>
                        <div>
                            <div className="font-display font-bold text-lg leading-none text-stone-900">
                                Avicenna
                            </div>
                            <div className="text-xs text-stone-500 mt-0.5">
                                Pharmacy Management
                            </div>
                        </div>
                    </div>
                    <nav className="flex items-center gap-2">
                        <NavLink
                            to="/cashier"
                            data-testid="nav-cashier"
                            className={({ isActive }) =>
                                `${linkBase} ${isActive ? activeCls : idleCls}`
                            }
                        >
                            <ShoppingCart className="w-4 h-4" />
                            Cashier
                        </NavLink>
                        <NavLink
                            to="/storage"
                            data-testid="nav-storage"
                            className={({ isActive }) =>
                                `${linkBase} ${isActive ? activeCls : idleCls}`
                            }
                        >
                            <Boxes className="w-4 h-4" />
                            Storage
                        </NavLink>

                        {IS_DESKTOP && (
                            <>
                                <div className="w-px h-6 bg-stone-200 mx-1" />
                                <button
                                    type="button"
                                    onClick={doBackup}
                                    disabled={busy}
                                    data-testid="backup-button"
                                    title="Save a backup of all data to a file"
                                    className={`${linkBase} ${idleCls} disabled:opacity-50`}
                                >
                                    <Download className="w-4 h-4" />
                                    Backup
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setConfirmRestore(true)}
                                    disabled={busy}
                                    data-testid="restore-button"
                                    title="Restore data from a backup file"
                                    className={`${linkBase} ${idleCls} disabled:opacity-50`}
                                >
                                    <Upload className="w-4 h-4" />
                                    Restore
                                </button>
                            </>
                        )}
                    </nav>
                </div>
            </header>

            <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6">
                <Outlet />
            </main>

            <footer className="text-center text-xs text-stone-400 py-4">
                Avicenna Pharmacy · prices in IQD{IS_DESKTOP ? " · Offline edition" : ""}
            </footer>

            <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
                <AlertDialogContent className="rounded-2xl" data-testid="restore-confirm-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Restore from backup?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will <strong>replace all current data</strong> (items and sales)
                            with the contents of the backup file you select. This cannot be undone.
                            <br />
                            <br />
                            Tip: take a fresh backup first if you're not sure.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel data-testid="restore-cancel" className="rounded-xl">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            data-testid="restore-confirm"
                            onClick={() => {
                                setConfirmRestore(false);
                                doRestore();
                            }}
                            className="bg-emerald-500 hover:bg-emerald-600 rounded-xl"
                        >
                            Choose file & restore
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default Layout;
