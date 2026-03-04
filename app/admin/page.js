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

const COLOR_PRESETS = [
    { color: "#0055d4", bg: "#f0f6ff", border: "#c2d9f7", label: "Blue" },
    { color: "#7c3aed", bg: "#f6f0ff", border: "#e0d0f7", label: "Purple" },
    { color: "#c2410c", bg: "#fff5ee", border: "#fdd8be", label: "Orange" },
    { color: "#248a3d", bg: "#f0faf2", border: "#c6f0ce", label: "Green" },
    { color: "#d4145a", bg: "#fff0f5", border: "#fccfe0", label: "Pink" },
    { color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc", label: "Cyan" },
    { color: "#b45309", bg: "#fffbeb", border: "#fde68a", label: "Amber" },
    { color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1", label: "Slate" },
];

export default function AdminPage() {
    const { user, userData, loading, isAdmin } = useAuth();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState("items");
    const [items, setItems] = useState([]);
    const [users, setUsers] = useState([]);
    const [categories, setCategories] = useState([]);
    const [showItemForm, setShowItemForm] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({ name: "", type: "" });
    const [imageFile, setImageFile] = useState(null);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // Category form state
    const [showCategoryForm, setShowCategoryForm] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [categoryFormData, setCategoryFormData] = useState({ name: "", colorIndex: 0 });
    const [savingCategory, setSavingCategory] = useState(false);
    const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState(null);

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
        const unsubCategories = onSnapshot(
            query(collection(getFirebaseDb(), "categories"), orderBy("name")),
            (snap) => setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        );
        return () => { unsubItems(); unsubUsers(); unsubCategories(); };
    }, [user]);

    if (loading) {
        return (
            <div className="min-h-screen">
                <Navbar />
                <div className="flex justify-center py-32"><div className="spinner"></div></div>
            </div>
        );
    }

    if (!user || !isAdmin) {
        return (
            <div className="min-h-screen">
                <Navbar />
                <div className="max-w-4xl mx-auto px-5 py-20 text-center">
                    <p className="text-5xl mb-4 opacity-40">{"\u{1F512}"}</p>
                    <h2 className="text-lg font-semibold mb-1">Access Denied</h2>
                    <p className="text-[15px] text-[var(--text-muted)]">Admin privileges required.</p>
                    <button onClick={() => router.push("/")} className="btn-primary mt-6">Go to Dashboard</button>
                </div>
            </div>
        );
    }

    // ── Item form helpers ──
    const openAddForm = () => {
        setEditingItem(null);
        setFormData({ name: "", type: categories[0]?.key || "" });
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
            if (imageFile) {
                const fd = new FormData();
                fd.append("file", imageFile);
                const res = await fetch("/api/upload", { method: "POST", body: fd });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                photoURL = data.url;
            }
            if (editingItem) {
                await updateDoc(doc(getFirebaseDb(), "items", editingItem.id), {
                    name: formData.name, type: formData.type, photoURL, updatedAt: serverTimestamp(),
                });
            } else {
                await addDoc(collection(getFirebaseDb(), "items"), {
                    name: formData.name, type: formData.type, photoURL,
                    status: "office", currentHolder: null, currentHolderName: null, updatedAt: serverTimestamp(),
                });
            }
            setShowItemForm(false);
            setEditingItem(null);
            setFormData({ name: "", type: categories[0]?.key || "" });
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

    // ── Category form helpers ──
    const getCategoryBadgeStyle = (cat) => ({
        background: cat.bgColor || "#f5f5f7",
        color: cat.color || "#6e6e73",
        border: `1px solid ${cat.borderColor || "#e8e8ed"}`,
    });

    const openAddCategoryForm = () => {
        setEditingCategory(null);
        setCategoryFormData({ name: "", colorIndex: 0 });
        setShowCategoryForm(true);
    };

    const openEditCategoryForm = (cat) => {
        setEditingCategory(cat);
        const colorIdx = COLOR_PRESETS.findIndex(
            (p) => p.color === cat.color
        );
        setCategoryFormData({
            name: cat.name,
            colorIndex: colorIdx >= 0 ? colorIdx : 0,
        });
        setShowCategoryForm(true);
    };

    const handleSaveCategory = async () => {
        if (!categoryFormData.name.trim()) return;
        setSavingCategory(true);
        try {
            const preset = COLOR_PRESETS[categoryFormData.colorIndex];
            const key = categoryFormData.name.trim().toLowerCase().replace(/\s+/g, "-");
            const payload = {
                name: categoryFormData.name.trim(),
                key,
                color: preset.color,
                bgColor: preset.bg,
                borderColor: preset.border,
            };
            if (editingCategory) {
                await updateDoc(doc(getFirebaseDb(), "categories", editingCategory.id), payload);
            } else {
                await addDoc(collection(getFirebaseDb(), "categories"), {
                    ...payload,
                    createdAt: serverTimestamp(),
                });
            }
            setShowCategoryForm(false);
            setEditingCategory(null);
            setCategoryFormData({ name: "", colorIndex: 0 });
        } catch (e) {
            console.error("Save category error:", e);
        }
        setSavingCategory(false);
    };

    const handleDeleteCategory = async (catId) => {
        try {
            await deleteDoc(doc(getFirebaseDb(), "categories", catId));
            setDeleteCategoryConfirm(null);
        } catch (e) {
            console.error("Delete category error:", e);
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

    const getCategoryForType = (type) => categories.find((c) => c.key === type);

    return (
        <div className="min-h-screen">
            <Navbar />
            <main className="max-w-3xl mx-auto px-4 sm:px-8 py-5 sm:py-8">
                <div className="mb-5 sm:mb-8">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Admin</h1>
                    <p className="text-[14px] sm:text-[15px] text-[var(--text-muted)] mt-1">Manage items, categories and users</p>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-5 sm:mb-6">
                    {[
                        { key: "items", label: `Items (${items.length})` },
                        { key: "categories", label: `Categories (${categories.length})` },
                        { key: "users", label: `Users (${users.length})` },
                    ].map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setActiveTab(key)}
                            className={`filter-pill ${activeTab === key ? "active" : ""}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Items Tab */}
                {activeTab === "items" && (
                    <div>
                        <div className="flex justify-end mb-4">
                            <button onClick={openAddForm} className="btn-primary" disabled={categories.length === 0}>+ Add Item</button>
                        </div>

                        {categories.length === 0 && (
                            <div className="card p-5 mb-4 text-center">
                                <p className="text-[14px] text-[var(--text-muted)]">Create a category first before adding items.</p>
                            </div>
                        )}

                        {items.length === 0 ? (
                            <div className="card p-12 text-center">
                                <p className="text-5xl mb-4 opacity-40">{"\u{1F4E6}"}</p>
                                <p className="font-semibold text-[var(--text-secondary)]">No items yet</p>
                                <p className="text-sm text-[var(--text-muted)] mt-1">Add your first item</p>
                            </div>
                        ) : (
                            <div className="card overflow-hidden">
                                {items.map((item, index) => {
                                    const cat = getCategoryForType(item.type);
                                    return (
                                        <div
                                            key={item.id}
                                            className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 ${index !== items.length - 1 ? "border-b border-[var(--border-subtle)]" : ""
                                                }`}
                                        >
                                            {item.photoURL ? (
                                                <img src={item.photoURL} alt={item.name} className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl object-cover ring-1 ring-black/5" />
                                            ) : (
                                                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center text-lg sm:text-xl">
                                                    {"\u{1F4E6}"}
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-[13px] sm:text-[14px] truncate">{item.name}</p>
                                                <div className="flex items-center gap-1.5 sm:gap-2 mt-1">
                                                    <span
                                                        className="type-badge"
                                                        style={cat ? getCategoryBadgeStyle(cat) : undefined}
                                                    >
                                                        {item.type}
                                                    </span>
                                                    <span className={`status-badge text-[11px] ${item.status === "office" ? "status-office" : "status-out"}`}>
                                                        <span className={`status-dot ${item.status === "office" ? "office" : "out"}`}></span>
                                                        <span className="hidden sm:inline">{item.status === "office" ? "Office" : item.currentHolderName}</span>
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
                                                <button onClick={() => openEditForm(item)} className="btn-secondary !py-1.5 !px-2.5 sm:!py-2 sm:!px-3.5 !text-[12px] sm:!text-[13px]">Edit</button>
                                                {deleteConfirm === item.id ? (
                                                    <>
                                                        <button onClick={() => handleDeleteItem(item.id)} className="btn-danger !py-1.5 !px-2.5 sm:!py-2 sm:!px-3.5 !text-[12px] sm:!text-[13px]">Confirm</button>
                                                        <button onClick={() => setDeleteConfirm(null)} className="btn-secondary !py-1.5 !px-2.5 sm:!py-2 sm:!px-3.5 !text-[12px] sm:!text-[13px]">Cancel</button>
                                                    </>
                                                ) : (
                                                    <button onClick={() => setDeleteConfirm(item.id)} className="btn-danger !py-1.5 !px-2.5 sm:!py-2 sm:!px-3.5 !text-[12px] sm:!text-[13px]">Delete</button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Categories Tab */}
                {activeTab === "categories" && (
                    <div>
                        <div className="flex justify-end mb-4">
                            <button onClick={openAddCategoryForm} className="btn-primary">+ Add Category</button>
                        </div>

                        {categories.length === 0 ? (
                            <div className="card p-12 text-center">
                                <p className="text-5xl mb-4 opacity-40">{"\u{1F3F7}"}</p>
                                <p className="font-semibold text-[var(--text-secondary)]">No categories yet</p>
                                <p className="text-sm text-[var(--text-muted)] mt-1">Add your first category</p>
                            </div>
                        ) : (
                            <div className="card overflow-hidden">
                                {categories.map((cat, index) => {
                                    const itemCount = items.filter((i) => i.type === cat.key).length;
                                    return (
                                        <div
                                            key={cat.id}
                                            className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 ${index !== categories.length - 1 ? "border-b border-[var(--border-subtle)]" : ""
                                                }`}
                                        >
                                            <div
                                                className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                                                style={{ background: cat.bgColor, border: `1px solid ${cat.borderColor}` }}
                                            >
                                                <div
                                                    className="w-4 h-4 rounded-full"
                                                    style={{ background: cat.color }}
                                                ></div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-[13px] sm:text-[14px] truncate">{cat.name}</p>
                                                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                                                    {itemCount} item{itemCount !== 1 ? "s" : ""}
                                                </p>
                                            </div>
                                            <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
                                                <button onClick={() => openEditCategoryForm(cat)} className="btn-secondary !py-1.5 !px-2.5 sm:!py-2 sm:!px-3.5 !text-[12px] sm:!text-[13px]">Edit</button>
                                                {deleteCategoryConfirm === cat.id ? (
                                                    <>
                                                        <button onClick={() => handleDeleteCategory(cat.id)} className="btn-danger !py-1.5 !px-2.5 sm:!py-2 sm:!px-3.5 !text-[12px] sm:!text-[13px]">Confirm</button>
                                                        <button onClick={() => setDeleteCategoryConfirm(null)} className="btn-secondary !py-1.5 !px-2.5 sm:!py-2 sm:!px-3.5 !text-[12px] sm:!text-[13px]">Cancel</button>
                                                    </>
                                                ) : (
                                                    <button onClick={() => setDeleteCategoryConfirm(cat.id)} className="btn-danger !py-1.5 !px-2.5 sm:!py-2 sm:!px-3.5 !text-[12px] sm:!text-[13px]">Delete</button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Users Tab */}
                {activeTab === "users" && (
                    <div className="card overflow-hidden">
                        {users.map((u, index) => (
                            <div
                                key={u.id}
                                className={`flex items-center gap-4 p-4 ${index !== users.length - 1 ? "border-b border-[var(--border-subtle)]" : ""
                                    }`}
                            >
                                {u.photoURL ? (
                                    <img src={u.photoURL} alt={u.name} className="w-9 h-9 rounded-full ring-1 ring-black/5" referrerPolicy="no-referrer" />
                                ) : (
                                    <div className="w-9 h-9 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center text-sm font-semibold text-[var(--text-secondary)]">
                                        {u.name?.[0]}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[14px] font-medium">{u.name}</p>
                                    <p className="text-xs text-[var(--text-muted)]">{u.email}</p>
                                </div>
                                <div className="flex items-center gap-2.5 flex-shrink-0">
                                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-md ${u.role === "admin"
                                        ? "bg-[var(--text-primary)] text-white"
                                        : "bg-[var(--bg-secondary)] text-[var(--text-muted)]"
                                        }`}>
                                        {u.role}
                                    </span>
                                    {u.id !== user.uid && (
                                        <button onClick={() => toggleRole(u.id, u.role)} className="btn-secondary !py-2 !px-3.5 !text-[13px]">
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
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-semibold">
                                    {editingItem ? "Edit Item" : "Add Item"}
                                </h2>
                                <button
                                    onClick={() => setShowItemForm(false)}
                                    className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[13px] font-medium text-[var(--text-secondary)] mb-1.5 block">Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Camera 1"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="input-field"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="text-[13px] font-medium text-[var(--text-secondary)] mb-1.5 block">Category</label>
                                    <select
                                        value={formData.type}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                        className="input-field"
                                    >
                                        {categories.map((cat) => (
                                            <option key={cat.id} value={cat.key}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[13px] font-medium text-[var(--text-secondary)] mb-1.5 block">Photo</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                                        className="input-field text-sm file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-[var(--text-primary)] file:text-white file:font-medium file:text-xs file:cursor-pointer"
                                    />
                                    {editingItem?.photoURL && !imageFile && (
                                        <p className="text-xs text-[var(--text-muted)] mt-1.5">Current photo will be kept</p>
                                    )}
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={handleSaveItem}
                                        disabled={saving || !formData.name.trim()}
                                        className="btn-primary flex-1 disabled:opacity-40"
                                    >
                                        {saving ? "Saving..." : editingItem ? "Save Changes" : "Add Item"}
                                    </button>
                                    <button onClick={() => setShowItemForm(false)} className="btn-secondary">Cancel</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Category Form Modal */}
                {showCategoryForm && (
                    <div className="modal-overlay" onClick={() => setShowCategoryForm(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-semibold">
                                    {editingCategory ? "Edit Category" : "Add Category"}
                                </h2>
                                <button
                                    onClick={() => setShowCategoryForm(false)}
                                    className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[13px] font-medium text-[var(--text-secondary)] mb-1.5 block">Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Camera"
                                        value={categoryFormData.name}
                                        onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                                        className="input-field"
                                        autoFocus
                                    />
                                    {categoryFormData.name.trim() && (
                                        <p className="text-[12px] text-[var(--text-muted)] mt-1.5">
                                            Key: <span className="font-mono">{categoryFormData.name.trim().toLowerCase().replace(/\s+/g, "-")}</span>
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="text-[13px] font-medium text-[var(--text-secondary)] mb-1.5 block">Color</label>
                                    <div className="flex flex-wrap gap-2.5">
                                        {COLOR_PRESETS.map((preset, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => setCategoryFormData({ ...categoryFormData, colorIndex: idx })}
                                                className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all"
                                                style={{
                                                    background: categoryFormData.colorIndex === idx ? preset.bg : "transparent",
                                                    border: categoryFormData.colorIndex === idx
                                                        ? `2px solid ${preset.color}`
                                                        : "2px solid var(--border-color)",
                                                }}
                                            >
                                                <div
                                                    className="w-4 h-4 rounded-full flex-shrink-0"
                                                    style={{ background: preset.color }}
                                                ></div>
                                                <span className="text-[12px] font-medium" style={{ color: categoryFormData.colorIndex === idx ? preset.color : "var(--text-secondary)" }}>
                                                    {preset.label}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* Preview */}
                                {categoryFormData.name.trim() && (
                                    <div>
                                        <label className="text-[13px] font-medium text-[var(--text-secondary)] mb-1.5 block">Preview</label>
                                        <span
                                            className="type-badge"
                                            style={{
                                                background: COLOR_PRESETS[categoryFormData.colorIndex].bg,
                                                color: COLOR_PRESETS[categoryFormData.colorIndex].color,
                                                border: `1px solid ${COLOR_PRESETS[categoryFormData.colorIndex].border}`,
                                            }}
                                        >
                                            {categoryFormData.name.trim().toLowerCase().replace(/\s+/g, "-")}
                                        </span>
                                    </div>
                                )}
                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={handleSaveCategory}
                                        disabled={savingCategory || !categoryFormData.name.trim()}
                                        className="btn-primary flex-1 disabled:opacity-40"
                                    >
                                        {savingCategory ? "Saving..." : editingCategory ? "Save Changes" : "Add Category"}
                                    </button>
                                    <button onClick={() => setShowCategoryForm(false)} className="btn-secondary">Cancel</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
