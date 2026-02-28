"use client";

import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

const TYPE_EMOJI = {
    camera: "\u{1F4F7}",
    tondela: "\u{1F9F8}",
    card: "\u{1F4B3}",
};

export default function HistoryPage() {
    const { loading } = useAuth();
    const [transfers, setTransfers] = useState([]);
    const [transfersLoading, setTransfersLoading] = useState(true);
    const [filter, setFilter] = useState("all");

    useEffect(() => {
        const q = query(
            collection(getFirebaseDb(), "transfers"),
            orderBy("timestamp", "desc"),
            limit(100)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
            setTransfers(data);
            setTransfersLoading(false);
        });

        return () => unsubscribe();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen">
                <Navbar />
                <div className="flex justify-center py-32">
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    const filteredTransfers =
        filter === "all"
            ? transfers
            : transfers.filter((t) => t.action === filter);

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
                        picked up{" "}
                        <span className="font-medium">{transfer.itemName}</span>{" "}
                        from office
                    </>
                );
            case "return":
                return (
                    <>
                        <span className="font-semibold text-[var(--text-primary)]">
                            {transfer.fromUserName}
                        </span>{" "}
                        returned{" "}
                        <span className="font-medium">{transfer.itemName}</span>{" "}
                        to office
                    </>
                );
            case "transfer":
                return (
                    <>
                        <span className="font-semibold text-[var(--text-primary)]">
                            {transfer.fromUserName}
                        </span>{" "}
                        passed{" "}
                        <span className="font-medium">{transfer.itemName}</span>{" "}
                        to{" "}
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
            <main className="max-w-3xl mx-auto px-4 sm:px-8 py-5 sm:py-8">
                <div className="mb-5 sm:mb-8">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Activity History</h1>
                    <p className="text-[14px] sm:text-[15px] text-[var(--text-muted)] mt-1">
                        All item movements across the team
                    </p>
                </div>

                {/* Filters */}
                <div className="flex gap-2 mb-5 sm:mb-6 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                    {[
                        { key: "all", label: "All" },
                        { key: "pickup", label: "Pickups" },
                        { key: "return", label: "Returns" },
                        { key: "transfer", label: "Transfers" },
                    ].map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setFilter(key)}
                            className={`filter-pill ${filter === key ? "active" : ""}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Activity List */}
                {transfersLoading ? (
                    <div className="flex justify-center py-24">
                        <div className="spinner"></div>
                    </div>
                ) : filteredTransfers.length === 0 ? (
                    <div className="text-center py-24">
                        <p className="text-5xl mb-4 opacity-40">{"\u{1F4CB}"}</p>
                        <p className="font-semibold text-[var(--text-secondary)]">
                            No activity yet
                        </p>
                        <p className="text-sm text-[var(--text-muted)] mt-1">
                            Item movements will appear here
                        </p>
                    </div>
                ) : (
                    <div className="card overflow-hidden">
                        {filteredTransfers.map((transfer, index) => (
                            <div
                                key={transfer.id}
                                className={`flex items-start gap-4 p-5 transition-colors hover:bg-[var(--bg-secondary)]/50 ${
                                    index !== filteredTransfers.length - 1
                                        ? "border-b border-[var(--border-subtle)]"
                                        : ""
                                }`}
                            >
                                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${getActionDotColor(transfer.action)}`} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed">
                                        {getActionText(transfer)}
                                    </p>
                                    {transfer.eventName && (
                                        <p className="text-xs mt-1.5 text-[var(--esn-magenta)] font-medium">
                                            {transfer.eventName}
                                        </p>
                                    )}
                                    <p className="text-xs text-[var(--text-muted)] mt-1.5">
                                        {formatDate(transfer.timestamp)}
                                    </p>
                                </div>
                                <span className={`type-badge flex-shrink-0 type-${transfer.itemType || "camera"}`}>
                                    {TYPE_EMOJI[transfer.itemType] || "\u{1F4E6}"}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}