"use client";

import { useAuth } from "@/contexts/AuthContext";
import TransferModal, { Avatar } from "@/components/TransferModal";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useItem, useTransfers, useVolunteers, formatDate } from "@/lib/data";
import { moveItem, adminMoveItem } from "@/lib/api";

export default function ItemDetailPage() {
    const { user, isAdmin } = useAuth();
    const params = useParams();
    const router = useRouter();
    const { item, loading: itemLoading } = useItem(params.id);
    const { transfers, loading: transfersLoading } = useTransfers(item?.id);
    const { byId: volunteersById } = useVolunteers();
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [eventName, setEventName] = useState("");
    const [note, setNote] = useState("");
    const [adminOverrideLoading, setAdminOverrideLoading] = useState(false);
    const [showAdminTransferModal, setShowAdminTransferModal] = useState(false);
    const [pendingAction, setPendingAction] = useState(null); // null | "pickup" | "return" | "pass"
    const [visibleCount, setVisibleCount] = useState(10);
    const [error, setError] = useState(null);

    const resetForm = () => {
        setEventName("");
        setNote("");
        setPendingAction(null);
    };

    const run = async (action, extra = {}) => {
        if (!user || !item || actionLoading) return false;
        setActionLoading(true);
        setError(null);
        try {
            await moveItem(item.id, action, { eventName, note, ...extra });
            resetForm();
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

    const runAdmin = async (action, extra = {}) => {
        if (!item || adminOverrideLoading) return false;
        setAdminOverrideLoading(true);
        setError(null);
        try {
            await adminMoveItem(item.id, action, extra);
            return true;
        } catch (e) {
            setError(e.message);
            return false;
        } finally {
            setAdminOverrideLoading(false);
        }
    };

    const handleAdminReturn = () => runAdmin("return");
    const handleAdminAssign = async (toUser) => {
        if (await runAdmin("assign", { toUserId: toUser.id })) setShowAdminTransferModal(false);
    };

    if (itemLoading) {
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
    const isCurrentHolder = user ? item.holder_id === user.id : false;
    const holderPhoto = item.holder_photo_url || volunteersById[item.holder_id]?.photo_url;

    const getUserPhoto = (userId) => (userId ? volunteersById[userId]?.photo_url || null : null);

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
                    {item.photo_url ? (
                        <img src={item.photo_url} alt={item.name} />
                    ) : (
                        <div className="item-hero-placeholder">
                            {"\u{1F4E6}"}
                        </div>
                    )}
                </div>

                {/* Title — centered below hero */}
                <div className="text-center mb-5 sm:mb-6">
                    <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight leading-tight">{item.name}</h1>
                    {item.category_name && (
                        <p className="text-[13px] text-[var(--text-muted)] mt-1">{item.category_name}</p>
                    )}
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
                                <Avatar name={item.holder_name} src={holderPhoto} className="w-10 h-10" />
                                <div>
                                    <p className="text-[13px] text-[var(--text-muted)]">Currently with</p>
                                    <p className="font-semibold text-[15px]">{item.holder_name || "Unknown"}</p>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Non-holder message */}
                    {!isInOffice && !isCurrentHolder && (
                        <div className="px-4 sm:px-6 pb-4 text-[13px] text-[var(--text-muted)]">
                            Only <span className="font-medium text-[var(--text-secondary)]">{item.holder_name || "the current holder"}</span> can return or transfer this item.
                        </div>
                    )}

                    {error && (
                        <div className="px-4 sm:px-6 pb-4 text-[13px] text-[#ff3b30]">{error}</div>
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
                            {transfers.slice(0, visibleCount).map((transfer, index, arr) => {
                                const actorId = transfer.action === "pickup" ? transfer.to_user_id : transfer.from_user_id;
                                const actorName = transfer.action === "pickup" ? transfer.to_user_name : transfer.from_user_name;
                                return (
                                    <div
                                        key={transfer.id}
                                        className={`flex items-start gap-3 p-4 sm:p-5 ${index !== arr.length - 1 ? "border-b border-[var(--border-subtle)]" : ""}`}
                                    >
                                        {/* User avatar */}
                                        {transfer.action === "transfer" ? (
                                            <div className="flex -space-x-2 flex-shrink-0">
                                                <Avatar name={transfer.from_user_name} src={getUserPhoto(transfer.from_user_id)} className="w-8 h-8 ring-2 ring-white" textClass="text-xs" />
                                                <Avatar name={transfer.to_user_name} src={getUserPhoto(transfer.to_user_id)} className="w-8 h-8 ring-2 ring-white" textClass="text-xs" />
                                            </div>
                                        ) : (
                                            <Avatar name={actorName} src={getUserPhoto(actorId)} className="w-8 h-8" textClass="text-xs" />
                                        )}

                                        <div className="flex-1 min-w-0">
                                            <p className="text-[14px] text-[var(--text-primary)] leading-snug">
                                                {transfer.action === "transfer" ? (
                                                    <>
                                                        <span className="font-semibold">{transfer.from_user_name}</span>
                                                        {" → "}
                                                        <span className="font-semibold">{transfer.to_user_name}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="font-semibold">{actorName}</span>{" "}
                                                        <span className="text-[var(--text-secondary)]">{getTimelineLabel(transfer)}</span>
                                                    </>
                                                )}
                                            </p>
                                            {transfer.event_name && (
                                                <p className="text-[12px] mt-1 text-[var(--esn-magenta)] font-medium">{transfer.event_name}</p>
                                            )}
                                            {transfer.note && (
                                                <p className="text-[12px] mt-0.5 text-[var(--text-muted)] italic">{transfer.note}</p>
                                            )}
                                            <div className="flex items-center gap-2 mt-1">
                                                <p className="text-[12px] text-[var(--text-muted)]">{formatDate(transfer.created_at)}</p>
                                                {transfer.admin_override && (
                                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" }}>
                                                        admin override
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
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
                                        onClick={resetForm}
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
                    currentUserId={user?.id}
                />
            )}
            {showAdminTransferModal && (
                <TransferModal
                    title={isInOffice ? "Assign to someone" : "Reassign to someone"}
                    onClose={() => setShowAdminTransferModal(false)}
                    onTransfer={handleAdminAssign}
                    currentUserId={item.holder_id}
                />
            )}
        </div>
    );
}
