"use client";

import { useAuth } from "@/contexts/AuthContext";
import TransferModal from "@/components/TransferModal";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useItem } from "@/lib/data";
import { moveItem } from "@/lib/api";

/**
 * QuickScan page reached from the QR code / NFC tag on each item.
 * `params.id` may be the Supabase uuid or the legacy Firestore id printed on
 * older stickers — useItem() resolves both. The proxy already made sure the
 * visitor is a signed-in ESN volunteer.
 */
export default function ScanPage() {
    const { user, userData } = useAuth();
    const params = useParams();
    const router = useRouter();
    const { item, loading: itemLoading } = useItem(params.id);
    const [actionLoading, setActionLoading] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState(null);

    const run = async (action, extra) => {
        if (!user || !item || actionLoading) return false;
        setActionLoading(true);
        setError(null);
        try {
            await moveItem(item.id, action, extra);
            return true;
        } catch (e) {
            setError(e.message);
            return false;
        } finally {
            setActionLoading(false);
        }
    };

    const handlePickup = () => run("pickup");
    const handleReturn = () => run("return");
    const handleTransfer = async (toUser) => {
        if (await run("pass", { toUserId: toUser.id })) setShowTransferModal(false);
    };
    const handleTakeFrom = async () => {
        if (await run("take")) setShowConfirm(false);
    };

    // Loading
    if (itemLoading) {
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
    const isCurrentHolder = user ? item.holder_id === user.id : false;

    let state;
    if (isInOffice) state = "A";
    else if (isCurrentHolder) state = "B";
    else state = "C";

    const holderFirstName = item.holder_name?.split(" ")[0] || "them";

    const Spinner = () => (
        <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
    );

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
                    item.photo_url ? (
                        <img src={item.photo_url} alt={item.name} className="scan-hero-img" />
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
                        {item.photo_url ? (
                            <img src={item.photo_url} alt={item.name} className="scan-hero-img" />
                        ) : (
                            <div className="scan-hero-placeholder" />
                        )}
                        <div className="scan-avatar-overlay">
                            {userData?.photo_url ? (
                                <img src={userData.photo_url} alt="You" className="scan-avatar-img" referrerPolicy="no-referrer" />
                            ) : (
                                <div className="scan-avatar-fallback">
                                    {userData?.name?.[0]?.toUpperCase()}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {state === "C" && (
                    <>
                        {item.photo_url ? (
                            <img src={item.photo_url} alt="" className="scan-hero-img scan-hero-blurred" />
                        ) : (
                            <div className="scan-hero-placeholder" />
                        )}
                        <div className="scan-holder-center">
                            {item.holder_photo_url ? (
                                <img src={item.holder_photo_url} alt={item.holder_name} className="scan-holder-img" referrerPolicy="no-referrer" />
                            ) : (
                                <div className="scan-holder-fallback">
                                    {item.holder_name?.[0]?.toUpperCase()}
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
                        {item.category_name && (
                            <span className="scan-subtitle">{item.category_name}</span>
                        )}
                    </div>

                    {state === "B" && (
                        <p className="scan-context">You have this item</p>
                    )}

                    {state === "C" && (
                        <p className="scan-context">
                            Currently with <strong>{item.holder_name || "someone"}</strong>
                        </p>
                    )}

                    {error && (
                        <div className="login-error-msg" style={{ marginTop: "12px", maxWidth: "100%" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="scan-actions">
                        {state === "A" ? (
                            <button onClick={handlePickup} disabled={actionLoading} className="scan-btn-primary">
                                {actionLoading ? <Spinner /> : "Pick up from Office"}
                            </button>
                        ) : state === "B" ? (
                            <>
                                <button onClick={handleReturn} disabled={actionLoading} className="scan-btn-primary">
                                    {actionLoading ? <Spinner /> : "Return to Office"}
                                </button>
                                <button onClick={() => setShowTransferModal(true)} disabled={actionLoading} className="scan-btn-secondary">
                                    Pass to Someone
                                </button>
                            </>
                        ) : (
                            <button onClick={() => setShowConfirm(true)} disabled={actionLoading} className="scan-btn-primary">
                                {actionLoading ? <Spinner /> : `Take from ${holderFirstName}`}
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
                    currentUserId={user?.id}
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
                                You&rsquo;re taking <strong>{item.name}</strong> from <strong>{item.holder_name || "its current holder"}</strong>. This will log that they handed it to you.
                            </p>
                            <div className="scan-confirm-actions">
                                <button onClick={() => setShowConfirm(false)} disabled={actionLoading} className="scan-btn-secondary">
                                    Cancel
                                </button>
                                <button onClick={handleTakeFrom} disabled={actionLoading} className="scan-btn-primary">
                                    {actionLoading ? <Spinner /> : "Confirm"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
