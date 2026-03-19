"use client";

import Link from "next/link";

export default function ItemCard({ item }) {
    const isInOffice = item.status === "office";

    return (
        <Link href={`/item/${item.id}`}>
            <div className="card card-interactive overflow-hidden">
                {/* Edge-to-edge image */}
                {item.photoURL ? (
                    <div className="item-image-wrapper">
                        <img
                            src={item.photoURL}
                            alt={item.name}
                            className="item-image"
                        />
                    </div>
                ) : (
                    <div className="item-image-placeholder">
                        {"\u{1F4E6}"}
                    </div>
                )}

                {/* Title + Status */}
                <div className="card-content">
                    <h3 className="card-title">{item.name}</h3>
                    <div className="card-status">
                        <span className={`card-status-dot ${isInOffice ? "office" : "out"}`}></span>
                        <span className="card-status-text">
                            {isInOffice ? "In Office" : `With ${item.currentHolderName || "Someone"}`}
                        </span>
                    </div>
                </div>
            </div>
        </Link>
    );
}
