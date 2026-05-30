import type { BrandConfig } from "@/lib/brands/types";
import type { LiveRuntimeState } from "@/lib/live/types";

/** Layout variant for screens that offer A/B/C alternatives (Welcome, Title). */
export type ScreenVariant = "A" | "B" | "C";

/**
 * Common props for every TV screen component. Screens are presentational:
 * text is pulled via the `Editable` motif (which reads `EditContext`), brand
 * theming via `brand`, and live track/reveal data via `runtime` (absent when a
 * screen is rendered in isolation or has no live data, in which case design
 * placeholders are shown). The page wiring (Phases 2/3) supplies these.
 */
export type ScreenProps = {
  brand: BrandConfig;
  runtime?: LiveRuntimeState | null;
  variant?: ScreenVariant;
};
