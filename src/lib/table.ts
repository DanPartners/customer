"use client";

import { useSyncExternalStore } from "react";

/**
 * The table a customer is sitting at, from the QR link on it (`?table=3`).
 *
 * Kept for this browser tab only (sessionStorage), so someone who scanned a
 * table's code and later orders from home is not still "at table 3". The
 * shop server checks the name again; this only avoids showing a bad one.
 */
const KEY = "dan.customer.table";
const listeners = new Set<() => void>();
let cache: string | null | undefined;

/** Up to 10 letters (any language), numbers, spaces or hyphens, with spaces tidied. Null if not allowed. */
export function tableName(value: string | null | undefined): string | null {
  const tidy = (value ?? "").split(/\s+/).filter(Boolean).join(" ");
  if (!tidy || [...tidy].length > 10 || !/^[\p{L}\p{N} -]+$/u.test(tidy)) return null;
  return tidy;
}

function read(): string | null {
  if (cache !== undefined) return cache;
  try {
    cache = tableName(window.sessionStorage.getItem(KEY));
  } catch {
    cache = null;
  }
  return cache;
}

export function setTable(value: string | null) {
  cache = tableName(value);
  try {
    if (cache) window.sessionStorage.setItem(KEY, cache);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // Kept in memory for this visit.
  }
  for (const listener of listeners) listener();
}

/** Takes `?table=` from the address, if there is one. A bad value is ignored. */
export function adoptTableFromAddress(search: string) {
  const params = new URLSearchParams(search);
  if (!params.has("table")) return;
  const name = tableName(params.get("table"));
  if (name) setTable(name);
}

export function useTable(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (typeof window === "undefined" ? null : read()),
    () => null,
  );
}
