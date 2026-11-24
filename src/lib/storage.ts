"use client";

import { useSyncExternalStore } from "react";
import { parse, type Basket } from "./basket";

/**
 * This browser's own conveniences: the language and the basket. Nothing here
 * is sent anywhere except the dishes in the basket when the order is placed.
 * Storage can be missing (private mode), so every read and write is guarded.
 */
export type Locale = "en" | "zh-Hant";
export type Local = { locale: Locale; basket: Basket };

const KEY = "dan.customer.v1";
const EMPTY: Local = { locale: "en", basket: {} };
let cache: Local | null = null;
const listeners = new Set<() => void>();

function read(): Local {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const value = JSON.parse(raw) as Partial<Local>;
    return { locale: value.locale === "zh-Hant" ? "zh-Hant" : "en", basket: parse(value.basket) };
  } catch {
    return EMPTY;
  }
}

function snapshot(): Local {
  if (typeof window === "undefined") return EMPTY;
  if (!cache) cache = read();
  return cache;
}

export function writeLocal(patch: Partial<Local>) {
  cache = { ...snapshot(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Kept in memory for this visit.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLocal(): Local {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}
