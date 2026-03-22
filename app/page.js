"use client";

import { useAuth } from "@/contexts/AuthContext";
import UserMenu from "@/components/UserMenu";
import ItemCard from "@/components/ItemCard";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

export default function HomePage() {
  const { user, userData } = useAuth();
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

  const handleDeliverAll = async () => {
    if (!user || myItems.length === 0) return;
    try {
      for (const item of myItems) {
        await updateDoc(doc(getFirebaseDb(), "items", item.id), {
          status: "office",
          currentHolder: null,
          currentHolderName: null,
          currentHolderPhoto: null,
          updatedAt: serverTimestamp(),
        });
        await addDoc(collection(getFirebaseDb(), "transfers"), {
          itemId: item.id, itemName: item.name, itemType: item.type,
          fromUserId: user.uid, fromUserName: userData?.name || "Unknown",
          toUserId: null, toUserName: "Office",
          action: "return", eventName: null,
          note: null,
          timestamp: serverTimestamp(),
        });
      }
    } catch (e) {
      console.error("Deliver all error:", e);
    }
  };

  const filterOptions = [
    { key: "all", label: "All" },
    ...categories.map((cat) => ({ key: cat.key, label: cat.name })),
  ];

  const inOffice = items.filter((i) => i.status === "office").length;
  const checkedOut = items.filter((i) => i.status === "out").length;

  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        {/* Title */}
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[var(--radius-lg)] px-4 py-3 sm:px-5 sm:py-3.5 mb-6 sm:mb-8 shadow-sm transition-all ">
            <div className="flex items-center flex-wrap gap-1.5 text-[14px]">
              <span className="font-semibold text-[var(--text-secondary)] mr-1 tracking-tight">With you:</span>
              {myItems.map((item, i) => (
                <span key={item.id} className="flex items-center">
                  <a href={`/item/${item.id}`} className="font-medium text-[var(--text-primary)] hover:opacity-70 transition-opacity">
                    {item.name}
                  </a>
                  {i < myItems.length - 1 && <span className="mx-2 text-[var(--border-color)]">•</span>}
                </span>
              ))}
            </div>
            
            <button 
              onClick={handleDeliverAll} 
              className="group flex-shrink-0 flex items-center justify-center gap-1.5 px-4 py-2 sm:py-1.5 bg-[var(--bg-secondary)] hover:bg-[#e8e8ed] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-full text-[13px] font-semibold transition-all cursor-pointer border border-transparent hover:border-[var(--border-color)]"
            >
              Return All
            </button>
          </div>
        )}

        {/* Filter Pills */}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 animate-pulse mt-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="card p-3 sm:p-4">
                <div className="w-full aspect-[4/3] bg-[var(--bg-secondary)] rounded-xl mb-3"></div>
                <div className="h-4 w-2/3 bg-[var(--border-subtle)] rounded-md mb-2.5"></div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--border-subtle)]"></div>
                  <div className="h-3 w-1/3 bg-[var(--bg-secondary)] rounded-md"></div>
                </div>
              </div>
            ))}
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
