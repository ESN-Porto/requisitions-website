"use client";

import { useAuth } from "@/contexts/AuthContext";
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
    orderBy,
    onSnapshot,
    getDocs,
    serverTimestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

export default function ItemDetailPage() {
    const { user, userData, loading, signInWithGoogle, isAdmin } = useAuth();
    const params = useParams();
    const router = useRouter();
    const [item, setItem] = useState(null);
    const [transfers, setTransfers] = useState([]);
    const [categories, setCategories] = useState([]);
    const [usersMap, setUsersMap] = useState({});
    const [itemLoading, setItemLoading] = useState(true);
    const [transfersLoading, setTransfersLoading] = useState(true);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [eventName, setEventName] = useState("");
    const [note, setNote] = useState("");
    const [adminOverrideLoading, setAdminOverrideLoading] = useState(false);
    const [showAdminTransferModal, setShowAdminTransferModal] = useState(false);
    const [pendingAction, setPendingAction] = useState(null); // null | "pickup" | "return" | "pass"
    const [visibleCount, setVisibleCount] = useState(10);

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

        const unsubCategories = onSnapshot(
            query(collection(getFirebaseDb(), "categories"), orderBy("name")),
            (snap) => setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        );

        return () => {
            unsubItem();
            unsubTransfers();
            unsubCategories();
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
                note: note.trim() || null,
                timestamp: serverTimestamp(),
            });
            setEventName(""); setNote(""); setPendingAction(null);
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
                note: note.trim() || null,
                timestamp: serverTimestamp(),
            });
            setEventName(""); setNote(""); setPendingAction(null);
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
                note: note.trim() || null,
                timestamp: serverTimestamp(),
            });
            setEventName(""); setNote(""); setPendingAction(null);
            setShowTransferModal(false);
        } catch (e) { console.error("Transfer error:", e); }
        setActionLoading(false);
    };

    const handleAdminReturn = async () => {
        if (!item || adminOverrideLoading) return;
        setAdminOverrideLoading(true);
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
                fromUserId: item.currentHolder || null, fromUserName: item.currentHolderName || "Unknown",
                toUserId: null, toUserName: "Office",
                action: "return", eventName: null,
                adminOverride: true,
                timestamp: serverTimestamp(),
            });
        } catch (e) { console.error("Admin return error:", e); }
        setAdminOverrideLoading(false);
    };

    const handleAdminAssign = async (toUser) => {
        if (!item || adminOverrideLoading) return;
        setAdminOverrideLoading(true);
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
                fromUserId: item.currentHolder || null,
                fromUserName: item.status === "office" ? "Office" : (item.currentHolderName || "Unknown"),
                toUserId: toUser.id, toUserName: toUser.name,
                action: item.status === "office" ? "pickup" : "transfer",
                eventName: null,
                adminOverride: true,
                timestamp: serverTimestamp(),
            });
            setShowAdminTransferModal(false);
        } catch (e) { console.error("Admin assign error:", e); }
        setAdminOverrideLoading(false);
    };

    if (loading || itemLoading) {
        return (
            <div className="min-h-screen">
                <main className="max-w-2xl mx-auto px-4 sm:px-8 py-5 sm:py-8 animate-pulse mt-4">
                    <div className="h-4 w-16 bg-[var(--border-subtle)] rounded mb-5 sm:mb-6"></div>
                    <div className="w-full aspect-square max-h-[320px] sm:max-h-[380px] bg-[var(--bg-secondary)] rounded-[var(--radius-xl)] sm:rounded-[24px] mb-5"></div>
                    <div className="flex justify-center mb-5 sm:mb-6">
                        <div className="h-6 sm:h-8 w-1/2 bg-[var(--border-subtle)] rounded-md"></div>
                    </div>
                </main>
            </div>
        );
    }

    if (!item) {
        return (
            <div className="min-h-screen">
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
    const cat = categories.find((c) => c.key === item.type);
    const badgeStyle = cat
        ? { background: cat.bgColor, color: cat.color, border: `1px solid ${cat.borderColor}` }
        : undefined;

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

                {/* Hero Image */}
                <div className="item-hero">
                    {item.photoURL ? (
                        <img src={item.photoURL} alt={item.name} />
                    ) : (
                        <div className="item-hero-placeholder">
                            {"\u{1F4E6}"}
                        </div>
                    )}
                </div>

                {/* Title — centered below hero */}
                <div className="text-center mb-5 sm:mb-6">
                    <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight leading-tight">{item.name}</h1>
                </div>

                {/* Status card */}
                <div className="card overflow-hidden">
                    {/* Status row */}
                    <div className="flex items-center gap-3.5 p-4 sm:px-6 sm:py-5">
                        {isInOffice ? (
                            <>
                                <div className="w-10 h-10 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center flex-shrink-0">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                        <polyline points="9 22 9 12 15 12 15 22" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-semibold text-[15px] text-[var(--text-primary)]">Available in the office</p>
                                    <p className="text-[13px] text-[var(--text-muted)]">Ready to be picked up</p>
                                </div>
                            </>
                        ) : (
                            <>
                                {holderPhoto ? (
                                    <img src={holderPhoto} alt={item.currentHolderName} className="w-10 h-10 rounded-full ring-1 ring-black/5 flex-shrink-0" referrerPolicy="no-referrer" />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center text-sm font-semibold text-[var(--text-secondary)] flex-shrink-0">
                                        {item.currentHolderName?.[0]}
                                    </div>
                                )}
                                <div>
                                    <p className="text-[13px] text-[var(--text-muted)]">Currently with</p>
                                    <p className="font-semibold text-[15px]">{item.currentHolderName || "Unknown"}</p>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Not logged in message */}
                    {isInOffice && !user && (
                        <div className="px-4 sm:px-6 pb-5 text-[14px] text-[var(--text-muted)]">
                            <button onClick={signInWithGoogle} className="font-medium text-[var(--text-primary)] underline">Sign in</button> to pick up this item.
                        </div>
                    )}

                    {/* Non-holder message */}
                    {!isInOffice && !isCurrentHolder && (
                        <div className="px-4 sm:px-6 pb-4 text-[13px] text-[var(--text-muted)]">
                            Only <span className="font-medium text-[var(--text-secondary)]">{item.currentHolderName}</span> can return or transfer this item.
                        </div>
                    )}

                    {/* Admin actions */}
                    {isAdmin && user && (
                        <div className="border-t border-[var(--border-subtle)] px-4 sm:px-6 py-3.5 flex items-center gap-2.5">
                            <span className="text-[12px] font-medium text-[var(--text-muted)] uppercase tracking-wider mr-auto">Admin</span>
                            {!isInOffice && (
                                <button
                                    onClick={handleAdminReturn}
                                    disabled={adminOverrideLoading}
                                    className="btn-action-inline"
                                >
                                    Force return
                                    {adminOverrideLoading && <span className="spinner !w-3.5 !h-3.5 !border-2"></span>}
                                </button>
                            )}
                            <button
                                onClick={() => setShowAdminTransferModal(true)}
                                disabled={adminOverrideLoading}
                                className="btn-action-inline"
                            >
                                {isInOffice ? "Assign to someone" : "Reassign"}
                            </button>
                        </div>
                    )}
                </div>

                {/* Transfer History */}
                <div className="mt-6 sm:mt-8 pb-28">
                    <h2 className="font-semibold text-base sm:text-lg mb-4 px-1">History</h2>

                    {transfersLoading ? (
                        <div className="card overflow-hidden animate-pulse">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="flex items-start gap-3 p-4 sm:p-5 border-b border-[var(--border-subtle)]">
                                    <div className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] flex-shrink-0"></div>
                                    <div className="flex-1">
                                        <div className="h-3.5 w-full bg-[var(--bg-secondary)] rounded-md mb-2"></div>
                                        <div className="h-3.5 w-3/4 bg-[var(--bg-secondary)] rounded-md mb-2"></div>
                                        <div className="h-2.5 w-1/4 bg-[var(--bg-secondary)] rounded-md mt-1"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : transfers.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-sm text-[var(--text-muted)]">No history yet</p>
                        </div>
                    ) : (
                        <div className="card overflow-hidden">
                            {transfers.slice(0, visibleCount).map((transfer, index, arr) => (
                                <div
                                    key={transfer.id}
                                    className={`flex items-start gap-3 p-4 sm:p-5 ${index !== arr.length - 1 ? "border-b border-[var(--border-subtle)]" : ""
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
                                        {transfer.note && (
                                            <p className="text-[12px] mt-0.5 text-[var(--text-muted)] italic">{transfer.note}</p>
                                        )}
                                        <div className="flex items-center gap-2 mt-1">
                                            <p className="text-[12px] text-[var(--text-muted)]">{formatDate(transfer.timestamp)}</p>
                                            {transfer.adminOverride && (
                                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" }}>
                                                    admin override
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {visibleCount < transfers.length && (
                                <button
                                    onClick={() => setVisibleCount((n) => n + 10)}
                                    className="w-full p-3.5 text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors border-t border-[var(--border-subtle)]"
                                >
                                    Load more ({transfers.length - visibleCount} remaining)
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Floating action bar */}
            {((isInOffice && user) || isCurrentHolder) && (
                <div className="floating-bar">
                    <div className="floating-bar-inner max-w-2xl mx-auto">
                        {pendingAction ? (
                            <>
                                {/* Grouped inputs */}
                                <div className="bg-[var(--bg-secondary)] rounded-[12px] mb-3">
                                    <div className="px-4">
                                        <label className="text-[13px] font-medium text-[var(--text-secondary)] pt-2.5 block">
                                            Event name{" "}
                                            {pendingAction !== "pickup" && <span className="text-[var(--text-muted)] font-normal">(optional)</span>}
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Erasmus Welcome Week"
                                            value={eventName}
                                            onChange={(e) => setEventName(e.target.value)}
                                            className="input-grouped"
                                        />
                                    </div>
                                    <div className="mx-4 border-t border-[var(--border-subtle)]"></div>
                                    <div className="px-4">
                                        <label className="text-[13px] font-medium text-[var(--text-secondary)] pt-2.5 block">Note <span className="text-[var(--text-muted)] font-normal">(optional)</span></label>
                                        <input
                                            type="text"
                                            placeholder={pendingAction === "pickup" ? "e.g. Taking it to building B" : "e.g. Left it on the shelf in room 2.1"}
                                            value={note}
                                            onChange={(e) => setNote(e.target.value)}
                                            className="input-grouped"
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-2.5">
                                    <button
                                        onClick={
                                            pendingAction === "pickup" ? handlePickup :
                                            pendingAction === "return" ? handleReturn :
                                            () => setShowTransferModal(true)
                                        }
                                        disabled={actionLoading || (pendingAction === "pickup" && !eventName.trim())}
                                        className="btn-action-primary flex-1"
                                    >
                                        {pendingAction === "pickup" ? "Confirm pickup" :
                                         pendingAction === "return" ? "Confirm return" :
                                         "Choose person"}
                                        {actionLoading && <span className="ml-2 spinner !w-4 !h-4 !border-2"></span>}
                                    </button>
                                    <button
                                        onClick={() => { setPendingAction(null); setEventName(""); setNote(""); }}
                                        className="btn-action-secondary flex-[0.6]"
                                        disabled={actionLoading}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </>
                        ) : isInOffice ? (
                            <button
                                onClick={() => setPendingAction("pickup")}
                                className="btn-action-primary"
                            >
                                Pick up from office
                            </button>
                        ) : (
                            <div className="flex gap-2.5">
                                <button
                                    onClick={() => setPendingAction("return")}
                                    className="btn-action-primary flex-1"
                                >
                                    Return to office
                                </button>
                                <button
                                    onClick={() => setPendingAction("pass")}
                                    className="btn-action-secondary flex-1"
                                >
                                    Pass to someone
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showTransferModal && (
                <TransferModal
                    onClose={() => setShowTransferModal(false)}
                    onTransfer={handleTransfer}
                    currentUserId={user?.uid}
                />
            )}
            {showAdminTransferModal && (
                <TransferModal
                    onClose={() => setShowAdminTransferModal(false)}
                    onTransfer={handleAdminAssign}
                    currentUserId={null}
                />
            )}
        </div>
    );
}