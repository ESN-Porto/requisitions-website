"use client";

import Link from "next/link";

export default function ItemCard({ item, categories = [] }) {
    const isInOffice = item.status === "office";
    const cat = categories.find((c) => c.key === item.type);

    const badgeStyle = cat
        ? {
            background: cat.bgColor,
            color: cat.color,
            border: `1px solid ${cat.borderColor}`,
        }
        : undefined;

    return (
        <Link href={`/item/${item.id}`}>
            <div className="card card-interactive overflow-hidden">
                {/* Image */}
                {item.photoURL ? (
                    <img
                        src={item.photoURL}
                        alt={item.name}
                        className="item-image"
                    />
                ) : (
                    <div className="item-image-placeholder">
                        {"\u{1F4E6}"}
                    </div>
                )}

                {/* Content */}
                <div className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                        <h3 className="font-semibold text-[15px] text-[var(--text-primary)] leading-tight">
                            {item.name}
                        </h3>
                        <div
                            className={`status-badge flex-shrink-0 ${isInOffice ? "status-office" : "status-out"}`}
                        >
                            <span
                                className={`status-dot ${isInOffice ? "office" : "out"}`}
                            ></span>
                            {isInOffice ? "Office" : "Out"}
                        </div>
                    </div>

                    <span className="type-badge" style={badgeStyle}>
                        {item.type}
                    </span>

                    <p className="text-[13px] text-[var(--text-secondary)] mt-3">
                        {isInOffice ? (
                            "Available in the office"
                        ) : (
                            <>
                                With{" "}
                                <span className="font-medium text-[var(--text-primary)]">
                                    {item.currentHolderName || "Unknown"}
                                </span>
                            </>
                        )}
                    </p>
                </div>
            </div>
        </Link>
    );
}
