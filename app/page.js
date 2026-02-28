"use client";

import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import ItemCard from "@/components/ItemCard";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-8">
          <div className="space-y-3">
            <h1 className="text-5xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-[var(--esn-cyan)] to-[var(--esn-dark-blue)] bg-clip-text text-transparent">
                ESN Porto
              </span>
            </h1>
            <h2 className="text-2xl font-semibold text-[var(--text-secondary)]">
              Item Tracker
            </h2>
            <p className="text-[var(--text-muted)] max-w-md mx-auto">
              Track who has the cameras, Tondelas, and cards. Sign in to get started.
            </p>
          </div>
          <button onClick={signInWithGoogle} className="google-btn mx-auto">
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            Sign in with Google
          </button>
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

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Item Dashboard</h1>
          <p className="text-[var(--text-secondary)]">
            Track and manage ESN Porto&apos;s shared items
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="glass-card p-4 text-center cursor-default">
            <p className="text-2xl font-bold">{items.length}</p>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Items</p>
          </div>
          <div className="glass-card p-4 text-center cursor-default">
            <p className="text-2xl font-bold text-[var(--status-office)]">
              {items.filter((i) => i.status === "office").length}
            </p>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">In Office</p>
          </div>
          <div className="glass-card p-4 text-center cursor-default">
            <p className="text-2xl font-bold text-[var(--status-out)]">
              {items.filter((i) => i.status === "out").length}
            </p>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Checked Out</p>
          </div>
          <div className="glass-card p-4 text-center cursor-default">
            <p className="text-2xl font-bold text-[var(--esn-magenta)]">
              {items.filter((i) => i.currentHolder === user.uid).length}
            </p>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">With You</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { key: "all", label: "All" },
            { key: "camera", label: "📷 Cameras" },
            { key: "tondela", label: "🧸 Tondelas" },
            { key: "card", label: "💳 Cards" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filter === key
                ? "bg-[var(--esn-cyan)] text-white shadow-lg shadow-[var(--esn-cyan)]/20"
                : "bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)]"
                }`}
            >
              {label}
              <span className="ml-1.5 opacity-70">({itemCounts[key]})</span>
            </button>
          ))}
        </div>

        {/* Items Grid */}
        {itemsLoading ? (
          <div className="flex justify-center py-20">
            <div className="spinner"></div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-6xl mb-4">📦</p>
            <p className="text-xl font-semibold text-[var(--text-secondary)]">
              No items found
            </p>
            <p className="text-[var(--text-muted)] mt-1">
              {filter !== "all"
                ? "Try a different filter"
                : "Ask an admin to add items"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
