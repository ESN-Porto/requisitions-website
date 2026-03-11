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
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

export default function ScanPage() {
    const { user, userData, loading, signInWithGoogle } = useAuth();
    const params = useParams();
    const router = useRouter();
    const [item, setItem] = useState(null);
    const [categories, setCategories] = useState([]);
    const [itemLoading, setItemLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        if (!params.id) return;

        const unsubItem = onSnapshot(doc(getFirebaseDb(), "items", params.id), (docSnap) => {
            if (docSnap.exists()) {
                setItem({ id: docSnap.id, ...docSnap.data() });
            }
            setItemLoading(false);
        });

        const unsubCategories = onSnapshot(
            query(collection(getFirebaseDb(), "categories"), orderBy("name")),
            (snap) => setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        );

        return () => {
            unsubItem();
            unsubCategories();
        };
    }, [params.id]);

    const handlePickup = async () => {
        if (!user || !userData || !item || actionLoading) return;
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
                action: "pickup", eventName: null,
                note: null,
                timestamp: serverTimestamp(),
            });
        } catch (e) { console.error("Pickup error:", e); }
        setActionLoading(false);
    };

    const handleReturn = async () => {
        if (!user || !userData || !item || actionLoading) return;
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
                action: "return", eventName: null,
                note: null,
                timestamp: serverTimestamp(),
            });
        } catch (e) { console.error("Return error:", e); }
        setActionLoading(false);
    };

    const handleTransfer = async (toUser) => {
        if (!user || !userData || !item || actionLoading) return;
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
                action: "transfer", eventName: null,
                note: null,
                timestamp: serverTimestamp(),
            });
            setShowTransferModal(false);
        } catch (e) { console.error("Transfer error:", e); }
        setActionLoading(false);
    };

    const handleTakeFrom = async () => {
        if (!user || !userData || !item || actionLoading) return;
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
                fromUserId: item.currentHolder, fromUserName: item.currentHolderName || "Unknown",
                toUserId: user.uid, toUserName: userData.name,
                action: "transfer", eventName: null,
                note: null,
                timestamp: serverTimestamp(),
            });
            setShowConfirm(false);
        } catch (e) { console.error("Take error:", e); }
        setActionLoading(false);
    };

    // Loading
    if (loading || itemLoading || (user && !userData)) {
        return (
            <div className="scan-page">
                <div className="w-full h-full flex flex-col justify-end pb-8 px-5 animate-pulse">
                    <div className="w-full aspect-square bg-[rgba(255,255,255,0.08)] rounded-[32px] mb-8 mt-12"></div>
                    <div className="h-48 w-full bg-[rgba(255,255,255,0.08)] rounded-[24px]"></div>
                </div>
            </div>
        );
    }

    // Not found
    if (!item) {
        return (
            <div className="scan-page">
                <div className="flex flex-col items-center justify-center gap-3" style={{ height: "100%", padding: "32px" }}>
                    <div style={{ fontSize: "56px", opacity: 0.2, fontWeight: 200 }}>?</div>
                    <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.02em" }}>Item not found</h2>
                    <p style={{ color: "var(--text-muted)", fontSize: "15px" }}>This item may have been removed.</p>
                    <button onClick={() => router.push("/")} className="scan-btn-primary" style={{ marginTop: "12px", maxWidth: "200px" }}>
                        Go Home
                    </button>
                </div>
            </div>
        );
    }

    const isInOffice = item.status === "office";
    const isCurrentHolder = user ? item.currentHolder === user.uid : false;
    const cat = categories.find((c) => c.key === item.type);
    const badgeStyle = cat
        ? { background: cat.bgColor, color: cat.color, border: `1px solid ${cat.borderColor}` }
        : undefined;

    let state;
    if (isInOffice) state = "A";
    else if (isCurrentHolder) state = "B";
    else state = "C";

    const holderFirstName = item.currentHolderName?.split(" ")[0] || "them";

    return (
        <div className="scan-page">
            {/* Close */}
            <button onClick={() => router.push("/")} className="scan-close" aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>

            {/* Hero */}
            <div className="scan-hero">
                {state === "A" && (
                    item.photoURL ? (
                        <img src={item.photoURL} alt={item.name} className="scan-hero-img" />
                    ) : (
                        <div className="scan-hero-placeholder">
                            <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.75" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                        </div>
                    )
                )}

                {state === "B" && (
                    <>
                        {item.photoURL ? (
                            <img src={item.photoURL} alt={item.name} className="scan-hero-img" />
                        ) : (
                            <div className="scan-hero-placeholder" />
                        )}
                        <div className="scan-avatar-overlay">
                            {userData?.photoURL ? (
                                <img src={userData.photoURL} alt="You" className="scan-avatar-img" referrerPolicy="no-referrer" />
                            ) : (
                                <div className="scan-avatar-fallback">
                                    {userData?.name?.[0]}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {state === "C" && (
                    <>
                        {item.photoURL ? (
                            <img src={item.photoURL} alt="" className="scan-hero-img scan-hero-blurred" />
                        ) : (
                            <div className="scan-hero-placeholder" />
                        )}
                        <div className="scan-holder-center">
                            {item.currentHolderPhoto ? (
                                <img src={item.currentHolderPhoto} alt={item.currentHolderName} className="scan-holder-img" referrerPolicy="no-referrer" />
                            ) : (
                                <div className="scan-holder-fallback">
                                    {item.currentHolderName?.[0]}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Panel */}
            <div className="scan-panel">
                <div className="scan-panel-inner">

                    <div className="scan-info">
                        <div className="scan-status">
                            <span className={`scan-status-dot ${isInOffice ? "office" : "out"}`} />
                            <span className="scan-status-label">{isInOffice ? "In Office" : "Checked Out"}</span>
                        </div>
                        <h1 className="scan-item-name">{item.name}</h1>
                        {cat && (
                            <span className="scan-subtitle">{cat.name}</span>
                        )}
                    </div>

                    {state === "B" && (
                        <p className="scan-context">You have this item</p>
                    )}

                    {state === "C" && (
                        <p className="scan-context">
                            Currently with <strong>{item.currentHolderName}</strong>
                        </p>
                    )}

                    <div className="scan-actions">
                        {!user ? (
                            <button onClick={signInWithGoogle} className="scan-btn-google">
                                <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
                                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                                </svg>
                                Sign in with Google
                            </button>
                        ) : state === "A" ? (
                            <button onClick={handlePickup} disabled={actionLoading} className="scan-btn-primary">
                                {actionLoading ? (
                                    <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
                                ) : (
                                    "Pick up from Office"
                                )}
                            </button>
                        ) : state === "B" ? (
                            <>
                                <button onClick={handleReturn} disabled={actionLoading} className="scan-btn-primary">
                                    {actionLoading ? (
                                        <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
                                    ) : (
                                        "Return to Office"
                                    )}
                                </button>
                                <button onClick={() => setShowTransferModal(true)} disabled={actionLoading} className="scan-btn-secondary">
                                    Pass to Someone
                                </button>
                            </>
                        ) : (
                            <button onClick={() => setShowConfirm(true)} disabled={actionLoading} className="scan-btn-primary">
                                {actionLoading ? (
                                    <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
                                ) : (
                                    `Take from ${holderFirstName}`
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Transfer Modal */}
            {showTransferModal && (
                <TransferModal
                    onClose={() => setShowTransferModal(false)}
                    onTransfer={handleTransfer}
                    currentUserId={user?.uid}
                />
            )}

            {/* Confirmation Bottom Sheet */}
            {showConfirm && (
                <div className="scan-confirm-overlay" onClick={() => !actionLoading && setShowConfirm(false)}>
                    <div className="scan-confirm-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="scan-confirm-content">
                            <div className="scan-confirm-icon">
                                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    <line x1="12" y1="9" x2="12" y2="13" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                            </div>
                            <h3 className="scan-confirm-title">Take this item?</h3>
                            <p className="scan-confirm-desc">
                                You&rsquo;re taking <strong>{item.name}</strong> from <strong>{item.currentHolderName}</strong>. This will log that they handed it to you.
                            </p>
                            <div className="scan-confirm-actions">
                                <button onClick={() => setShowConfirm(false)} disabled={actionLoading} className="scan-btn-secondary">
                                    Cancel
                                </button>
                                <button onClick={handleTakeFrom} disabled={actionLoading} className="scan-btn-primary">
                                    {actionLoading ? (
                                        <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
                                    ) : (
                                        "Confirm"
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
