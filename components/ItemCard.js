"use client";

import Link from "next/link";

const TYPE_EMOJI = {
    camera: "📷",
    tondela: "🧸",
    card: "💳",
};

export default function ItemCard({ item }) {
    const isInOffice = item.status === "office";

    return (
        <Link href={`/item/${item.id}`}>
            <div className="glass-card overflow-hidden cursor-pointer group">
                {/* Image */}
                {item.photoURL ? (
                    <img
                        src={item.photoURL}
                        alt={item.name}
                        className="item-image group-hover:scale-105 transition-transform duration-500"
                    />
                ) : (
                    <div className="item-image-placeholder">
                        {TYPE_EMOJI[item.type] || "📦"}
                    </div>
                )}

                {/* Content */}
                <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className="font-semibold text-lg leading-tight">
                                {item.name}
                            </h3>
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
                            {isInOffice ? "Office" : "Out"}
                        </div>
                    </div>

                    {/* Holder info */}
                    <div className="flex items-center gap-2 text-sm">
                        {isInOffice ? (
                            <span className="text-[var(--text-muted)]">
                                Available in the office
                            </span>
                        ) : (
                            <span className="text-[var(--text-secondary)]">
                                With{" "}
                                <span className="font-medium text-[var(--text-primary)]">
                                    {item.currentHolderName || "Unknown"}
                                </span>
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </Link>
    );
}
