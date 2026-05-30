"use client";

import { createContext, useContext } from "react";

/** Value exposed by EditContext for host-side click-to-edit. */
export type EditContextValue = {
  /** Whether editing mode is active. */
  editing: boolean;
  /** Return the current value for a field, falling back to the placeholder. */
  get: (key: string, fallback?: string) => string;
  /** Persist a new value for a field. */
  set: (key: string, value: string) => void;
};

/** Inert default — components render normally when no provider is mounted. */
export const EditContext = createContext<EditContextValue>({
  editing: false,
  get: (_k, fb = "") => fb,
  set: () => {},
});

/** Convenience hook for consuming the edit context. */
export function useEdit(): EditContextValue {
  return useContext(EditContext);
}
