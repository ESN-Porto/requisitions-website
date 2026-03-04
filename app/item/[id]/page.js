"use client";

import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import TransferModal from "@/components/TransferModal";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    doc,
    updateDoc,
    addDoc,
    collection,
    query,
    where,
    onSnapshot,
    getDocs,
    serverTimestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

const TYPE_EMOJI = { camera: "\u{1F4F7}", tondela: "\u{1F9F8}", card: "\u{1F4B3}" };

export default function ItemDetailPage() {
    const { user, userData, loading, signInWithGoogle } = useAuth();
    const params = useParams();
    const router = useRouter();
    const [item, setItem] = useState(null);
    const [transfers, setTransfers] = useState([]);
    const [usersMap, setUsersMap] = useState({});
    const [itemLoading, setItemLoading] = useState(true);
    const [transfersLoading, setTransfersLoading] = useState(true);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [eventName, setEventName] = useState("");

    useEffect(() => {
        if (!params.id) return;

        // Fetch all users for photo lookup
        getDocs(collection(getFirebaseDb(), "users")).then((snap) => {
            const map = {};
            snap.docs.forEach((d) => {
                map[d.id] = d.data();
            });
            setUsersMap(map);
        });

        const unsubItem = onSnapshot(doc(getFirebaseDb(), "items", params.id), (docSnap) => {
            if (docSnap.exists()) {
                setItem({ id: docSnap.id, ...docSnap.data() });
            }
            setItemLoading(false);
        });

        const q = query(
            collection(getFirebaseDb(), "transfers"),
            where("itemId", "==", params.id)
        );
        const unsubTransfers = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            docs.sort((a, b) => {
                const ta = a.timestamp?.toMillis?.() || 0;
                const tb = b.timestamp?.toMillis?.() || 0;
                return tb - ta;
            });
            setTransfers(docs);
            setTransfersLoading(false);
        });

        return () => {
            unsubItem();
            unsubTransfers();
        };
    }, [params.id]);

    const handlePickup = async () => {
        if (!user || !item || actionLoading) return;
        setActionLoading(true);
        try {
            await updateDoc(doc(getFirebaseDb(), "items", item.id), {
                status: "out",
                currentHolder: user.uid,
                currentHolderName: userData.name,
                currentHolderPhoto: userData.photoURL || null,
                updatedAt: serverTimestamp(),
            });
            await addDoc(collection(getFirebaseDb(), "transfers"), {
                itemId: item.id, itemName: item.name, itemType: item.type,
                fromUserId: null, fromUserName: "Office",
                toUserId: user.uid, toUserName: userData.name,
                action: "pickup", eventName: eventName.trim(),
                timestamp: serverTimestamp(),
            });
            setEventName("");
        } catch (e) { console.error("Pickup error:", e); }
        setActionLoading(false);
    };

    const handleReturn = async () => {
        if (!user || !item || actionLoading) return;
        setActionLoading(true);
        try {
            await updateDoc(doc(getFirebaseDb(), "items", item.id), {
                status: "office",
                currentHolder: null,
                currentHolderName: null,
                currentHolderPhoto: null,
                updatedAt: serverTimestamp(),
            });
            await addDoc(collection(getFirebaseDb(), "transfers"), {
                itemId: item.id, itemName: item.name, itemType: item.type,
                fromUserId: user.uid, fromUserName: userData.name,
                toUserId: null, toUserName: "Office",
                action: "return", eventName: eventName.trim() || null,
                timestamp: serverTimestamp(),
            });
            setEventName("");
        } catch (e) { console.error("Return error:", e); }
        setActionLoading(false);
    };

    const handleTransfer = async (toUser) => {
        if (!user || !item || actionLoading) return;
        setActionLoading(true);
        try {
            await updateDoc(doc(getFirebaseDb(), "items", item.id), {
                status: "out",
                currentHolder: toUser.id,
                currentHolderName: toUser.name,
                currentHolderPhoto: toUser.photoURL || null,
                updatedAt: serverTimestamp(),
            });
            await addDoc(collection(getFirebaseDb(), "transfers"), {
                itemId: item.id, itemName: item.name, itemType: item.type,
                fromUserId: user.uid, fromUserName: userData.name,
                toUserId: toUser.id, toUserName: toUser.name,
                action: "transfer", eventName: eventName.trim() || null,
                timestamp: serverTimestamp(),
            });
            setEventName("");
            setShowTransferModal(false);
        } catch (e) { console.error("Transfer error:", e); }
        setActionLoading(false);
    };

    if (loading || itemLoading) {
        return (
            <div className="min-h-screen">
                <Navbar />
                <div className="flex justify-center py-32"><div className="spinner"></div></div>
            </div>
        );
    }

    if (!item) {
        return (
            <div className="min-h-screen">
                <Navbar />
                <div className="max-w-2xl mx-auto px-4 py-20 text-center">
                    <p className="text-5xl mb-4 opacity-40">{"\u{1F50D}"}</p>
                    <h2 className="text-xl font-bold mb-2">Item not found</h2>
                    <p className="text-[var(--text-muted)]">This item may have been removed.</p>
                </div>
            </div>
        );
    }

    const isInOffice = item.status === "office";
    const isCurrentHolder = user ? item.currentHolder === user.uid : false;
    const holderPhoto = item.currentHolderPhoto || usersMap[item.currentHolder]?.photoURL;

    const formatDate = (timestamp) => {
        if (!timestamp) return "";
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString("en-GB", {
            day: "numeric", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    };

    const getUserPhoto = (userId) => {
        if (!userId) return null;
        return usersMap[userId]?.photoURL || null;
    };

    const getTimelineLabel = (transfer) => {
        switch (transfer.action) {
            case "pickup": return "picked up from office";
            case "return": return "returned to office";
            case "transfer": return null; // handled separately
            default: return "unknown action";
        }
    };

    return (
        <div className="min-h-screen">
            <Navbar />
            <main className="max-w-2xl mx-auto px-4 sm:px-8 py-5 sm:py-8">
                {/* Back */}
                <button
                    onClick={() => router.push("/")}
                    className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-5 sm:mb-6 text-[14px] font-medium"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                    Back
                </button>

                {/* Item Header — compact */}
                <div className="card p-4 sm:p-5">
                    <div className="flex items-center gap-4">
                        {item.photoURL ? (
                            <img src={item.photoURL} alt={item.name} className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover ring-1 ring-black/5 flex-shrink-0" />
                        ) : (
                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center text-2xl sm:text-3xl flex-shrink-0">
                                {TYPE_EMOJI[item.type] || "\u{1F4E6}"}
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                                <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">{item.name}</h1>
                                <div className={`status-badge flex-shrink-0 ${isInOffice ? "status-office" : "status-out"}`}>
                                    <span className={`status-dot ${isInOffice ? "office" : "out"}`}></span>
                                    {isInOffice ? "Office" : "Out"}
                                </div>
                            </div>
                            <span className={`type-badge mt-1.5 type-${item.type}`}>
                                {item.type}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Status + Actions — the hero section */}
                <div className="card p-4 sm:p-6 mt-3 sm:mt-4">
                    {isInOffice ? (
                        /* Available in office */
                        <div>
                            <div className="flex items-center gap-4 mb-5">
                                <div className="w-12 h-12 rounded-full bg-[var(--status-office-bg)] flex items-center justify-center flex-shrink-0">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--status-office)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                        <polyline points="9 22 9 12 15 12 15 22" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-semibold text-[15px]">Available in the office</p>
                                    <p className="text-[13px] text-[var(--text-muted)]">Ready to be picked up</p>
                                </div>
                            </div>

                            {!user ? (
                                <div className="mt-4 text-[14px] text-[var(--text-muted)] p-4 rounded-xl bg-[var(--bg-secondary)] text-center">
                                    Please <button onClick={signInWithGoogle} className="font-medium text-[var(--text-primary)] underline">sign in</button> to pick up this item.
                                </div>
                            ) : (
                                <>
                                    {/* Event name — required */}
                                    <div className="mb-4">
                                        <label className="text-[13px] font-medium text-[var(--text-secondary)] mb-1.5 block">Event name</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Erasmus Welcome Week"
                                            value={eventName}
                                            onChange={(e) => setEventName(e.target.value)}
                                            className="input-field !text-[14px]"
                                        />
                                    </div>

                                    <button
                                        onClick={handlePickup}
                                        disabled={actionLoading || !eventName.trim()}
                                        className="btn-action pickup disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                            <polyline points="17 8 12 3 7 8" />
                                            <line x1="12" y1="3" x2="12" y2="15" />
                                        </svg>
                                        Pick up from office
                                        {actionLoading && <span className="ml-auto spinner !w-4 !h-4 !border-2"></span>}
                                    </button>
                                </>
                            )}
                        </div>
                    ) : (
                        /* Checked out to someone */
                        <div>
                            <div className="flex items-center gap-4 mb-5">
                                {holderPhoto ? (
                                    <img src={holderPhoto} alt={item.currentHolderName} className="w-12 h-12 rounded-full ring-2 ring-[var(--status-out-border)] flex-shrink-0" referrerPolicy="no-referrer" />
                                ) : (
                                    <div className="w-12 h-12 rounded-full bg-[var(--status-out-bg)] flex items-center justify-center text-lg font-semibold text-[var(--status-out)] flex-shrink-0">
                                        {item.currentHolderName?.[0]}
                                    </div>
                                )}
                                <div>
                                    <p className="text-[13px] text-[var(--text-muted)]">Currently with</p>
                                    <p className="font-semibold text-[15px]">{item.currentHolderName || "Unknown"}</p>
                                </div>
                            </div>

                            {isCurrentHolder ? (
                                <div>
                                    {/* Event name — optional for returning/transferring */}
                                    <div className="mb-4">
                                        <label className="text-[13px] font-medium text-[var(--text-secondary)] mb-1.5 block">Event name (Optional)</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Erasmus Welcome Week"
                                            value={eventName}
                                            onChange={(e) => setEventName(e.target.value)}
                                            className="input-field !text-[14px]"
                                        />
                                    </div>

                                    <div className="space-y-2.5">
                                        <button
                                            onClick={handleReturn}
                                            disabled={actionLoading}
                                            className="btn-action return-item disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                <polyline points="7 10 12 15 17 10" />
                                                <line x1="12" y1="15" x2="12" y2="3" />
                                            </svg>
                                            Return to office
                                            {actionLoading && <span className="ml-auto spinner !w-4 !h-4 !border-2"></span>}
                                        </button>
                                        <button
                                            onClick={() => setShowTransferModal(true)}
                                            disabled={actionLoading}
                                            className="btn-action transfer disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                                <circle cx="8.5" cy="7" r="4" />
                                                <line x1="20" y1="8" x2="20" y2="14" />
                                                <line x1="23" y1="11" x2="17" y2="11" />
                                            </svg>
                                            Pass to someone
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-[14px] text-[var(--text-muted)] p-4 rounded-xl bg-[var(--bg-secondary)] text-center">
                                    Only <span className="font-medium text-[var(--text-primary)]">{item.currentHolderName}</span> can return or transfer this item.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Transfer History */}
                <div className="mt-6 sm:mt-8">
                    <h2 className="font-semibold text-base sm:text-lg mb-4">History</h2>

                    {transfersLoading ? (
                        <div className="flex justify-center py-12"><div className="spinner"></div></div>
                    ) : transfers.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-sm text-[var(--text-muted)]">No history yet</p>
                        </div>
                    ) : (
                        <div className="card overflow-hidden">
                            {transfers.map((transfer, index) => (
                                <div
                                    key={transfer.id}
                                    className={`flex items-start gap-3 p-4 sm:p-5 ${index !== transfers.length - 1 ? "border-b border-[var(--border-subtle)]" : ""
                                        }`}
                                >
                                    {/* User avatar */}
                                    {transfer.action === "transfer" ? (
                                        <div className="flex -space-x-2 flex-shrink-0">
                                            {getUserPhoto(transfer.fromUserId) ? (
                                                <img src={getUserPhoto(transfer.fromUserId)} alt="" className="w-8 h-8 rounded-full ring-2 ring-white" referrerPolicy="no-referrer" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] ring-2 ring-white flex items-center justify-center text-xs font-semibold text-[var(--text-muted)]">
                                                    {transfer.fromUserName?.[0]}
                                                </div>
                                            )}
                                            {getUserPhoto(transfer.toUserId) ? (
                                                <img src={getUserPhoto(transfer.toUserId)} alt="" className="w-8 h-8 rounded-full ring-2 ring-white" referrerPolicy="no-referrer" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] ring-2 ring-white flex items-center justify-center text-xs font-semibold text-[var(--text-muted)]">
                                                    {transfer.toUserName?.[0]}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        (() => {
                                            const userId = transfer.action === "pickup" ? transfer.toUserId : transfer.fromUserId;
                                            const userName = transfer.action === "pickup" ? transfer.toUserName : transfer.fromUserName;
                                            const photo = getUserPhoto(userId);
                                            return photo ? (
                                                <img src={photo} alt="" className="w-8 h-8 rounded-full ring-1 ring-black/5 flex-shrink-0" referrerPolicy="no-referrer" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center text-xs font-semibold text-[var(--text-muted)] flex-shrink-0">
                                                    {userName?.[0]}
                                                </div>
                                            );
                                        })()
                                    )}

                                    <div className="flex-1 min-w-0">
                                        <p className="text-[14px] text-[var(--text-primary)] leading-snug">
                                            {transfer.action === "transfer" ? (
                                                <>
                                                    <span className="font-semibold">{transfer.fromUserName}</span>
                                                    {" \u2192 "}
                                                    <span className="font-semibold">{transfer.toUserName}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="font-semibold">
                                                        {transfer.action === "pickup" ? transfer.toUserName : transfer.fromUserName}
                                                    </span>{" "}
                                                    <span className="text-[var(--text-secondary)]">{getTimelineLabel(transfer)}</span>
                                                </>
                                            )}
                                        </p>
                                        {transfer.eventName && (
                                            <p className="text-[12px] mt-1 text-[var(--esn-magenta)] font-medium">{transfer.eventName}</p>
                                        )}
                                        <p className="text-[12px] text-[var(--text-muted)] mt-1">{formatDate(transfer.timestamp)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {showTransferModal && (
                <TransferModal
                    onClose={() => setShowTransferModal(false)}
                    onTransfer={handleTransfer}
                    currentUserId={user?.uid}
                />
            )}
        </div>
    );
}