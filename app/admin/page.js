"use client";

import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

export default function AdminPage() {
    const { user, userData, loading, isAdmin } = useAuth();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState("items");
    const [items, setItems] = useState([]);
    const [users, setUsers] = useState([]);
    const [showItemForm, setShowItemForm] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({
        name: "",
        type: "camera",
    });
    const [imageFile, setImageFile] = useState(null);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    useEffect(() => {
        if (!user) return;

        const unsubItems = onSnapshot(
            query(collection(getFirebaseDb(), "items"), orderBy("name")),
            (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        );

        const unsubUsers = onSnapshot(
            query(collection(getFirebaseDb(), "users"), orderBy("name")),
            (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        );

        return () => {
            unsubItems();
            unsubUsers();
        };
    }, [user]);

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

    if (!user || !isAdmin) {
        return (
            <div className="min-h-screen">
                <Navbar />
                <div className="max-w-4xl mx-auto px-4 py-16 text-center">
                    <p className="text-6xl mb-4">🔒</p>
                    <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                    <p className="text-[var(--text-muted)]">
                        You need admin privileges to access this page.
                    </p>
                    <button
                        onClick={() => router.push("/")}
                        className="btn-primary mt-6"
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    const openAddForm = () => {
        setEditingItem(null);
        setFormData({ name: "", type: "camera" });
        setImageFile(null);
        setShowItemForm(true);
    };

    const openEditForm = (item) => {
        setEditingItem(item);
        setFormData({ name: item.name, type: item.type });
        setImageFile(null);
        setShowItemForm(true);
    };

    const handleSaveItem = async () => {
        if (!formData.name.trim()) return;
        setSaving(true);

        try {
            let photoURL = editingItem?.photoURL || null;

            // Upload image if new one selected
            if (imageFile) {
                const formData2 = new FormData();
                formData2.append("file", imageFile);
                const res = await fetch("/api/upload", {
                    method: "POST",
                    body: formData2,
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                photoURL = data.url;
            }

            if (editingItem) {
                await updateDoc(doc(getFirebaseDb(), "items", editingItem.id), {
                    name: formData.name,
                    type: formData.type,
                    photoURL,
                    updatedAt: serverTimestamp(),
                });
            } else {
                await addDoc(collection(getFirebaseDb(), "items"), {
                    name: formData.name,
                    type: formData.type,
                    photoURL,
                    status: "office",
                    currentHolder: null,
                    currentHolderName: null,
                    updatedAt: serverTimestamp(),
                });
            }

            setShowItemForm(false);
            setEditingItem(null);
            setFormData({ name: "", type: "camera" });
            setImageFile(null);
        } catch (e) {
            console.error("Save error:", e);
        }
        setSaving(false);
    };

    const handleDeleteItem = async (itemId) => {
        try {
            await deleteDoc(doc(getFirebaseDb(), "items", itemId));
            setDeleteConfirm(null);
        } catch (e) {
            console.error("Delete error:", e);
        }
    };

    const toggleRole = async (userId, currentRole) => {
        const newRole = currentRole === "admin" ? "member" : "admin";
        try {
            await updateDoc(doc(getFirebaseDb(), "users", userId), { role: newRole });
        } catch (e) {
            console.error("Role update error:", e);
        }
    };

    const TYPE_EMOJI = { camera: "📷", tondela: "🧸", card: "💳" };

    return (
        <div className="min-h-screen">
            <Navbar />
            <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
                    <p className="text-[var(--text-secondary)]">
                        Manage items and users
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-8">
                    <button
                        onClick={() => setActiveTab("items")}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === "items"
                            ? "bg-[var(--esn-cyan)] text-white shadow-lg"
                            : "bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)]"
                            }`}
                    >
                        📦 Items ({items.length})
                    </button>
                    <button
                        onClick={() => setActiveTab("users")}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === "users"
                            ? "bg-[var(--esn-cyan)] text-white shadow-lg"
                            : "bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)]"
                            }`}
                    >
                        👥 Users ({users.length})
                    </button>
                </div>

                {/* Items Tab */}
                {activeTab === "items" && (
                    <div className="space-y-4">
                        <div className="flex justify-end">
                            <button onClick={openAddForm} className="btn-primary">
                                + Add Item
                            </button>
                        </div>

                        {items.length === 0 ? (
                            <div className="glass-card p-12 text-center cursor-default">
                                <p className="text-5xl mb-3">📦</p>
                                <p className="text-lg font-semibold text-[var(--text-secondary)]">
                                    No items yet
                                </p>
                                <p className="text-[var(--text-muted)] text-sm mt-1">
                                    Add your first item to get started
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {items.map((item) => (
                                    <div
                                        key={item.id}
                                        className="glass-card p-4 flex items-center gap-4 cursor-default hover:transform-none"
                                    >
                                        {item.photoURL ? (
                                            <img
                                                src={item.photoURL}
                                                alt={item.name}
                                                className="w-14 h-14 rounded-xl object-cover"
                                            />
                                        ) : (
                                            <div className="w-14 h-14 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center text-2xl">
                                                {TYPE_EMOJI[item.type] || "📦"}
                                            </div>
                                        )}

                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold">{item.name}</h3>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className={`type-badge type-${item.type}`}>
                                                    {item.type}
                                                </span>
                                                <span
                                                    className={`status-badge text-xs ${item.status === "office"
                                                        ? "status-office"
                                                        : "status-out"
                                                        }`}
                                                >
                                                    <span
                                                        className={`status-dot ${item.status === "office" ? "office" : "out"
                                                            }`}
                                                    ></span>
                                                    {item.status === "office"
                                                        ? "Office"
                                                        : item.currentHolderName}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => openEditForm(item)}
                                                className="btn-secondary !py-2 !px-4 text-sm"
                                            >
                                                Edit
                                            </button>
                                            {deleteConfirm === item.id ? (
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handleDeleteItem(item.id)}
                                                        className="btn-danger !py-2 !px-3 text-sm"
                                                    >
                                                        Confirm
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteConfirm(null)}
                                                        className="btn-secondary !py-2 !px-3 text-sm"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setDeleteConfirm(item.id)}
                                                    className="btn-danger !py-2 !px-4 text-sm"
                                                >
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Users Tab */}
                {activeTab === "users" && (
                    <div className="space-y-3">
                        {users.map((u) => (
                            <div
                                key={u.id}
                                className="glass-card p-4 flex items-center gap-4 cursor-default hover:transform-none"
                            >
                                {u.photoURL ? (
                                    <img
                                        src={u.photoURL}
                                        alt={u.name}
                                        className="w-10 h-10 rounded-full"
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-[var(--bg-card-hover)] flex items-center justify-center font-semibold">
                                        {u.name?.[0]}
                                    </div>
                                )}

                                <div className="flex-1 min-w-0">
                                    <p className="font-medium">{u.name}</p>
                                    <p className="text-sm text-[var(--text-muted)]">{u.email}</p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <span
                                        className={`text-xs font-semibold px-3 py-1 rounded-lg ${u.role === "admin"
                                            ? "bg-[var(--esn-cyan)]/20 text-[var(--esn-cyan)]"
                                            : "bg-[var(--bg-secondary)] text-[var(--text-muted)]"
                                            }`}
                                    >
                                        {u.role}
                                    </span>
                                    {u.id !== user.uid && (
                                        <button
                                            onClick={() => toggleRole(u.id, u.role)}
                                            className="btn-secondary !py-2 !px-4 text-sm"
                                        >
                                            {u.role === "admin" ? "Demote" : "Promote"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Item Form Modal */}
                {showItemForm && (
                    <div className="modal-overlay" onClick={() => setShowItemForm(false)}>
                        <div
                            className="modal-content"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold mb-6">
                                {editingItem ? "Edit Item" : "Add New Item"}
                            </h2>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm text-[var(--text-muted)] mb-1 block">
                                        Item Name
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Camera 1"
                                        value={formData.name}
                                        onChange={(e) =>
                                            setFormData({ ...formData, name: e.target.value })
                                        }
                                        className="input-field"
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label className="text-sm text-[var(--text-muted)] mb-1 block">
                                        Type
                                    </label>
                                    <select
                                        value={formData.type}
                                        onChange={(e) =>
                                            setFormData({ ...formData, type: e.target.value })
                                        }
                                        className="input-field"
                                    >
                                        <option value="camera">📷 Camera</option>
                                        <option value="tondela">🧸 Tondela</option>
                                        <option value="card">💳 Card</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-sm text-[var(--text-muted)] mb-1 block">
                                        Photo
                                    </label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                                        className="input-field text-sm file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-[var(--esn-cyan)]/20 file:text-[var(--esn-cyan)] file:font-medium file:cursor-pointer"
                                    />
                                    {editingItem?.photoURL && !imageFile && (
                                        <p className="text-xs text-[var(--text-muted)] mt-1">
                                            Current photo will be kept
                                        </p>
                                    )}
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={handleSaveItem}
                                        disabled={saving || !formData.name.trim()}
                                        className="btn-primary flex-1 disabled:opacity-50"
                                    >
                                        {saving ? "Saving..." : editingItem ? "Save Changes" : "Add Item"}
                                    </button>
                                    <button
                                        onClick={() => setShowItemForm(false)}
                                        className="btn-secondary"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
