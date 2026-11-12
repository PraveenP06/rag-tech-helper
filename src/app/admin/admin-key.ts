"use client";

import { useSyncExternalStore } from "react";

export const ADMIN_KEY_STORAGE = "ingest-api-key";
const ADMIN_KEY_EVENT = "ingest-api-key-change";

function subscribe(onChange: () => void) {
  window.addEventListener(ADMIN_KEY_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(ADMIN_KEY_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useAdminKey() {
  return useSyncExternalStore(
    subscribe,
    () => sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? "",
    () => "",
  );
}

export function saveAdminKey(value: string) {
  sessionStorage.setItem(ADMIN_KEY_STORAGE, value);
  window.dispatchEvent(new Event(ADMIN_KEY_EVENT));
}
