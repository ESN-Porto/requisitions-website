"use client";

import { useAuth } from "@/contexts/AuthContext";
import UserMenu from "@/components/UserMenu";
import ItemCard from "@/components/ItemCard";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

export default function HomePage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const q = query(collection(getFirebaseDb(), "items"), orderBy("name"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setItems(itemsData);
      setItemsLoading(false);
    });

    const unsubCategories = onSnapshot(
      query(collection(getFirebaseDb(), "categories"), orderBy("name")),
      (snap) => setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    return () => { unsubscribe(); unsubCategories(); };
  }, []);

  const filteredItems =
    filter === "all" ? items : items.filter((item) => item.type === filter);

  const itemCounts = { all: items.length };
  categories.forEach((cat) => {
    itemCounts[cat.key] = items.filter((i) => i.type === cat.key).length;
  });

  const myItems = user ? items.filter((i) => i.currentHolder === user.uid) : [];

  const filterOptions = [
    { key: "all", label: "All" },
    ...categories.map((cat) => ({ key: cat.key, label: cat.name })),
  ];

  const inOffice = items.filter((i) => i.status === "office").length;
  const checkedOut = items.filter((i) => i.status === "out").length;

  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        {/* Large Title — iOS style */}
        <div className="flex justify-between items-start mb-6 sm:mb-10">
          <div>
            <h1 className="home-title">Requisitions</h1>
            <p className="home-subtitle">
              {inOffice} in office{" \u00B7 "}{checkedOut} checked out
            </p>
          </div>
          <div className="mt-1">
            <UserMenu />
          </div>
        </div>

        {/* My Items Banner */}
        {myItems.length > 0 && (
          <p className="my-items-banner">
            <span className="my-items-label">With you:</span>
            {myItems.map((item, i) => (
              <span key={item.id}>
                {i > 0 && <span className="my-items-sep">, </span>}
                <a href={`/item/${item.id}`} className="my-items-link">{item.name}</a>
              </span>
            ))}
          </p>
        )}

        {/* iOS-style Filter Pills */}
        <div className="filter-bar">
          {filterOptions.map(({ key, label }) => (
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
