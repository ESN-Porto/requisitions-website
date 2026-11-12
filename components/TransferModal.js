"use client";

import { useState } from "react";
import { useVolunteers } from "@/lib/data";

/**
 * Pick a volunteer to hand an item to. The list is the ESN volunteer roster
 * from IT Manager (requisitions_tracker.volunteers), not app-local users.
 */
export default function TransferModal({ onClose, onTransfer, currentUserId, title = "Pass to someone" }) {
    const { volunteers, loading } = useVolunteers();
    const [search, setSearch] = useState("");

    const needle = search.trim().toLowerCase();
    const filtered = volunteers
        .filter((v) => v.id !== currentUserId)
        .filter((v) => !needle || v.name?.toLowerCase().includes(needle) || v.email?.toLowerCase().includes(needle));

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input-field mb-4"
                    autoFocus
                />

                <div className="max-h-64 overflow-y-auto -mx-2 px-2">
                    {loading ? (
                        <div className="space-y-1 animate-pulse">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="w-full flex items-center gap-3 p-3 rounded-xl">
                                    <div className="w-9 h-9 rounded-full bg-[var(--bg-secondary)] flex-shrink-0"></div>
                                    <div className="flex-1">
                                        <div className="h-3.5 w-1/3 bg-[var(--bg-secondary)] rounded-md mb-2"></div>
                                        <div className="h-3 w-1/2 bg-[var(--bg-secondary)] rounded-md"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : filtered.length === 0 ? (
                        <p className="text-center text-sm text-[var(--text-muted)] py-8">No volunteers found</p>
                    ) : (
                        <div className="space-y-1">
                            {filtered.map((v) => (
                                <button
                                    key={v.id}
                                    onClick={() => onTransfer(v)}
                                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--bg-secondary)] transition-colors text-left"
                                >
                                    <Avatar name={v.name} src={v.photo_url} />
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{v.name}</p>
                                        <p className="text-xs text-[var(--text-muted)] truncate">{v.email}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export function Avatar({ name, src, className = "w-9 h-9", textClass = "text-sm" }) {
    if (src) {
        return <img src={src} alt={name || ""} className={`${className} rounded-full ring-1 ring-black/5 object-cover flex-shrink-0`} referrerPolicy="no-referrer" />;
    }
    return (
        <div className={`${className} rounded-full bg-[var(--bg-secondary)] flex items-center justify-center ${textClass} font-semibold text-[var(--text-secondary)] flex-shrink-0`}>
            {name?.trim()?.[0]?.toUpperCase() || "?"}
        </div>
    );
}
