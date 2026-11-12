"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * Password recovery for the shared ESN account. GoTrue e-mails a link that
 * comes back through /auth/callback (PKCE) and lands on /reset-password.
 */
export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        const supabase = createClient();
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
        setLoading(false);
        if (resetError) {
            setError(resetError.message);
            return;
        }
        setSent(true);
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="login-card">
                <h1 className="login-card-heading login-card-heading--desktop">Reset your password</h1>
                <p className="login-card-sub login-card-sub--desktop">
                    Same account as IT Manager. We&rsquo;ll e-mail you a link to choose a new password.
                </p>

                {sent ? (
                    <p className="text-[14px] text-[var(--text-secondary)] mt-4">
                        If <strong>{email}</strong> belongs to an ESN Porto volunteer account, the link is on its way. Check your spam folder too.
                    </p>
                ) : (
                    <form onSubmit={handleSubmit} className="login-form">
                        <input
                            type="email"
                            autoComplete="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="input-field"
                        />
                        <button type="submit" disabled={loading} className="login-submit-btn">
                            {loading ? <span className="spinner !w-5 !h-5 !border-2 !border-white/30 !border-t-white" /> : "Send reset link"}
                        </button>
                    </form>
                )}

                {error && (
                    <div className="login-error-msg">
                        <span>{error}</span>
                    </div>
                )}

                <p className="login-card-terms">
                    <Link href="/login" className="underline">Back to sign in</Link>
                </p>
            </div>
        </div>
    );
}
