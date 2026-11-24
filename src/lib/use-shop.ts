"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ApiError, loadShop } from "./api";
import { applyTheme } from "./apply-theme";
import type { Menu, Shop } from "./types";

type State =
  | { status: "loading" }
  | { status: "ready"; shop: Shop; menu: Menu }
  | { status: "error"; code: string };

/*
 * The shop and its menu, loaded once per visit and shared by every screen.
 * Nothing polls: if a dish sells out after the page loaded, the server
 * refuses the order with "sold_out" and the checkout reloads the menu.
 */
let state: State = { status: "loading" };
let started = false;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

async function refresh() {
  try {
    const { shop, menu } = await loadShop();
    applyTheme(shop.theme);
    set({ status: "ready", shop, menu });
  } catch (error) {
    // Keep showing the last good menu if a refresh fails.
    if (state.status !== "ready") set({ status: "error", code: error instanceof ApiError ? error.code : "error" });
  }
}

/** Loads the shop and menu again, for example after a dish sold out. */
export function reloadShop() {
  return refresh();
}

export function retryShop() {
  set({ status: "loading" });
  void refresh();
}

export function useShop(): State {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
  useEffect(() => {
    if (started) return;
    started = true;
    void refresh();
  }, []);
  return current;
}
