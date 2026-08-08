"use client";

import { useEffect, useState } from "react";
import { assertAdminUnlocked } from "@/lib/live/adminGuard";
import type { Brand } from "./types";

/** A brand row as `GET /api/brands` returns it: logo keys resolved to URLs. */
export type BrandWithUrls = Brand & {
  logo_dark_public_url?: string;
  logo_light_public_url?: string;
  event_logo_public_url?: string | null;
};

export type BrandListState = {
  brands: BrandWithUrls[];
  loading: boolean;
  /** Message from the most recent failed load, or null while the list is good. */
  error: string | null;
  /**
   * Status when the server answered and refused (401 from the admin gate, 500,
   * and so on). Null when the request itself never landed.
   */
  errorStatus: number | null;
};

/** Thrown when `/api/brands` answers with a non-2xx status. */
export class BrandListRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Failed to load venues (HTTP ${status})`);
    this.name = "BrandListRequestError";
    this.status = status;
  }
}

const EMPTY: BrandWithUrls[] = [];

let cached: BrandWithUrls[] | null = null;
let stale = false;
let inFlight: Promise<BrandWithUrls[]> | null = null;
let error: string | null = null;
let errorStatus: number | null = null;
/** Bumped on invalidation so a superseded request cannot write its result back. */
let generation = 0;

const subscribers = new Set<() => void>();

let currentState: BrandListState = {
  brands: EMPTY,
  loading: true,
  error: null,
  errorStatus: null,
};

function publish(): void {
  currentState = {
    brands: cached ?? EMPTY,
    // Nothing to show and nothing to explain yet, so a request is on its way.
    loading: cached === null && error === null,
    error,
    errorStatus,
  };
  for (const subscriber of [...subscribers]) subscriber();
}

async function requestBrands(): Promise<BrandWithUrls[]> {
  const res = await fetch("/api/brands");
  // A lapsed admin cookie bounces to the unlock page and aborts here, so a 401
  // never reaches consumers dressed up as "this venue has no brands". One
  // shared request means one redirect per page rather than one per selector.
  assertAdminUnlocked(res);
  if (!res.ok) throw new BrandListRequestError(res.status);
  return (await res.json()) as BrandWithUrls[];
}

/**
 * Load the brand list, sharing one request across every caller.
 *
 * `/host` renders a `<BrandSelector>` per game row, so a selector that fetched
 * for itself fired one identical `GET /api/brands` per row. Callers that arrive
 * while a request is in flight join it; callers that arrive afterwards read the
 * cache until `invalidateBrandList()` or `refreshBrandList()` clears it.
 *
 * Failures are never cached: an admin gate that refuses once the unlock cookie
 * has lapsed must be re-checked on the next load, not remembered for the
 * lifetime of the tab.
 */
export function loadBrandList(): Promise<BrandWithUrls[]> {
  if (cached && !stale) return Promise.resolve(cached);
  if (inFlight) return inFlight;

  const gen = generation;
  const request = requestBrands().then(
    (brands) => {
      if (gen === generation) {
        cached = brands;
        stale = false;
        inFlight = null;
        error = null;
        errorStatus = null;
        publish();
      }
      return brands;
    },
    (err: unknown) => {
      if (gen === generation) {
        inFlight = null;
        error = err instanceof Error ? err.message : "Failed to load venues.";
        errorStatus = err instanceof BrandListRequestError ? err.status : null;
        publish();
      }
      throw err;
    }
  );

  inFlight = request;
  return request;
}

/**
 * Mark the cache stale so the next `loadBrandList()` goes back to the server.
 * The current list stays on screen meanwhile, so a refresh does not flash every
 * mounted selector back to "Loading brands…".
 */
export function invalidateBrandList(): void {
  generation += 1;
  inFlight = null;
  stale = true;
  if (cached === null) {
    // Nothing to keep on screen: drop the old failure so consumers show the
    // loading state again rather than a stale error while the retry runs.
    error = null;
    errorStatus = null;
    publish();
  }
}

/** Refetch now and push the new list to every mounted consumer. */
export function refreshBrandList(): Promise<BrandWithUrls[]> {
  invalidateBrandList();
  return loadBrandList();
}

/** Test-only: forget the cache, the last error and every subscriber. */
export function resetBrandListForTests(): void {
  generation += 1;
  cached = null;
  stale = false;
  inFlight = null;
  error = null;
  errorStatus = null;
  subscribers.clear();
  publish();
}

/**
 * Subscribe to the shared brand list. Every consumer sees the same request, the
 * same cache and the same invalidations.
 */
export function useBrandList(): BrandListState {
  const [state, setState] = useState<BrandListState>(currentState);

  useEffect(() => {
    let active = true;
    const sync = (): void => {
      if (active) setState(currentState);
    };

    subscribers.add(sync);
    // `publish()` covers consumers already mounted when a request settles; this
    // covers one that mounts afterwards and needs the cache straight away.
    loadBrandList().then(sync, sync);

    return () => {
      active = false;
      subscribers.delete(sync);
    };
  }, []);

  return state;
}
