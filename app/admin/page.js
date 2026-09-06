"use client";

import { useAuth } from "@/contexts/AuthContext";
import UserMenu from "@/components/UserMenu";
import Link from "next/link";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useItems, useCategories } from "@/lib/data";
import { api } from "@/lib/api";
import { slugify } from "@/lib/slug";

const IT_MANAGER_URL = process.env.NEXT_PUBLIC_IT_MANAGER_URL || "https://it.esnporto.org";

const CloseIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

/**
 * Admin back-office: items, categories, and a pointer to where access is
 * managed. Who is a volunteer (can enter) and who is an admin of this app is
 * decided in IT Manager (profiles.role + user_project_access), so the old
 * "Users" and "Sign In allowlist" tabs are gone.
 */
export default function AdminPage() {
    const { user, isAdmin } = useAuth();
    const router = useRouter();
    const { items } = useItems();
    const { categories } = useCategories();
    const [activeTab, setActiveTab] = useState("items");
    const [showItemForm, setShowItemForm] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({ name: "", categoryId: "" });
    const [imageFile, setImageFile] = useState(null);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [qrItem, setQrItem] = useState(null);
    const [actionMenuOpen, setActionMenuOpen] = useState(null); // item/cat ID or null
    const [error, setError] = useState(null);

    // Category form state
    const [showCategoryForm, setShowCategoryForm] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [categoryFormData, setCategoryFormData] = useState({ name: "" });
    const [savingCategory, setSavingCategory] = useState(false);
    const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState(null);

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

    // Server-side APIs enforce this too; the redirect is just UX.
    useEffect(() => {
        if (!user || !isAdmin) router.replace("/");
    }, [user, isAdmin, router]);

    if (!user || !isAdmin) {
        return null;
    }

    const showError = (e) => setError(e?.message || "Something went wrong");

    // ── Item form helpers ──
    const openAddForm = () => {
        setEditingItem(null);
        setFormData({ name: "", categoryId: categories[0]?.id || "" });
        setImageFile(null);
        setError(null);
        setShowItemForm(true);
    };

    const openEditForm = (item) => {
        setEditingItem(item);
        setFormData({ name: item.name, categoryId: item.category_id || "" });
        setImageFile(null);
        setError(null);
        setShowItemForm(true);
        setActionMenuOpen(null);
    };

    const handleSaveItem = async () => {
        if (!formData.name.trim()) return;
        setSaving(true);
        setError(null);
        try {
            let photoUrl = editingItem?.photo_url || null;
            if (imageFile) {
                const fd = new FormData();
                fd.append("file", imageFile);
                const data = await api("/api/upload", { formData: fd });
                photoUrl = data.url;
            }
            const body = { name: formData.name.trim(), categoryId: formData.categoryId || null, photoUrl };
            if (editingItem) {
                await api(`/api/items/${editingItem.id}`, { method: "PATCH", body });
            } else {
                await api("/api/items", { body });
            }
            setShowItemForm(false);
            setEditingItem(null);
            setFormData({ name: "", categoryId: categories[0]?.id || "" });
            setImageFile(null);
        } catch (e) {
            showError(e);
        }
        setSaving(false);
    };

    const handleDeleteItem = async (itemId) => {
        try {
            await api(`/api/items/${itemId}`, { method: "DELETE" });
            setDeleteConfirm(null);
            setActionMenuOpen(null);
        } catch (e) {
            showError(e);
        }
    };

    // ── Category form helpers ──
    const openAddCategoryForm = () => {
        setEditingCategory(null);
        setCategoryFormData({ name: "" });
        setError(null);
        setShowCategoryForm(true);
    };

    const openEditCategoryForm = (cat) => {
        setEditingCategory(cat);
        setCategoryFormData({ name: cat.name });
        setError(null);
        setShowCategoryForm(true);
        setActionMenuOpen(null);
    };

    const handleSaveCategory = async () => {
        if (!categoryFormData.name.trim()) return;
        setSavingCategory(true);
        setError(null);
        try {
            const body = { name: categoryFormData.name.trim() };
            if (editingCategory) {
                await api(`/api/categories/${editingCategory.id}`, { method: "PATCH", body });
            } else {
                await api("/api/categories", { body });
            }
            setShowCategoryForm(false);
            setEditingCategory(null);
            setCategoryFormData({ name: "" });
        } catch (e) {
            showError(e);
        }
        setSavingCategory(false);
    };

    const handleDeleteCategory = async (catId) => {
        try {
            await api(`/api/categories/${catId}`, { method: "DELETE" });
            setDeleteCategoryConfirm(null);
            setActionMenuOpen(null);
        } catch (e) {
            showError(e);
        }
    };

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

    return (
        <div className="min-h-screen">
            <main className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
                {/* Header — matches home page style */}
                <div className="flex justify-between items-start mb-6 sm:mb-10">
                    <div className="flex items-start gap-1 sm:gap-2">
                        <button onClick={() => router.push("/")} className="p-2 -ml-2 mt-1 rounded-full hover:bg-[var(--bg-secondary)] transition-colors text-[var(--esn-cyan)]" aria-label="Go back">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                        </button>
                        <div>
                            <h1 className="home-title">Admin</h1>
                            <p className="home-subtitle">Manage requisitions and categories</p>
                        </div>
                    </div>
                    <div className="mt-1">
                        <UserMenu />
                    </div>
                </div>

                {/* Tabs */}
                <div className="filter-bar">
                    {[
                        { key: "items", label: `Requisitions (${items.length})` },
                        { key: "categories", label: `Categories (${categories.length})` },
                        { key: "access", label: "Access" },
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

                {error && !showItemForm && !showCategoryForm && (
                    <div className="card p-4 mb-4 text-[13px] text-[#ff3b30] flex items-center justify-between gap-3">
                        <span>{error}</span>
                        <button onClick={() => setError(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">Dismiss</button>
                    </div>
                )}

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
                                {items.map((item, index) => (
                                    <div
                                        key={item.id}
                                        className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 ${index !== items.length - 1 ? "border-b border-[var(--border-subtle)]" : ""}`}
                                    >
                                        <Link href={`/item/${item.id}`} className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 hover:opacity-70 transition-opacity">
                                            {item.photo_url ? (
                                                <img src={item.photo_url} alt={item.name} className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl object-cover ring-1 ring-black/5 flex-shrink-0" />
                                            ) : (
                                                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center text-lg sm:text-xl flex-shrink-0">
                                                    {"\u{1F4E6}"}
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <p className="font-medium text-[13px] sm:text-[14px] truncate">{item.name}</p>
                                                <div className="flex items-center gap-1.5 mt-1">
                                                    <span className="text-[11px] sm:text-[12px] text-[var(--text-muted)]">
                                                        {item.category_name || "No category"}
                                                    </span>
                                                    <span className="text-[11px] text-[var(--text-muted)]">·</span>
                                                    <span className="text-[11px] sm:text-[12px] text-[var(--text-muted)]">
                                                        {item.status === "office" ? "In Office" : item.holder_name || "Checked out"}
                                                    </span>
                                                </div>
                                            </div>
                                        </Link>

                                        {/* ⋯ actions menu */}
                                        <ItemActionsMenu item={item} />
                                    </div>
                                ))}
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
                                    const itemCount = items.filter((i) => i.category_id === cat.id).length;
                                    return (
                                        <div
                                            key={cat.id}
                                            className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 ${index !== categories.length - 1 ? "border-b border-[var(--border-subtle)]" : ""}`}
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

                {/* Access Tab */}
                {activeTab === "access" && (
                    <div className="card p-5 sm:p-6 space-y-4">
                        <div>
                            <h2 className="font-semibold text-[15px] mb-1">Who can use this app</h2>
                            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                                Every ESN Porto <strong>volunteer</strong> can sign in, see the items and pick up, return or pass them.
                                Volunteers are the people IT Manager knows as staff — there is no separate user list here.
                            </p>
                        </div>
                        <div>
                            <h2 className="font-semibold text-[15px] mb-1">Who is an admin</h2>
                            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                                ESN admins are admins everywhere. To make another volunteer an admin of <em>only</em> this app,
                                grant them the <span className="font-mono text-[12px]">admin</span> role for project{" "}
                                <span className="font-mono text-[12px]">requisitions_tracker</span> in IT Manager.
                            </p>
                        </div>
                        <a href={IT_MANAGER_URL} target="_blank" rel="noreferrer" className="btn-primary inline-flex">
                            Open IT Manager
                        </a>
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
                                    <CloseIcon />
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
                                        value={formData.categoryId}
                                        onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                                        className="input-field"
                                    >
                                        <option value="">No category</option>
                                        {categories.map((cat) => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
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
                                    {editingItem?.photo_url && !imageFile && (
                                        <p className="text-xs text-[var(--text-muted)] mt-1.5">Current photo will be kept</p>
                                    )}
                                </div>
                                {error && <p className="text-[13px] text-[#ff3b30]">{error}</p>}
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
                                    <CloseIcon />
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
                                            Key: <span className="font-mono">{slugify(categoryFormData.name)}</span>
                                        </p>
                                    )}
                                </div>
                                {error && <p className="text-[13px] text-[#ff3b30]">{error}</p>}
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
                            <CloseIcon />
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
                            {qrItem.legacy_id && (
                                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                                    Older stickers (<span className="font-mono">/scan/{qrItem.legacy_id}</span>) keep working.
                                </p>
                            )}
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
