import { describe, it, expect } from "vitest";
import { fetchBrandLogoPngBytes, getBrandLogoPublicUrl } from "../brandStorage";

// The seed brand ("The Anchor Pub") ships these logos under /public, referenced
// via legacy "/"-prefixed object keys.
const VALID_LEGACY_LOGO = "/the-anchor-pub-logo-white-transparent.png";

// package.json and tsconfig.json live at the repo root (<cwd>), i.e. OUTSIDE
// <cwd>/public — so a "/"-prefixed key that resolves to them is a traversal.
describe("fetchBrandLogoPngBytes — legacy /public path confinement", () => {
  it("returns null for a path-traversal key that escapes /public", async () => {
    expect(await fetchBrandLogoPngBytes("/../package.json")).toBeNull();
  });

  it("returns null for other keys that resolve outside /public", async () => {
    expect(await fetchBrandLogoPngBytes("/../tsconfig.json")).toBeNull();
  });

  it("still reads a legitimate logo that resolves inside /public", async () => {
    const bytes = await fetchBrandLogoPngBytes(VALID_LEGACY_LOGO);
    expect(bytes).not.toBeNull();
    expect(bytes!.byteLength).toBeGreaterThan(0);
  });
});

describe("getBrandLogoPublicUrl — legacy /public path confinement", () => {
  it("rejects a traversal key (returns empty string, not the escaping path)", () => {
    expect(getBrandLogoPublicUrl("/../package.json")).toBe("");
    expect(getBrandLogoPublicUrl("/../../etc/passwd")).toBe("");
  });

  it("preserves a legitimate legacy /public path unchanged", () => {
    expect(getBrandLogoPublicUrl(VALID_LEGACY_LOGO)).toBe(VALID_LEGACY_LOGO);
  });
});
