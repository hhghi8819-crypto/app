import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Webcam barcode scanner using html5-qrcode loaded from CDN.
 * Calls onDetected(code) when a barcode is recognised.
 */
const BarcodeScanner = ({ onDetected, testIdPrefix = "scanner" }) => {
    const [active, setActive] = useState(false);
    const [error, setError] = useState("");
    const scannerRef = useRef(null);
    const containerId = useRef(
        `qr-reader-${Math.random().toString(36).slice(2, 8)}`
    );

    // Load library from CDN once
    useEffect(() => {
        if (window.Html5Qrcode) return;
        const script = document.createElement("script");
        script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
        script.async = true;
        document.body.appendChild(script);
    }, []);

    useEffect(() => {
        const start = async () => {
            try {
                if (!window.Html5Qrcode) {
                    setError("Loading scanner library…");
                    setTimeout(start, 600);
                    return;
                }
                const Html5Qrcode = window.Html5Qrcode;
                const instance = new Html5Qrcode(containerId.current);
                scannerRef.current = instance;
                await instance.start(
                    { facingMode: "environment" },
                    {
                        fps: 12,
                        qrbox: { width: 280, height: 140 },
                        aspectRatio: 1.6,
                    },
                    (decodedText) => {
                        onDetected?.(decodedText);
                    },
                    () => {}
                );
                setError("");
            } catch (e) {
                console.error(e);
                setError("Camera unavailable. Use manual input instead.");
                setActive(false);
            }
        };

        const stop = async () => {
            try {
                if (scannerRef.current) {
                    await scannerRef.current.stop();
                    await scannerRef.current.clear();
                    scannerRef.current = null;
                }
            } catch (_) {}
        };

        if (active) start();
        else stop();

        return () => {
            stop();
        };
    }, [active, onDetected]);

    return (
        <div className="space-y-3">
            <Button
                type="button"
                variant={active ? "destructive" : "secondary"}
                onClick={() => setActive((v) => !v)}
                data-testid={`${testIdPrefix}-toggle`}
                className="w-full h-11 rounded-xl font-semibold"
            >
                {active ? (
                    <>
                        <CameraOff className="w-4 h-4 mr-2" /> Stop Camera
                    </>
                ) : (
                    <>
                        <Camera className="w-4 h-4 mr-2" /> Scan with Camera
                    </>
                )}
            </Button>
            {active && (
                <div
                    id={containerId.current}
                    className="rounded-xl overflow-hidden border border-stone-200 bg-stone-50"
                    data-testid={`${testIdPrefix}-viewport`}
                />
            )}
            {error && (
                <p className="text-xs text-rose-600" data-testid={`${testIdPrefix}-error`}>
                    {error}
                </p>
            )}
        </div>
    );
};

export default BarcodeScanner;
