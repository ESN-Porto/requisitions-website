"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useRef, useEffect } from "react";

export default function Navbar() {
    const { user, userData, logout, isAdmin, signInWithGoogle } = useAuth();
    const pathname = usePathname();
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setShowMenu(false);
            }
        };
        if (showMenu) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showMenu]);

    return (
        <nav className="sticky top-0 z-40">
            <div className="max-w-6xl mx-auto px-4 sm:px-8">
                {/* Top row: logo + avatar */}
                <div className="flex items-center justify-between h-14 sm:h-16">
                    <Link href="/" className="flex items-center gap-2.5">
                        <Image
                            src="/assets/favicon.png"
                            alt="ESN"
                            width={26}
                            height={26}
                            priority
                        />
                        <span className="font-semibold text-[15px] text-[var(--text-primary)]">
                            Requisitions Tracker
                        </span>
                    </Link>

                    {/* Desktop nav links */}
                    <div className="hidden sm:flex items-center gap-1.5">
                        <Link
                            href="/"
                            className={`nav-link ${pathname === "/" ? "active" : ""}`}
                        >
                            Dashboard
                        </Link>
                        <Link
                            href="/history"
                            className={`nav-link ${pathname === "/history" ? "active" : ""}`}
                        >
                            History
                        </Link>
                        {isAdmin && (
                            <Link
                                href="/admin"
                                className={`nav-link ${pathname === "/admin" ? "active" : ""}`}
                            >
                                Admin
                            </Link>
                        )}
                        
                        {user ? (
                            <div className="relative ml-4 pl-4 border-l border-[var(--border-color)]" ref={menuRef}>
                                <button
                                    onClick={() => setShowMenu(!showMenu)}
                                    className="flex items-center gap-3 cursor-pointer"
                                >
                                    <span className="text-[14px] font-medium text-[var(--text-primary)]">
                                        {userData?.name}
                                    </span>
                                    {userData?.photoURL && (
                                        <img
                                            src={userData.photoURL}
                                            alt={userData.name}
                                            className="w-8 h-8 rounded-full ring-1 ring-black/5"
                                            referrerPolicy="no-referrer"
                                        />
                                    )}
                                </button>

                                {showMenu && (
                                    <div className="absolute right-0 top-full mt-2 w-48 card p-1.5 shadow-lg">
                                        <button
                                            onClick={() => { logout(); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[14px] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors text-left"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                                <polyline points="16 17 21 12 16 7" />
                                                <line x1="21" y1="12" x2="9" y2="12" />
                                            </svg>
                                            Sign out
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="ml-4 pl-4 border-l border-[var(--border-color)]">
                                <button onClick={signInWithGoogle} className="btn-secondary !py-1.5 !px-3 !text-[13px]">
                                    Sign In
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Mobile avatar or Sign in */}
                    <div className="sm:hidden relative flex items-center" ref={menuRef}>
                        {user ? (
                            <>
                                <button
                                    onClick={() => setShowMenu(!showMenu)}
                                    className="cursor-pointer"
                                >
                                    {userData?.photoURL ? (
                                        <img
                                            src={userData.photoURL}
                                            alt={userData.name}
                                            className="w-8 h-8 rounded-full ring-1 ring-black/5"
                                            referrerPolicy="no-referrer"
                                        />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center text-sm font-semibold text-[var(--text-secondary)]">
                                            {userData?.name?.[0]}
                                        </div>
                                    )}
                                </button>

                                {showMenu && (
                                    <div className="absolute right-0 top-full mt-2 w-56 card p-2 shadow-lg">
                                        <div className="px-3 py-2.5 border-b border-[var(--border-subtle)] mb-1.5">
                                            <p className="text-[14px] font-medium text-[var(--text-primary)]">{userData?.name}</p>
                                            <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{userData?.email}</p>
                                        </div>
                                        <button
                                            onClick={() => { logout(); setShowMenu(false); }}
                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[14px] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors text-left"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                                <polyline points="16 17 21 12 16 7" />
                                                <line x1="21" y1="12" x2="9" y2="12" />
                                            </svg>
                                            Sign out
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <button onClick={signInWithGoogle} className="btn-secondary !py-1.5 !px-3 !text-[12px]">
                                Sign In
                            </button>
                        )}
                    </div>
                </div>

                {/* Mobile bottom nav */}
                <div className="sm:hidden flex items-center gap-1 pb-2.5 -mt-1">
                    <Link
                        href="/"
                        className={`nav-link ${pathname === "/" ? "active" : ""}`}
                    >
                        Dashboard
                    </Link>
                    <Link
                        href="/history"
                        className={`nav-link ${pathname === "/history" ? "active" : ""}`}
                    >
                        History
                    </Link>
                    {isAdmin && (
                        <Link
                            href="/admin"
                            className={`nav-link ${pathname === "/admin" ? "active" : ""}`}
                        >
                            Admin
                        </Link>
                    )}
                </div>
            </div>
        </nav>
    );
}