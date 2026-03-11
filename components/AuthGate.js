"use client";

import { useAuth } from "@/contexts/AuthContext";
import { usePathname } from "next/navigation";
import LoginPage from "./LoginPage";

export default function AuthGate({ children }) {
    const { user, loading } = useAuth();
    const pathname = usePathname();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="spinner" />
            </div>
        );
    }

    // QuickScan pages handle their own auth state
    if (pathname?.startsWith("/scan/")) {
        return children;
    }

    if (!user) {
        return <LoginPage />;
    }

    return children;
}
