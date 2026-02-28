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
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold">Pass to someone</h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-[var(--bg-card)] transition-colors text-[var(--text-muted)]"
                    >
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
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

                <div className="max-h-64 overflow-y-auto space-y-1">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="spinner !w-6 !h-6"></div>
                        </div>
                    ) : filteredUsers.length === 0 ? (
                        <p className="text-center text-[var(--text-muted)] py-8 text-sm">
                            No members found
                        </p>
                    ) : (
                        filteredUsers.map((u) => (
                            <button
                                key={u.id}
                                onClick={() => onTransfer(u)}
                                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--bg-card)] transition-colors text-left"
                            >
                                {u.photoURL ? (
                                    <img
                                        src={u.photoURL}
                                        alt={u.name}
                                        className="w-9 h-9 rounded-full"
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div className="w-9 h-9 rounded-full bg-[var(--bg-card-hover)] flex items-center justify-center text-sm font-semibold">
                                        {u.name?.[0]}
                                    </div>
                                )}
                                <div>
                                    <p className="text-sm font-medium">{u.name}</p>
                                    <p className="text-xs text-[var(--text-muted)]">{u.email}</p>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
