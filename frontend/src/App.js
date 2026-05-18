import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import CashierPage from "@/pages/CashierPage";
import StoragePage from "@/pages/StoragePage";

function App() {
    return (
        <div className="App app-grain">
            <BrowserRouter>
                <Routes>
                    <Route element={<Layout />}>
                        <Route path="/" element={<Navigate to="/cashier" replace />} />
                        <Route path="/cashier" element={<CashierPage />} />
                        <Route path="/storage" element={<StoragePage />} />
                    </Route>
                </Routes>
            </BrowserRouter>
            <Toaster position="top-right" richColors />
        </div>
    );
}

export default App;
