"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Second step of password recovery. The proxy only requires a session here
 * (the recovery link already signed the user in), not project access.
 */
export default function ResetPasswordPage() {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        if (password.length < 8) return setError("Use at least 8 characters.");
        if (password !== confirm) return setError("Passwords don't match.");
        setLoading(true);
        const supabase = createClient();
        const { error: updateError } = await supabase.auth.updateUser({ password });
        setLoading(false);
        if (updateError) {
            setError(updateError.message);
            return;
        }
        router.push("/");
        router.refresh();
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="login-card">
                <h1 className="login-card-heading login-card-heading--desktop">Choose a new password</h1>
                <p className="login-card-sub login-card-sub--desktop">
                    This password is shared with IT Manager and the other ESN Porto tools.
                </p>

                <form onSubmit={handleSubmit} className="login-form">
                    <input
                        type="password"
                        autoComplete="new-password"
                        placeholder="New password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                        className="input-field"
                    />
                    <input
                        type="password"
                        autoComplete="new-password"
                        placeholder="Confirm new password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        required
                        className="input-field"
                    />
                    <button type="submit" disabled={loading} className="login-submit-btn">
                        {loading ? <span className="spinner !w-5 !h-5 !border-2 !border-white/30 !border-t-white" /> : "Save password"}
                    </button>
                </form>

                {error && (
                    <div className="login-error-msg">
                        <span>{error}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
