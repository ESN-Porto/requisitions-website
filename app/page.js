"use client";

import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import ItemCard from "@/components/ItemCard";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

const TYPE_EMOJI = {
  camera: "\u{1F4F7}",
  tondela: "\u{1F9F8}",
  card: "\u{1F4B3}",
};

export default function HomePage() {
  const { user, userData, loading, signInWithGoogle } = useAuth();
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!user) return;

    const q = query(collection(getFirebaseDb(), "items"), orderBy("name"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setItems(itemsData);
      setItemsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex bg-white">
        {/* Left — Photo */}
        <div className="hidden lg:block lg:w-1/2 relative">
          <Image
            src="/assets/DSCF1187.jpg"
            alt="ESN Porto"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-black/5" />
        </div>

        {/* Right — Login */}
        <div className="w-full lg:w-1/2 flex items-center justify-center px-8">
          <div className="w-full max-w-sm text-center">
            <Image
              src="/assets/favicon.png"
              alt="ESN"
              width={56}
              height={56}
              className="mx-auto mb-8"
              priority
            />
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Item Tracker
            </h1>
            <p className="text-[15px] text-[var(--text-muted)] mt-2">
              Keep track of the section's requisitions.
            </p>
            <button onClick={signInWithGoogle} className="google-btn w-full justify-center mt-8">
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              Sign in with Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filteredItems =
    filter === "all" ? items : items.filter((item) => item.type === filter);

  const itemCounts = {
    all: items.length,
    camera: items.filter((i) => i.type === "camera").length,
    tondela: items.filter((i) => i.type === "tondela").length,
    card: items.filter((i) => i.type === "card").length,
  };

  const myItems = items.filter((i) => i.currentHolder === user.uid);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-5 sm:py-8">
        {/* Header */}
        <div className="mb-5 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Items</h1>
          <p className="text-[15px] text-[var(--text-muted)] mt-1">
            {items.filter((i) => i.status === "office").length} in office
            {" \u00B7 "}
            {items.filter((i) => i.status === "out").length} checked out
          </p>
        </div>

        {/* My Items Banner */}
        {myItems.length > 0 && (
          <div className="my-items-banner">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">
              You have {myItems.length} item{myItems.length !== 1 ? "s" : ""}
            </p>
            <div className="items-list">
              {myItems.map((item) => (
                <a key={item.id} href={`/item/${item.id}`} className="item-chip">
                  {TYPE_EMOJI[item.type] || "\u{1F4E6}"} {item.name}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-5 sm:mb-6 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
          {[
            { key: "all", label: "All" },
            { key: "camera", label: "Cameras" },
            { key: "tondela", label: "Tondelas" },
            { key: "card", label: "Cards" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`filter-pill ${filter === key ? "active" : ""}`}
            >
              {label}
              {itemCounts[key] > 0 && (
                <span className="count">{itemCounts[key]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Items Grid */}
        {itemsLoading ? (
          <div className="flex justify-center py-24">
            <div className="spinner"></div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-4 opacity-40">{"\u{1F4E6}"}</p>
            <p className="font-semibold text-[var(--text-secondary)]">
              No items found
            </p>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {filter !== "all"
                ? "Try a different filter"
                : "Ask an admin to add items"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {filteredItems.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
