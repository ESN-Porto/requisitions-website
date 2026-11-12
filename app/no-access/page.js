"use client";

import { useAuth } from "@/contexts/AuthContext";

const IT_MANAGER_URL = process.env.NEXT_PUBLIC_IT_MANAGER_URL || "https://it.esnporto.org";

/**
 * Signed in, but has_project_access('requisitions_tracker') is false — the
 * account is not an ESN volunteer/admin in IT Manager.
 */
export default function NoAccessPage() {
    const { user, logout } = useAuth();

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="card p-8 max-w-md w-full text-center">
                <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-[var(--status-out-bg)] border border-[var(--status-out-border)] flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--status-out)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                    </svg>
                </div>
                <h1 className="text-[22px] font-bold tracking-tight mb-2">Volunteers only</h1>
                <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed">
                    {user?.email ? <span className="font-medium text-[var(--text-primary)]">{user.email}</span> : "This account"} is not
                    registered as an ESN Porto volunteer. Access to this app is managed in{" "}
                    <a href={IT_MANAGER_URL} className="underline" target="_blank" rel="noreferrer">IT Manager</a> — ask the IT manager or a board member.
                </p>
                <button onClick={logout} className="btn-secondary mt-6 w-full">
                    Sign in with a different account
                </button>
            </div>
        </div>
    );
}
