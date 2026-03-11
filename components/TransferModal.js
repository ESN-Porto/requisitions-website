"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

export default function TransferModal({ onClose, onTransfer, currentUserId }) {
    const [users, setUsers] = useState([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUsers = async () => {
            const q = query(collection(getFirebaseDb(), "users"), orderBy("name"));
            const snapshot = await getDocs(q);
            const usersData = snapshot.docs
                .map((doc) => ({ id: doc.id, ...doc.data() }))
                .filter((u) => u.id !== currentUserId);
            setUsers(usersData);
            setLoading(false);
        };
        fetchUsers();
    }, [currentUserId]);

    const filteredUsers = users.filter(
        (u) =>
            u.name?.toLowerCase().includes(search.toLowerCase()) ||
            u.email?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold">Pass to someone</h2>
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
                    ) : filteredUsers.length === 0 ? (
                        <p className="text-center text-sm text-[var(--text-muted)] py-8">No members found</p>
                    ) : (
                        <div className="space-y-1">
                            {filteredUsers.map((u) => (
                                <button
                                    key={u.id}
                                    onClick={() => onTransfer(u)}
                                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--bg-secondary)] transition-colors text-left"
                                >
                                    {u.photoURL ? (
                                        <img src={u.photoURL} alt={u.name} className="w-9 h-9 rounded-full ring-1 ring-black/5" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="w-9 h-9 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center text-sm font-semibold text-[var(--text-secondary)]">
                                            {u.name?.[0]}
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-sm font-medium text-[var(--text-primary)]">{u.name}</p>
                                        <p className="text-xs text-[var(--text-muted)]">{u.email}</p>
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
