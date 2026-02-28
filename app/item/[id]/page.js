"use client";

import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import TransferModal from "@/components/TransferModal";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    doc,
    getDoc,
    updateDoc,
    addDoc,
    collection,
    query,
    where,
    onSnapshot,
    serverTimestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

export default function ItemDetailPage() {
    const { user, userData, loading } = useAuth();
    const params = useParams();
    const router = useRouter();
    const [item, setItem] = useState(null);
    const [transfers, setTransfers] = useState([]);
    const [itemLoading, setItemLoading] = useState(true);
    const [transfersLoading, setTransfersLoading] = useState(true);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [eventName, setEventName] = useState("");

    useEffect(() => {
        if (!user || !params.id) return;

        // Listen to item changes
        const unsubItem = onSnapshot(doc(getFirebaseDb(), "items", params.id), (docSnap) => {
            if (docSnap.exists()) {
                setItem({ id: docSnap.id, ...docSnap.data() });
            }
            setItemLoading(false);
        }, (error) => {
            console.error("Item listener error:", error);
            setItemLoading(false);
        });

        // Listen to transfer history (simple query — sort client-side to avoid composite index)
        const q = query(
            collection(getFirebaseDb(), "transfers"),
            where("itemId", "==", params.id)
        );
        const unsubTransfers = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            // Sort by timestamp descending (newest first)
            docs.sort((a, b) => {
                const ta = a.timestamp?.toMillis?.() || 0;
                const tb = b.timestamp?.toMillis?.() || 0;
                return tb - ta;
            });
            setTransfers(docs);
            setTransfersLoading(false);
        }, (error) => {
            console.error("Transfers listener error:", error);
            setTransfersLoading(false);
        });

        return () => {
            unsubItem();
            unsubTransfers();
        };
    }, [user, params.id]);

    const handlePickup = async () => {
        if (!item || actionLoading) return;
        setActionLoading(true);
        try {
            await updateDoc(doc(getFirebaseDb(), "items", item.id), {
                status: "out",
                currentHolder: user.uid,
                currentHolderName: userData.name,
                updatedAt: serverTimestamp(),
            });
            await addDoc(collection(getFirebaseDb(), "transfers"), {
                itemId: item.id,
                itemName: item.name,
                fromUserId: null,
                fromUserName: "Office",
                toUserId: user.uid,
                toUserName: userData.name,
                action: "pickup",
                eventName: eventName || null,
                timestamp: serverTimestamp(),
            });
            setEventName("");
        } catch (e) {
            console.error("Pickup error:", e);
        }
        setActionLoading(false);
    };

    const handleReturn = async () => {
        if (!item || actionLoading) return;
        setActionLoading(true);
        try {
            await updateDoc(doc(getFirebaseDb(), "items", item.id), {
                status: "office",
                currentHolder: null,
                currentHolderName: null,
                updatedAt: serverTimestamp(),
            });
            await addDoc(collection(getFirebaseDb(), "transfers"), {
                itemId: item.id,
                itemName: item.name,
                fromUserId: user.uid,
                fromUserName: userData.name,
                toUserId: null,
                toUserName: "Office",
                action: "return",
                eventName: eventName || null,
                timestamp: serverTimestamp(),
            });
            setEventName("");
        } catch (e) {
            console.error("Return error:", e);
        }
        setActionLoading(false);
    };

    const handleTransfer = async (toUser) => {
        if (!item || actionLoading) return;
        setActionLoading(true);
        try {
            await updateDoc(doc(getFirebaseDb(), "items", item.id), {
                status: "out",
                currentHolder: toUser.id,
                currentHolderName: toUser.name,
                updatedAt: serverTimestamp(),
            });
            await addDoc(collection(getFirebaseDb(), "transfers"), {
                itemId: item.id,
                itemName: item.name,
                fromUserId: user.uid,
                fromUserName: userData.name,
                toUserId: toUser.id,
                toUserName: toUser.name,
                action: "transfer",
                eventName: eventName || null,
                timestamp: serverTimestamp(),
            });
            setEventName("");
            setShowTransferModal(false);
        } catch (e) {
            console.error("Transfer error:", e);
        }
        setActionLoading(false);
    };

    if (loading || itemLoading) {
        return (
            <div className="min-h-screen">
                <Navbar />
                <div className="flex justify-center py-32">
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    if (!user) {
        router.push("/");
        return null;
    }

    if (!item) {
        return (
            <div className="min-h-screen">
                <Navbar />
                <div className="max-w-4xl mx-auto px-4 py-16 text-center">
                    <p className="text-6xl mb-4">🔍</p>
                    <h2 className="text-2xl font-bold mb-2">Item not found</h2>
                    <p className="text-[var(--text-muted)]">
                        This item may have been removed.
                    </p>
                </div>
            </div>
        );
    }

    const isInOffice = item.status === "office";
    const isCurrentHolder = item.currentHolder === user.uid;

    const TYPE_EMOJI = { camera: "📷", tondela: "🧸", card: "💳" };

    const formatDate = (timestamp) => {
        if (!timestamp) return "";
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const getActionText = (transfer) => {
        switch (transfer.action) {
            case "pickup":
                return (
                    <>
                        <span className="font-semibold text-[var(--status-office)]">
                            {transfer.toUserName}
                        </span>{" "}
                        picked up from office
                    </>
                );
            case "return":
                return (
                    <>
                        <span className="font-semibold text-[var(--esn-orange)]">
                            {transfer.fromUserName}
                        </span>{" "}
                        returned to office
                    </>
                );
            case "transfer":
                return (
                    <>
                        <span className="font-semibold text-[var(--esn-cyan)]">
                            {transfer.fromUserName}
                        </span>{" "}
                        → {" "}
                        <span className="font-semibold text-[var(--esn-cyan)]">
                            {transfer.toUserName}
                        </span>
                    </>
                );
            default:
                return "Unknown action";
        }
    };

    return (
        <div className="min-h-screen">
            <Navbar />
            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Back button */}
                <button
                    onClick={() => router.push("/")}
                    className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6 text-sm"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                    Back to Dashboard
                </button>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left: Item info + Actions */}
                    <div className="space-y-6">
                        {/* Item Card */}
                        <div className="glass-card overflow-hidden cursor-default hover:transform-none">
                            {item.photoURL ? (
                                <img src={item.photoURL} alt={item.name} className="item-image" />
                            ) : (
                                <div className="item-image-placeholder text-5xl">
                                    {TYPE_EMOJI[item.type] || "📦"}
                                </div>
                            )}
                            <div className="p-6 space-y-4">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h1 className="text-2xl font-bold">{item.name}</h1>
                                        <span className={`type-badge mt-1 type-${item.type}`}>
                                            {TYPE_EMOJI[item.type]} {item.type}
                                        </span>
                                    </div>
                                    <div
                                        className={`status-badge ${isInOffice ? "status-office" : "status-out"
                                            }`}
                                    >
                                        <span
                                            className={`status-dot ${isInOffice ? "office" : "out"}`}
                                        ></span>
                                        {isInOffice ? "In Office" : "Checked Out"}
                                    </div>
                                </div>

                                {!isInOffice && (
                                    <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]">
                                        <p className="text-sm text-[var(--text-muted)]">
                                            Currently with
                                        </p>
                                        <p className="font-semibold text-lg">
                                            {item.currentHolderName || "Unknown"}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="glass-card p-6 space-y-4 cursor-default hover:transform-none">
                            <h2 className="font-semibold text-lg">Actions</h2>

                            {/* Event name input */}
                            <div>
                                <label className="text-sm text-[var(--text-muted)] mb-1 block">
                                    Event name (optional)
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Erasmus Welcome Week"
                                    value={eventName}
                                    onChange={(e) => setEventName(e.target.value)}
                                    className="input-field"
                                />
                            </div>

                            <div className="space-y-2">
                                {isInOffice && (
                                    <button
                                        onClick={handlePickup}
                                        disabled={actionLoading}
                                        className="btn-action pickup"
                                    >
                                        <span className="text-lg">📤</span>
                                        Pick up from office
                                        {actionLoading && (
                                            <span className="ml-auto spinner !w-4 !h-4 !border-2"></span>
                                        )}
                                    </button>
                                )}

                                {isCurrentHolder && (
                                    <>
                                        <button
                                            onClick={handleReturn}
                                            disabled={actionLoading}
                                            className="btn-action return-item"
                                        >
                                            <span className="text-lg">📥</span>
                                            Return to office
                                            {actionLoading && (
                                                <span className="ml-auto spinner !w-4 !h-4 !border-2"></span>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => setShowTransferModal(true)}
                                            disabled={actionLoading}
                                            className="btn-action transfer"
                                        >
                                            <span className="text-lg">🤝</span>
                                            Pass to someone
                                        </button>
                                    </>
                                )}

                                {!isInOffice && !isCurrentHolder && (
                                    <div className="text-sm text-[var(--text-muted)] p-4 rounded-xl bg-[var(--bg-secondary)] text-center">
                                        Only{" "}
                                        <span className="font-medium text-[var(--text-primary)]">
                                            {item.currentHolderName}
                                        </span>{" "}
                                        can return or transfer this item.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right: Transfer History */}
                    <div className="glass-card p-6 cursor-default hover:transform-none">
                        <h2 className="font-semibold text-lg mb-6">Transfer History</h2>

                        {transfersLoading ? (
                            <div className="flex justify-center py-10">
                                <div className="spinner"></div>
                            </div>
                        ) : transfers.length === 0 ? (
                            <div className="text-center py-10">
                                <p className="text-4xl mb-3">📋</p>
                                <p className="text-[var(--text-muted)]">
                                    No transfers yet
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-0">
                                {transfers.map((transfer) => (
                                    <div key={transfer.id} className={`timeline-item`}>
                                        <div
                                            className={`timeline-dot ${transfer.action}`}
                                        ></div>
                                        <div>
                                            <p className="text-sm">{getActionText(transfer)}</p>
                                            {transfer.eventName && (
                                                <p className="text-xs mt-1 text-[var(--esn-magenta)]">
                                                    🎉 {transfer.eventName}
                                                </p>
                                            )}
                                            <p className="text-xs text-[var(--text-muted)] mt-1">
                                                {formatDate(transfer.timestamp)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Transfer Modal */}
            {showTransferModal && (
                <TransferModal
                    onClose={() => setShowTransferModal(false)}
                    onTransfer={handleTransfer}
                    currentUserId={user.uid}
                />
            )}
        </div>
    );
}
