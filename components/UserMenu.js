"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function UserMenu() {
    const { user, userData, logout, isAdmin, signInWithGoogle } = useAuth();
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef(null);
    const pathname = usePathname();

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setShowMenu(false);
            }
        };
        if (showMenu) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showMenu]);

    if (!user) {
        return (
            <button onClick={signInWithGoogle} className="btn-secondary !py-1.5 !px-3 !text-[13px] h-[34px]">
                Sign In
            </button>
        );
    }

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setShowMenu(!showMenu)}
                className="relative block cursor-pointer outline-none hover:opacity-80 transition-opacity"
            >
                {userData?.photoURL ? (
                    <img
                        src={userData.photoURL}
                        alt={userData?.name || "User"}
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full ring-1 ring-black/5 object-cover"
                        referrerPolicy="no-referrer"
                    />
                ) : (
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center text-[15px] font-semibold text-[var(--text-secondary)] ring-1 ring-black/5">
                        {userData?.name?.[0] || "?"}
                    </div>
                )}
                
                {/* Admin visual indicator badge */}
                {isAdmin && (
                    <div className="absolute -bottom-1 -right-1 bg-[var(--esn-cyan)] text-white p-[3px] rounded-full ring-2 ring-white shadow-sm flex items-center justify-center">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                    </div>
                )}
            </button>

            {showMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 card shadow-lg p-1.5 z-50 origin-top-right animate-in fade-in zoom-in-95 duration-200">
                    <div className="px-3 py-2.5 border-b border-[var(--border-subtle)] mb-1.5 flex flex-col items-start min-w-0">
                        <p className="text-[14px] font-medium text-[var(--text-primary)] truncate w-full">{userData?.name}</p>
                        <p className="text-[12px] text-[var(--text-muted)] truncate mt-0.5 w-full">{userData?.email}</p>
                        {isAdmin && <span className="mt-1 text-[10px] font-semibold bg-[var(--esn-cyan)]/10 text-[var(--esn-cyan)] px-1.5 py-0.5 rounded uppercase tracking-wider">Admin</span>}
                    </div>
                    
                    <div className="flex flex-col gap-0.5">
                        {isAdmin && pathname !== "/admin" && (
                            <Link
                                href="/admin"
                                onClick={() => setShowMenu(false)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors"
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                </svg>
                                Admin Dashboard
                            </Link>
                        )}
                        {pathname !== "/" && (
                            <Link
                                href="/"
                                onClick={() => setShowMenu(false)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors"
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                                    <polyline points="9 22 9 12 15 12 15 22"/>
                                </svg>
                                Home
                            </Link>
                        )}
                        <button
                            onClick={() => { logout(); setShowMenu(false); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[#ff3b30] transition-colors text-left"
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                            Sign out
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
