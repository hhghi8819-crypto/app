import { NavLink, Outlet } from "react-router-dom";
import { Pill, ShoppingCart, Boxes } from "lucide-react";

const Layout = () => {
    const linkBase =
        "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors btn-soft";
    const activeCls =
        "bg-emerald-500 text-white shadow-[0_8px_20px_rgba(16,185,129,0.35)]";
    const idleCls = "text-stone-700 hover:bg-stone-100";

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
                    </nav>
                </div>
            </header>

            <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6">
                <Outlet />
            </main>

            <footer className="text-center text-xs text-stone-400 py-4">
                Avicenna Pharmacy · prices in IQD
            </footer>
        </div>
    );
};

export default Layout;
