"use client";

import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
    const { signInWithGoogle, authError } = useAuth();

    return (
        <div className="login-container">
            {/* Background photo */}
            <div className="login-bg">
                {/* Desktop image */}
                <Image
                    src="/assets/desktop_sign_in_photo.jpg"
                    alt="ESN Porto"
                    fill
                    priority
                    style={{ objectFit: "cover" }}
                    className="login-bg-desktop"
                />
                {/* Mobile image */}
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
                        Sign in to continue to your dashboard
                    </p>

                    <button onClick={signInWithGoogle} className="login-google-btn">
                        <svg width="18" height="18" viewBox="0 0 48 48">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                        </svg>
                        Continue with Google
                    </button>

                    {authError && (
                        <div className="login-error-msg">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <span>{authError}</span>
                        </div>
                    )}

                    <p className="login-card-terms">
                        By signing in, you agree to our Terms of Service and Privacy Policy.
                    </p>
                </div>
            </div>
        </div>
    );
}

