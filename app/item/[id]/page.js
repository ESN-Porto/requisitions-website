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

const TYPE_EMOJI = { camera: "\u{1F4F7}", tondela: "\u{1F9F8}", card: "\u{1F4B3}" };

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

        const unsubItem = onSnapshot(doc(getFirebaseDb(), "items", params.id), (docSnap) => {
            if (docSnap.exists()) {
                setItem({ id: docSnap.id, ...docSnap.data() });
            }
            setItemLoading(false);
        }, (error) => {
            console.error("Item listener error:", error);
            setItemLoading(false);
        });

        const q = query(
            collection(getFirebaseDb(), "transfers"),
            where("itemId", "==", params.id)
        );
        const unsubTransfers = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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
                itemType: item.type,
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
                itemType: item.type,
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
                itemType: item.type,
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
                <div className="max-w-4xl mx-auto px-5 py-20 text-center">
                    <p className="text-5xl mb-4 opacity-40">{"\u{1F50D}"}</p>
                    <h2 className="text-xl font-bold mb-2">Item not found</h2>
                    <p className="text-[var(--text-muted)]">
                        This item may have been removed.
                    </p>
                </div>
            </div>
        );
    }

    const isInOffice = item.status === "office";
    const isCurrentHolder = item.currentHolder === user.uid;

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
                        <span className="font-semibold text-[var(--text-primary)]">
                            {transfer.toUserName}
                        </span>{" "}
                        picked up from office
                    </>
                );
            case "return":
                return (
                    <>
                        <span className="font-semibold text-[var(--text-primary)]">
                            {transfer.fromUserName}
                        </span>{" "}
                        returned to office
                    </>
                );
            case "transfer":
                return (
                    <>
                        <span className="font-semibold text-[var(--text-primary)]">
                            {transfer.fromUserName}
                        </span>{" "}
                        {"\u2192"}{" "}
                        <span className="font-semibold text-[var(--text-primary)]">
                            {transfer.toUserName}
                        </span>
                    </>
                );
            default:
                return "Unknown action";
        }
    };

    const getActionDotColor = (action) => {
        switch (action) {
            case "pickup": return "bg-[var(--status-office)]";
            case "return": return "bg-[var(--esn-orange)]";
            case "transfer": return "bg-[var(--esn-cyan)]";
            default: return "bg-[var(--text-muted)]";
        }
    };

    return (
        <div className="min-h-screen">
            <Navbar />
            <main className="max-w-4xl mx-auto px-4 sm:px-8 py-5 sm:py-8">
                {/* Back button */}
                <button
                    onClick={() => router.push("/")}
                    className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-5 sm:mb-8 text-[14px] font-medium"
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
                    Back
                </button>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 sm:gap-8">
                    {/* Left: Item info + Actions (3 cols) */}
                    <div className="lg:col-span-3 space-y-4 sm:space-y-6">
                        {/* Item Card */}
                        <div className="card overflow-hidden">
                            {item.photoURL ? (
                                <img src={item.photoURL} alt={item.name} className="w-full h-48 sm:h-56 object-cover" />
                            ) : (
                                <div className="w-full h-48 sm:h-56 flex items-center justify-center bg-[var(--bg-secondary)] text-5xl sm:text-6xl">
                                    {TYPE_EMOJI[item.type] || "\u{1F4E6}"}
                                </div>
                            )}
                            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{item.name}</h1>
                                        <span className={`type-badge mt-2 type-${item.type}`}>
                                            {TYPE_EMOJI[item.type]} {item.type}
                                        </span>
                                    </div>
                                    <div
                                        className={`status-badge flex-shrink-0 ${isInOffice ? "status-office" : "status-out"}`}
                                    >
                                        <span
                                            className={`status-dot ${isInOffice ? "office" : "out"}`}
                                        ></span>
                                        {isInOffice ? "In Office" : "Checked Out"}
                                    </div>
                                </div>

                                {!isInOffice && (
                                    <div className="p-4 rounded-xl bg-[var(--bg-secondary)]">
                                        <p className="text-[13px] text-[var(--text-muted)]">
                                            Currently with
                                        </p>
                                        <p className="font-semibold text-lg mt-0.5">
                                            {item.currentHolderName || "Unknown"}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="card p-4 sm:p-6 space-y-4 sm:space-y-5">
                            <h2 className="font-semibold text-base sm:text-lg">Actions</h2>

                            <div>
                                <label className="text-[13px] font-medium text-[var(--text-secondary)] mb-1.5 block">
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

                            <div className="space-y-3">
                                {isInOffice && (
                                    <button
                                        onClick={handlePickup}
                                        disabled={actionLoading}
                                        className="btn-action pickup"
                                    >
                                        <span className="text-lg">{"\u{1F4E4}"}</span>
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
                                            <span className="text-lg">{"\u{1F4E5}"}</span>
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
                                            <span className="text-lg">{"\u{1F91D}"}</span>
                                            Pass to someone
                                        </button>
                                    </>
                                )}

                                {!isInOffice && !isCurrentHolder && (
                                    <div className="text-[14px] text-[var(--text-muted)] p-5 rounded-xl bg-[var(--bg-secondary)] text-center">
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

                    {/* Right: Transfer History (2 cols) */}
                    <div className="lg:col-span-2">
                        <div className="card p-4 sm:p-6 lg:sticky lg:top-20">
                            <h2 className="font-semibold text-base sm:text-lg mb-4 sm:mb-6">Transfer History</h2>

                            {transfersLoading ? (
                                <div className="flex justify-center py-12">
                                    <div className="spinner"></div>
                                </div>
                            ) : transfers.length === 0 ? (
                                <div className="text-center py-12">
                                    <p className="text-4xl mb-3 opacity-40">{"\u{1F4CB}"}</p>
                                    <p className="text-sm text-[var(--text-muted)]">
                                        No transfers yet
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    {transfers.map((transfer, index) => (
                                        <div
                                            key={transfer.id}
                                            className={`flex gap-3.5 py-4 ${
                                                index !== transfers.length - 1 ? "border-b border-[var(--border-subtle)]" : ""
                                            }`}
                                        >
                                            <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${getActionDotColor(transfer.action)}`} />
                                            <div>
                                                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{getActionText(transfer)}</p>
                                                {transfer.eventName && (
                                                    <p className="text-xs mt-1 text-[var(--esn-magenta)] font-medium">
                                                        {transfer.eventName}
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
                </div>
            </main>

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
