"use client";

import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useState, useRef, useCallback } from "react";
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
    const [categories, setCategories] = useState([]);
    const [showItemForm, setShowItemForm] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({ name: "", type: "" });
    const [imageFile, setImageFile] = useState(null);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [qrItem, setQrItem] = useState(null);
    const [actionMenuOpen, setActionMenuOpen] = useState(null); // item/cat ID or null

    // Category form state
    const [showCategoryForm, setShowCategoryForm] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [categoryFormData, setCategoryFormData] = useState({ name: "" });
    const [savingCategory, setSavingCategory] = useState(false);
    const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState(null);

    // User form/action state
    const [deleteUserConfirm, setDeleteUserConfirm] = useState(null);

    // Click-away listener for action menus
    const menuRef = useRef(null);
    const closeMenu = useCallback(() => setActionMenuOpen(null), []);

    useEffect(() => {
        if (actionMenuOpen === null) return;
        const handleClick = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) closeMenu();
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [actionMenuOpen, closeMenu]);

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
        setActionMenuOpen(null);
    };

    const handleSaveItem = async () => {
        if (!formData.name.trim()) return;
        setSaving(true);
        try {
            let photoURL = editingItem?.photoURL || null;
            if (imageFile) {
                const token = await user.getIdToken();
                const fd = new FormData();
                fd.append("file", imageFile);
                const res = await fetch("/api/upload", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${token}` },
                    body: fd
                });
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
            setActionMenuOpen(null);
        } catch (e) {
            console.error("Delete error:", e);
        }
    };

    // ── Category form helpers ──
    const openAddCategoryForm = () => {
        setEditingCategory(null);
        setCategoryFormData({ name: "" });
        setShowCategoryForm(true);
    };

    const openEditCategoryForm = (cat) => {
        setEditingCategory(cat);
        setCategoryFormData({ name: cat.name });
        setShowCategoryForm(true);
        setActionMenuOpen(null);
    };

    const handleSaveCategory = async () => {
        if (!categoryFormData.name.trim()) return;
        setSavingCategory(true);
        try {
            const key = categoryFormData.name.trim().toLowerCase().replace(/\s+/g, "-");
            const payload = { name: categoryFormData.name.trim(), key };
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
            setCategoryFormData({ name: "" });
        } catch (e) {
            console.error("Save category error:", e);
        }
        setSavingCategory(false);
    };

    const handleDeleteCategory = async (catId) => {
        try {
            await deleteDoc(doc(getFirebaseDb(), "categories", catId));
            setDeleteCategoryConfirm(null);
            setActionMenuOpen(null);
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

    const handleDeleteUser = async (userId) => {
        try {
            await deleteDoc(doc(getFirebaseDb(), "users", userId));
            setDeleteUserConfirm(null);
            setActionMenuOpen(null);
        } catch (e) {
            console.error("Delete user error:", e);
        }
    };

    const getCategoryForType = (type) => categories.find((c) => c.key === type);

    // ── Inline SVG icons ──
    const QrIcon = () => (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none"/>
            <path d="M14 14h3v3h-3z" fill="currentColor" stroke="none"/><path d="M17 17h3v3h-3z" fill="currentColor" stroke="none"/><path d="M14 20h3" /><path d="M20 14v3" />
        </svg>
    );

    const EditIcon = () => (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
    );

    const TrashIcon = () => (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
    );

    const ShieldIcon = () => (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
    );

    // Shared actions dropdown for items
    const ItemActionsMenu = ({ item }) => (
        <div className="admin-actions-wrap" ref={actionMenuOpen === item.id ? menuRef : null}>
            <button
                className="admin-more-btn"
                onClick={(e) => { e.stopPropagation(); setActionMenuOpen(actionMenuOpen === item.id ? null : item.id); }}
            >
                ⋯
            </button>
            {actionMenuOpen === item.id && (
                <div className="admin-actions-menu">
                    <button className="admin-actions-item" onClick={() => { setQrItem(item); setActionMenuOpen(null); }}>
                        <QrIcon /> QR Code
                    </button>
                    <button className="admin-actions-item" onClick={() => openEditForm(item)}>
                        <EditIcon /> Edit
                    </button>
                    {deleteConfirm === item.id ? (
                        <>
                            <button className="admin-actions-item admin-actions-danger" onClick={() => handleDeleteItem(item.id)}>
                                Confirm Delete
                            </button>
                            <button className="admin-actions-item" onClick={() => { setDeleteConfirm(null); setActionMenuOpen(null); }}>
                                Cancel
                            </button>
                        </>
                    ) : (
                        <button className="admin-actions-item admin-actions-danger" onClick={() => setDeleteConfirm(item.id)}>
                            <TrashIcon /> Delete
                        </button>
                    )}
                </div>
            )}
        </div>
    );

    // Shared actions dropdown for categories
    const CatActionsMenu = ({ cat }) => {
        const menuId = `cat-${cat.id}`;
        return (
            <div className="admin-actions-wrap" ref={actionMenuOpen === menuId ? menuRef : null}>
                <button
                    className="admin-more-btn"
                    onClick={(e) => { e.stopPropagation(); setActionMenuOpen(actionMenuOpen === menuId ? null : menuId); }}
                >
                    ⋯
                </button>
                {actionMenuOpen === menuId && (
                    <div className="admin-actions-menu">
                        <button className="admin-actions-item" onClick={() => openEditCategoryForm(cat)}>
                            <EditIcon /> Edit
                        </button>
                        {deleteCategoryConfirm === cat.id ? (
                            <>
                                <button className="admin-actions-item admin-actions-danger" onClick={() => handleDeleteCategory(cat.id)}>
                                    Confirm Delete
                                </button>
                                <button className="admin-actions-item" onClick={() => { setDeleteCategoryConfirm(null); setActionMenuOpen(null); }}>
                                    Cancel
                                </button>
                            </>
                        ) : (
                            <button className="admin-actions-item admin-actions-danger" onClick={() => setDeleteCategoryConfirm(cat.id)}>
                                <TrashIcon /> Delete
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // Shared actions dropdown for users
    const UserActionsMenu = ({ u }) => {
        const menuId = `user-${u.id}`;
        
        if (u.id === user.uid) {
            return null; // Current user cannot manage themselves
        }

        const canManageRole = u.role === "admin" || u.email?.toLowerCase().endsWith("@esnporto.org");

        return (
            <div className="admin-actions-wrap" ref={actionMenuOpen === menuId ? menuRef : null}>
                <button
                    className="admin-more-btn"
                    onClick={(e) => { e.stopPropagation(); setActionMenuOpen(actionMenuOpen === menuId ? null : menuId); }}
                >
                    ⋯
                </button>
                {actionMenuOpen === menuId && (
                    <div className="admin-actions-menu">
                        {canManageRole && (
                            <button
                                className="admin-actions-item"
                                onClick={() => {
                                    toggleRole(u.id, u.role);
                                    setActionMenuOpen(null);
                                }}
                            >
                                <ShieldIcon />
                                {u.role === "admin" ? "Demote to Member" : "Promote to Admin"}
                            </button>
                        )}
                        {deleteUserConfirm === u.id ? (
                            <>
                                <button className="admin-actions-item admin-actions-danger" onClick={() => handleDeleteUser(u.id)}>
                                    Confirm Delete
                                </button>
                                <button className="admin-actions-item" onClick={() => { setDeleteUserConfirm(null); setActionMenuOpen(null); }}>
                                    Cancel
                                </button>
                            </>
                        ) : (
                            <button className="admin-actions-item admin-actions-danger" onClick={() => setDeleteUserConfirm(u.id)}>
                                <TrashIcon /> Delete User
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen">
            <Navbar />
            <main className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
                {/* Header — matches home page style */}
                <div className="mb-6 sm:mb-10">
                    <h1 className="home-title">Admin</h1>
                    <p className="home-subtitle">Manage requisitions, categories and users</p>
                </div>

                {/* Tabs */}
                <div className="filter-bar">
                    {[
                        { key: "items", label: `Requisitions (${items.length})` },
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
                            <button onClick={openAddForm} className="btn-primary" disabled={categories.length === 0}>+ Add Requisition</button>
                        </div>

                        {categories.length === 0 && (
                            <div className="card p-5 mb-4 text-center">
                                <p className="text-[14px] text-[var(--text-muted)]">Create a category first before adding requisitions.</p>
                            </div>
                        )}

                        {items.length === 0 ? (
                            <div className="card p-12 text-center">
                                <p className="text-5xl mb-4 opacity-40">{"\u{1F4E6}"}</p>
                                <p className="font-semibold text-[var(--text-secondary)]">No requisitions yet</p>
                                <p className="text-sm text-[var(--text-muted)] mt-1">Add your first requisition</p>
                            </div>
                        ) : (
                            <div className="card admin-list">
                                {items.map((item, index) => {
                                    const cat = getCategoryForType(item.type);
                                    return (
                                        <div
                                            key={item.id}
                                            className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 ${index !== items.length - 1 ? "border-b border-[var(--border-subtle)]" : ""
                                                }`}
                                        >
                                            <Link href={`/item/${item.id}`} className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 hover:opacity-70 transition-opacity">
                                                {item.photoURL ? (
                                                    <img src={item.photoURL} alt={item.name} className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl object-cover ring-1 ring-black/5 flex-shrink-0" />
                                                ) : (
                                                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center text-lg sm:text-xl flex-shrink-0">
                                                        {"\u{1F4E6}"}
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <p className="font-medium text-[13px] sm:text-[14px] truncate">{item.name}</p>
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <span className="text-[11px] sm:text-[12px] text-[var(--text-muted)]">
                                                            {cat?.name || item.type}
                                                        </span>
                                                        <span className="text-[11px] text-[var(--text-muted)]">·</span>
                                                        <span className="text-[11px] sm:text-[12px] text-[var(--text-muted)]">
                                                            {item.status === "office" ? "In Office" : item.currentHolderName}
                                                        </span>
                                                    </div>
                                                </div>
                                            </Link>


                                            {/* ⋯ actions menu */}
                                            <ItemActionsMenu item={item} />
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
                            <div className="card admin-list">
                                {categories.map((cat, index) => {
                                    const itemCount = items.filter((i) => i.type === cat.key).length;
                                    return (
                                        <div
                                            key={cat.id}
                                            className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 ${index !== categories.length - 1 ? "border-b border-[var(--border-subtle)]" : ""
                                                }`}
                                        >
                                            <div className="admin-cat-icon">
                                                {cat.name?.[0]?.toUpperCase() || "?"}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-[13px] sm:text-[14px] truncate">{cat.name}</p>
                                                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                                                    {itemCount} item{itemCount !== 1 ? "s" : ""}
                                                </p>
                                            </div>


                                            {/* ⋯ actions menu */}
                                            <CatActionsMenu cat={cat} />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Users Tab */}
                {activeTab === "users" && (
                    <div className="card admin-list">
                        {users.map((u, index) => (
                            <div
                                key={u.id}
                                className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 ${index !== users.length - 1 ? "border-b border-[var(--border-subtle)]" : ""
                                    }`}
                            >
                                {u.photoURL ? (
                                    <img src={u.photoURL} alt={u.name} className="w-10 h-10 sm:w-11 sm:h-11 rounded-full ring-1 ring-black/5 flex-shrink-0" referrerPolicy="no-referrer" />
                                ) : (
                                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center text-sm sm:text-lg font-semibold text-[var(--text-secondary)] flex-shrink-0">
                                        {u.name?.[0]}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-[14px] font-medium truncate">{u.name}</p>
                                        <span className={`text-[10px] font-semibold px-1.5 py-px rounded flex-shrink-0 leading-none ${u.role === "admin"
                                            ? "bg-[var(--text-primary)] text-white"
                                            : "bg-[var(--bg-secondary)] text-[var(--text-muted)]"
                                            }`}>
                                            {u.role}
                                        </span>
                                    </div>
                                    <p className="text-[11px] sm:text-xs text-[var(--text-muted)] truncate mt-0.5">{u.email}</p>
                                </div>
                                <UserActionsMenu u={u} />
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

                {/* Category Form Modal — simplified, no color picker */}
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
                                    />
                                    {categoryFormData.name.trim() && (
                                        <p className="text-[12px] text-[var(--text-muted)] mt-1.5">
                                            Key: <span className="font-mono">{categoryFormData.name.trim().toLowerCase().replace(/\s+/g, "-")}</span>
                                        </p>
                                    )}
                                </div>
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

            {/* QR Code Modal */}
            {qrItem && (
            <div className="modal-overlay" onClick={() => setQrItem(null)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-lg font-semibold">QR Code</h2>
                        <button
                            onClick={() => setQrItem(null)}
                            className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                    <div className="flex flex-col items-center gap-4">
                        <div className="p-4 rounded-2xl bg-white">
                            <QRCodeCanvas
                                id="qr-canvas"
                                value={`${typeof window !== "undefined" ? window.location.origin : ""}/scan/${qrItem.id}`}
                                size={200}
                                marginSize={1}
                            />
                        </div>
                        <div className="text-center">
                            <p className="font-semibold text-[15px]">{qrItem.name}</p>
                            <p className="text-[12px] text-[var(--text-muted)] mt-0.5 font-mono">/scan/{qrItem.id}</p>
                        </div>
                        <button
                            onClick={() => {
                                const canvas = document.getElementById("qr-canvas");
                                if (!canvas) return;
                                const url = canvas.toDataURL("image/png");
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `${qrItem.name}-qr.png`;
                                a.click();
                            }}
                            className="btn-primary w-full"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"inline",marginRight:"6px",verticalAlign:"text-bottom"}}>
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            Download PNG
                        </button>
                    </div>
                </div>
            </div>
            )}
        </div>
    );
}