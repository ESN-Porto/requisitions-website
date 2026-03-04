"use client";

import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import ItemCard from "@/components/ItemCard";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

export default function HomePage() {
  const { user, loading } = useAuth();
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-5 sm:py-8">
        {/* Header */}
        <div className="mb-5 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Requisitions</h1>
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
                  {item.name}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-5 sm:mb-6 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
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
              <ItemCard key={item.id} item={item} categories={categories} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}