"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const IT_MANAGER_URL = process.env.NEXT_PUBLIC_IT_MANAGER_URL || "https://it.esnporto.org";

// Only internal paths: blocks //evil.com, schemes and backslash tricks.
function safeNext(raw) {
    if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
    return raw;
}

export default function LoginPage() {
    return (
        <Suspense>
            <LoginForm />
        </Suspense>
    );
}

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const next = safeNext(searchParams.get("next"));

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        const supabase = createClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
            setError(
                signInError.message === "Invalid login credentials"
                    ? "Wrong email or password. Use the same account as IT Manager."
                    : signInError.message
            );
            setLoading(false);
            return;
        }
        // The proxy re-checks has_project_access on the next request; volunteers
        // land on `next`, everyone else on /no-access.
        router.push(next);
        router.refresh();
    };

    return (
        <div className="login-container">
            {/* Background photo */}
            <div className="login-bg">
                <Image
                    src="/assets/desktop_sign_in_photo.jpg"
                    alt="ESN Porto"
                    fill
                    priority
                    style={{ objectFit: "cover" }}
                    className="login-bg-desktop"
                />
                <Image
                    src="/assets/mobile_sign_in_photo.png"
                    alt="ESN Porto"
                    fill
                    priority
                    style={{ objectFit: "cover" }}
                    className="login-bg-mobile"
                />
                <div className="login-bg-overlay" />
            </div>

            {/* Desktop: left-side text on photo */}
            <div className="login-desktop-info">
                <h2 className="login-desktop-title">Requisitions Tracker</h2>
                <p className="login-desktop-subtitle">
                    Platform for ESN Porto Volunteers to manage equipment requisitions.
                </p>
            </div>

            {/* Sign-in card */}
            <div className="login-card-wrapper">
                <div className="login-card">
                    <Image
                        src="/assets/favicon.png"
                        alt="ESN"
                        width={40}
                        height={40}
                        priority
                        className="login-card-logo"
                    />

                    <h1 className="login-card-heading login-card-heading--mobile">Requisitions Tracker</h1>
                    <h1 className="login-card-heading login-card-heading--desktop">Welcome back</h1>
                    <p className="login-card-sub login-card-sub--mobile">
                        ESN Porto equipment management platform.
                    </p>
                    <p className="login-card-sub login-card-sub--desktop">
                        Sign in with your ESN Porto volunteer account
                    </p>

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
                        <input
                            type="password"
                            autoComplete="current-password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="input-field"
                        />
                        <button type="submit" disabled={loading} className="login-submit-btn">
                            {loading ? <span className="spinner !w-5 !h-5 !border-2 !border-white/30 !border-t-white" /> : "Sign in"}
                        </button>
                    </form>

                    {error && (
                        <div className="login-error-msg">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <span>{error}</span>
                        </div>
                    )}

                    <p className="login-card-terms">
                        Same login as{" "}
                        <a href={IT_MANAGER_URL} className="underline" target="_blank" rel="noreferrer">IT Manager</a>.{" "}
                        <Link href="/forgot-password" className="underline">Forgot your password?</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
