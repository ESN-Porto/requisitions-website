"use client";

import { useAuth } from "@/contexts/AuthContext";
import LoginPage from "./LoginPage";

export default function AuthGate({ children }) {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="spinner" />
            </div>
        );
    }

    if (!user) {
        return <LoginPage />;
    }

    return children;
}
