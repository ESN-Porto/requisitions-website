"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isUuid } from "@/lib/ids";

export { isUuid };

const SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || "requisitions_tracker";

/**
 * Generic "query + live refetch" hook.
 *
 * `fetcher(supabase)` returns a PostgREST builder (thenable). `tables` lists
 * the requisitions_tracker tables whose changes (via Supabase Realtime,
 * gated by RLS) should trigger a refetch. Refetching instead of patching keeps
 * the views (items_view joins holder + category) the single source of truth.
 */
function useLiveQuery(fetcher, tables, deps, { enabled = true } = {}) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;

    const refresh = useCallback(async () => {
        if (!enabled) {
            setData(null);
            setLoading(false);
            return;
        }
        const supabase = createClient();
        const { data: rows, error: err } = await fetcherRef.current(supabase);
        if (err) {
            console.error("[data] query failed:", err.code, err.message);
            setError(err);
        } else {
            setData(rows);
            setError(null);
        }
        setLoading(false);
    }, [enabled, ...deps]);

    useEffect(() => {
        refresh();
        if (!enabled || tables.length === 0) return undefined;

        const supabase = createClient();
        const channel = supabase.channel(`live-${tables.join("-")}-${Math.random().toString(36).slice(2)}`);
        for (const table of tables) {
            channel.on("postgres_changes", { event: "*", schema: SCHEMA, table }, () => refresh());
        }
        channel.subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refresh, enabled]);

    return { data, error, loading, refresh };
}

/** All items with category + resolved holder, ordered by name. */
export function useItems() {
    const q = useLiveQuery((sb) => sb.from("items_view").select("*").order("name"), ["items", "categories"], []);
    return { items: q.data || [], loading: q.loading, error: q.error, refresh: q.refresh };
}

/** One item by uuid or by legacy Firestore id (printed QR codes). */
export function useItem(idOrLegacyId) {
    const column = isUuid(idOrLegacyId) ? "id" : "legacy_id";
    const q = useLiveQuery(
        (sb) => sb.from("items_view").select("*").eq(column, idOrLegacyId).maybeSingle(),
        ["items"],
        [idOrLegacyId],
        { enabled: Boolean(idOrLegacyId) }
    );
    return { item: q.data, loading: q.loading, error: q.error, refresh: q.refresh };
}

/** Categories ordered for display. */
export function useCategories() {
    const q = useLiveQuery(
        (sb) => sb.from("categories").select("*").order("sort_order").order("name"),
        ["categories"],
        []
    );
    return { categories: q.data || [], loading: q.loading, error: q.error, refresh: q.refresh };
}

/** Audit trail of one item, newest first. Pass the item's uuid. */
export function useTransfers(itemId) {
    const q = useLiveQuery(
        (sb) => sb.from("transfers").select("*").eq("item_id", itemId).order("created_at", { ascending: false }),
        ["transfers"],
        [itemId],
        { enabled: isUuid(itemId) }
    );
    return { transfers: q.data || [], loading: q.loading, error: q.error, refresh: q.refresh };
}

/**
 * Volunteer directory (IT Manager data through requisitions_tracker.volunteers).
 * Not live: the roster changes rarely.
 */
export function useVolunteers() {
    const q = useLiveQuery((sb) => sb.from("volunteers").select("*").order("name"), [], []);
    const volunteers = q.data || [];
    const byId = Object.fromEntries(volunteers.map((v) => [v.id, v]));
    return { volunteers, byId, loading: q.loading, error: q.error, refresh: q.refresh };
}

export function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
