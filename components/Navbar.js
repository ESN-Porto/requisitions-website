"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function Navbar() {
    const { userData, logout, isAdmin } = useAuth();
    const pathname = usePathname();

    return (
        <nav className="sticky top-0 z-40 backdrop-blur-xl bg-[var(--bg-primary)]/80 border-b border-[var(--border-color)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--esn-cyan)] to-[var(--esn-dark-blue)] flex items-center justify-center text-white font-bold text-sm">
                            ESN
                        </div>
                        <span className="font-bold text-lg hidden sm:block">
                            Item Tracker
                        </span>
                    </Link>

                    {/* Nav Links */}
                    <div className="flex items-center gap-2">
                        <Link
                            href="/"
                            className={`nav-link text-sm ${pathname === "/" ? "active" : ""}`}
                        >
                            Dashboard
                        </Link>
                        {isAdmin && (
                            <Link
                                href="/admin"
                                className={`nav-link text-sm ${pathname === "/admin" ? "active" : ""
                                    }`}
                            >
                                Admin
                            </Link>
                        )}

                        {/* User menu */}
                        <div className="flex items-center gap-3 ml-4 pl-4 border-l border-[var(--border-color)]">
                            <div className="hidden sm:block text-right">
                                <p className="text-sm font-medium leading-tight">
                                    {userData?.name}
                                </p>
                                <p className="text-xs text-[var(--text-muted)]">
                                    {userData?.role}
                                </p>
                            </div>
                            {userData?.photoURL && (
                                <img
                                    src={userData.photoURL}
                                    alt={userData.name}
                                    className="w-8 h-8 rounded-full ring-2 ring-[var(--border-color)]"
                                    referrerPolicy="no-referrer"
                                />
                            )}
                            <button
                                onClick={logout}
                                className="p-2 rounded-lg hover:bg-[var(--bg-card)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                title="Sign out"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                    <polyline points="16 17 21 12 16 7" />
                                    <line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}
