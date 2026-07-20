# Review Pack: after-hours-phase-0

**Generated:** 2026-05-29
**Mode:** B (A=Adversarial / B=Code / C=Spec Compliance)
**Project root:** `/Users/peterpitcher/Cursor/OJ-MusicBingo/.claude/worktrees/nice-cohen-6dbea6`
**Base ref:** `7a3a555`
**HEAD:** `795fbe8`
**Diff range:** `7a3a555...HEAD`
**Stats:**  24 files changed, 489 insertions(+), 143 deletions(-)

> This pack is the sole input for reviewers. Do NOT read files outside it unless a specific finding requires verification. If a file not in the pack is needed, mark the finding `Needs verification` and describe what would resolve it.

## Changed Files

```
app/globals.css
app/layout.tsx
components/brand/BrandProvider.tsx
components/layout/AppHeader.tsx
components/ui/Badge.tsx
components/ui/Button.tsx
components/ui/Card.tsx
components/ui/Notice.tsx
components/ui/StepIndicator.tsx
components/ui/formStyles.ts
eslint.config.mjs
lib/brands/brandRepo.ts
lib/brands/brandStorage.ts
lib/brands/fonts.test.ts
lib/brands/fonts.ts
lib/brands/types.test.ts
lib/brands/types.ts
lib/eventFeed/baronshubAdapter.test.ts
lib/live/reveal.test.ts
lib/live/storage.test.ts
package.json
supabase/migrations/20260529120000_add_brand_fonts_and_event_logo.sql
tailwind.config.ts
vitest.config.ts
```

## User Concerns

brand data layer correctness; BrandProvider token/font injection+cleanup; migration-not-yet-applied runtime safety (columns absent -> fields undefined/defaults); dark UI primitive restyle regressions

## Diff (`7a3a555...HEAD`)

```diff
diff --git a/app/globals.css b/app/globals.css
index 2bfa86c..a3ecaca 100644
--- a/app/globals.css
+++ b/app/globals.css
@@ -3,21 +3,136 @@
 @tailwind utilities;
 
 :root {
-  --brand-primary-rgb: 0 63 39;
-  --brand-primary-light-rgb: 15 104 70;
-  --brand-accent-rgb: 165 118 38;
-  --brand-accent-light-rgb: 196 149 47;
-  --brand-font: 'Inter', ui-sans-serif, system-ui, sans-serif;
+  /* brand (overridden per-venue by BrandProvider) */
+  --brand-primary: #003F27;        --brand-primary-rgb: 0 63 39;
+  --brand-primary-light: #0F6846;  --brand-primary-light-rgb: 15 104 70;
+  --brand-accent: #A57626;         --brand-accent-rgb: 165 118 38;
+  --brand-accent-light: #C4952F;   --brand-accent-light-rgb: 196 149 47;
+
+  /* fonts (next/font vars are set on <html> in layout.tsx) */
+  --brand-display: var(--font-anton), Impact, sans-serif;
+  --brand-body: var(--font-archivo), ui-sans-serif, system-ui, sans-serif;
+
+  /* derived */
+  --ink: #04130C;   --ink-rgb: 4 19 12;
+  --cream: #F6EFDD; --cream-rgb: 246 239 221; --cream-dim: #cdbfa0;
 }
 
-/* Guest projection background — multi-layer radial gradient using brand CSS variables */
+/* ===== type helpers ===== */
+.kicker {
+  font-family: var(--brand-body), sans-serif; font-weight: 700; text-transform: uppercase;
+  letter-spacing: .42em; color: var(--brand-accent-light);
+  display: inline-flex; align-items: center; gap: 22px; white-space: nowrap;
+}
+.kicker::before, .kicker::after { content: ""; width: 54px; height: 2px;
+  background: linear-gradient(90deg, transparent, var(--brand-accent-light)); }
+.kicker--plain::before, .kicker--plain::after { display: none; }
+.display {
+  font-family: var(--brand-display), Impact, sans-serif; font-weight: 400;
+  text-transform: uppercase; line-height: .9; letter-spacing: .005em; margin: 0; color: var(--cream);
+}
+.display--gold {
+  background: linear-gradient(180deg, #fff6dd 0%, var(--brand-accent-light) 42%, var(--brand-accent) 100%);
+  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
+  white-space: nowrap; padding: 0 0.12em;
+}
+.display--gold > div, .display--gold > span { white-space: nowrap; }
+.lede { line-height: 1.35; font-weight: 500; color: rgb(var(--cream-rgb) / .86); margin: 0; text-wrap: pretty; }
+.pill {
+  display: inline-flex; align-items: center; gap: 14px; padding: 14px 30px; border-radius: 999px;
+  border: 2px solid rgb(var(--brand-accent-light-rgb) / .7); background: rgb(var(--brand-accent-rgb) / .14);
+  color: var(--brand-accent-light); font-weight: 700; text-transform: uppercase; letter-spacing: .14em;
+  backdrop-filter: blur(4px);
+}
+.rule { height: 3px; border: 0; width: 100%;
+  background: linear-gradient(90deg, transparent, var(--brand-accent), transparent); }
+
+/* ===== screen backgrounds ===== */
+.screen {
+  position: absolute; inset: 0; display: flex; flex-direction: column; color: var(--cream); overflow: hidden;
+  background:
+    radial-gradient(130% 100% at 50% -20%, rgb(var(--brand-primary-light-rgb) / .55) 0%, transparent 55%),
+    radial-gradient(80% 70% at 50% 120%, rgb(var(--brand-accent-rgb) / .18) 0%, transparent 60%),
+    linear-gradient(180deg, var(--brand-primary) 0%, var(--ink) 100%);
+}
+.screen--warm {
+  background:
+    radial-gradient(130% 100% at 50% -10%, rgb(var(--brand-accent-light-rgb) / .6) 0%, transparent 55%),
+    linear-gradient(180deg, var(--brand-accent) 0%, var(--ink) 100%);
+}
+.grain::after {
+  content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 40; opacity: .05; mix-blend-mode: overlay;
+  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
+}
+.vignette::before { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 35;
+  box-shadow: inset 0 0 240px 60px rgba(0,0,0,.55); }
+
+/* ===== disco motifs (all CSS) ===== */
+.sunburst {
+  position: absolute; border-radius: 50%; opacity: .5; animation: spin 80s linear infinite;
+  background: repeating-conic-gradient(from 0deg, rgb(var(--brand-accent-rgb) / .38) 0deg 6deg, transparent 6deg 12deg);
+  -webkit-mask: radial-gradient(closest-side, transparent 12%, #000 16%, #000 100%);
+          mask: radial-gradient(closest-side, transparent 12%, #000 16%, #000 100%);
+}
+@keyframes spin { to { transform: rotate(360deg); } }
+.vinyl {
+  position: relative; border-radius: 50%; display: grid; place-items: center; animation: spin 6s linear infinite;
+  background: radial-gradient(circle at 50% 50%, #1b1b1b 0 17%, transparent 17.4%),
+    repeating-radial-gradient(circle at 50% 50%, #0c0c0c 0 2px, #161616 2px 4px), #0a0a0a;
+  box-shadow: 0 30px 80px rgba(0,0,0,.6), inset 0 0 0 2px rgba(255,255,255,.04);
+}
+.vinyl__label { width: 34%; height: 34%; border-radius: 50%; display: grid; place-items: center;
+  background: radial-gradient(circle, var(--brand-accent-light), var(--brand-accent));
+  box-shadow: inset 0 0 0 4px rgba(0,0,0,.25); }
+.vinyl__hole { width: 7%; height: 7%; border-radius: 50%; background: var(--ink); box-shadow: 0 0 0 6px rgba(0,0,0,.25); }
+.eq { display: flex; align-items: flex-end; gap: 7px; height: 60px; }
+.eq i { width: 10px; border-radius: 4px 4px 0 0;
+  background: linear-gradient(180deg, var(--brand-accent-light), var(--brand-accent));
+  animation: eq 900ms ease-in-out infinite alternate; }
+@keyframes eq { from { height: 18%; } to { height: 100%; } }
+.ball {
+  border-radius: 50%; display: grid; place-items: center; font-family: var(--brand-display), sans-serif;
+  color: var(--ink); position: relative;
+  background: radial-gradient(circle at 35% 28%, #fff 0%, var(--brand-accent-light) 30%, var(--brand-accent) 78%);
+  box-shadow: inset 0 -10px 22px rgba(0,0,0,.25), 0 14px 30px rgba(0,0,0,.4);
+}
+.ball::after { content:""; position:absolute; inset: 14%; border-radius:50%; border: 3px solid rgba(255,255,255,.5); }
+.chrome {
+  position: absolute; left: 0; right: 0; bottom: 0; z-index: 30; display: flex; align-items: center;
+  justify-content: space-between; padding: 22px 56px; letter-spacing: .18em; text-transform: uppercase;
+  color: rgb(var(--cream-rgb) / .6);
+}
+.chrome .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--brand-accent-light);
+  box-shadow: 0 0 14px var(--brand-accent-light); display: inline-block; margin-right: 12px;
+  animation: pulse 1.6s ease-in-out infinite; }
+@keyframes pulse { 50% { opacity: .35; } }
+
+/* ===== entrance animations ===== */
+@keyframes rise { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: none; } }
+@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
+@keyframes pop  { from { opacity: 0; transform: scale(.8); } to { opacity: 1; transform: none; } }
+@keyframes slideL { from { opacity:0; transform: translateX(-60px);} to {opacity:1; transform:none;} }
+.an-rise { animation: rise .8s cubic-bezier(.2,.8,.2,1) backwards; }
+.an-fade { animation: fade 1s ease backwards; }
+.an-pop  { animation: pop .7s cubic-bezier(.2,1.2,.3,1) backwards; }
+.an-slideL { animation: slideL .7s cubic-bezier(.2,.8,.2,1) backwards; }
+.d1{ animation-delay:.08s;} .d2{ animation-delay:.18s;} .d3{ animation-delay:.30s;}
+.d4{ animation-delay:.42s;} .d5{ animation-delay:.56s;} .d6{ animation-delay:.7s;}
+
+/* ===== host-side click-to-edit (enabled only inside the host preview) ===== */
+[data-edit] { outline: none; border-radius: 6px; transition: box-shadow .15s, background .15s; }
+.editing [data-edit] { box-shadow: 0 0 0 2px rgb(var(--brand-accent-light-rgb) / .7); background: rgba(0,0,0,.18); cursor: text; }
+.editing [data-edit]:hover { box-shadow: 0 0 0 2px var(--brand-accent-light); }
+.editing [data-edit]:focus { box-shadow: 0 0 0 3px var(--brand-accent-light); background: rgba(0,0,0,.3); }
+[data-edit]:empty::before { content: attr(data-placeholder); opacity: .4; }
+
+/* ===== LEGACY (retained until Phase 2 rebuilds the guest page) ===== */
 .guest-projection-shell {
   background:
     radial-gradient(circle at 10% 20%, rgb(var(--brand-accent-rgb) / 0.14), transparent 45%),
     radial-gradient(circle at 90% 10%, rgb(var(--brand-primary-light-rgb) / 0.22), transparent 50%),
     linear-gradient(180deg, rgb(var(--brand-primary-rgb)) 0%, rgb(var(--brand-primary-rgb) / 0.85) 100%);
 }
-
 .challenge-projection-shell {
   background:
     radial-gradient(circle at 20% 15%, rgb(254 240 138 / 0.35), transparent 34%),
diff --git a/app/layout.tsx b/app/layout.tsx
index 1e83975..514a5e1 100644
--- a/app/layout.tsx
+++ b/app/layout.tsx
@@ -1,8 +1,10 @@
 import "./globals.css";
 import type { Metadata } from "next";
-import { Inter } from "next/font/google";
+import { Inter, Anton, Archivo } from "next/font/google";
 
-const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
+const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
+const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });
+const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
 
 export const metadata: Metadata = {
   title: "Music Bingo",
@@ -15,8 +17,8 @@ export default function RootLayout({
   children: React.ReactNode;
 }>) {
   return (
-    <html lang="en" className={inter.variable}>
-      <body className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
+    <html lang="en" className={`${inter.variable} ${anton.variable} ${archivo.variable}`}>
+      <body className="min-h-screen bg-ink text-cream font-sans antialiased">
         {children}
       </body>
     </html>
diff --git a/components/brand/BrandProvider.tsx b/components/brand/BrandProvider.tsx
index f931c01..a458507 100644
--- a/components/brand/BrandProvider.tsx
+++ b/components/brand/BrandProvider.tsx
@@ -2,6 +2,7 @@
 
 import { useEffect, type ReactNode } from "react";
 import { hexToRgbChannels } from "@/lib/brands/hexToRgb";
+import { resolveBrandFonts, fontFamilyCss, buildGoogleFontHref } from "@/lib/brands/fonts";
 import type { BrandConfig } from "@/lib/brands/types";
 
 type BrandProviderProps = {
@@ -9,47 +10,54 @@ type BrandProviderProps = {
   children: ReactNode;
 };
 
+function setBrandFontLink(attr: string, family: string) {
+  const existing = document.querySelector(`link[${attr}]`);
+  if (existing) existing.remove();
+  const href = buildGoogleFontHref(family);
+  if (!href) return; // next/font-managed default or unsupported — nothing to load
+  const link = document.createElement("link");
+  link.rel = "stylesheet";
+  link.href = href;
+  link.setAttribute(attr, "true");
+  document.head.appendChild(link);
+}
+
 export function BrandProvider({ brand, children }: BrandProviderProps): ReactNode {
   useEffect(() => {
     if (!brand) return;
-
     const root = document.documentElement;
-    root.style.setProperty("--brand-primary-rgb", hexToRgbChannels(brand.color_primary));
-    root.style.setProperty("--brand-primary-light-rgb", hexToRgbChannels(brand.color_primary_light));
-    root.style.setProperty("--brand-accent-rgb", hexToRgbChannels(brand.color_accent));
-    root.style.setProperty("--brand-accent-light-rgb", hexToRgbChannels(brand.color_accent_light));
-
-    // Update page title
-    document.title = `${brand.name} — Music Bingo`;
 
-    // Load Google Font if specified
-    if (brand.font_family) {
-      const fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(brand.font_family)}:wght@400;600;700;900&display=swap`;
-      const existingLink = document.querySelector(`link[data-brand-font]`);
-      if (existingLink) existingLink.remove();
-
-      const link = document.createElement("link");
-      link.rel = "stylesheet";
-      link.href = fontUrl;
-      link.setAttribute("data-brand-font", "true");
-      document.head.appendChild(link);
-      root.style.setProperty("--brand-font", `'${brand.font_family}', ui-sans-serif, system-ui, sans-serif`);
-    } else {
-      root.style.setProperty("--brand-font", "'Inter', ui-sans-serif, system-ui, sans-serif");
-      const existingLink = document.querySelector(`link[data-brand-font]`);
-      if (existingLink) existingLink.remove();
+    // Hex + RGB-channel tokens (the design uses both forms).
+    const colours: Array<[string, string]> = [
+      ["--brand-primary", brand.color_primary],
+      ["--brand-primary-light", brand.color_primary_light],
+      ["--brand-accent", brand.color_accent],
+      ["--brand-accent-light", brand.color_accent_light],
+    ];
+    for (const [name, hex] of colours) {
+      root.style.setProperty(name, hex);
+      root.style.setProperty(`${name}-rgb`, hexToRgbChannels(hex));
     }
 
+    // Fonts — resolved through the allowlist (A9); links only for non-next/font families.
+    const { display, body } = resolveBrandFonts(brand);
+    root.style.setProperty("--brand-display", fontFamilyCss(display));
+    root.style.setProperty("--brand-body", fontFamilyCss(body));
+    setBrandFontLink("data-brand-font-display", display);
+    setBrandFontLink("data-brand-font-body", body);
+
+    document.title = `${brand.name} — Music Bingo`;
+
     return () => {
-      // Reset to defaults on unmount
-      root.style.removeProperty("--brand-primary-rgb");
-      root.style.removeProperty("--brand-primary-light-rgb");
-      root.style.removeProperty("--brand-accent-rgb");
-      root.style.removeProperty("--brand-accent-light-rgb");
-      root.style.removeProperty("--brand-font");
+      for (const [name] of colours) {
+        root.style.removeProperty(name);
+        root.style.removeProperty(`${name}-rgb`);
+      }
+      root.style.removeProperty("--brand-display");
+      root.style.removeProperty("--brand-body");
+      document.querySelector("link[data-brand-font-display]")?.remove();
+      document.querySelector("link[data-brand-font-body]")?.remove();
       document.title = "Music Bingo";
-      const existingLink = document.querySelector(`link[data-brand-font]`);
-      if (existingLink) existingLink.remove();
     };
   }, [brand]);
 
diff --git a/components/layout/AppHeader.tsx b/components/layout/AppHeader.tsx
index 57d89bf..a09f89e 100644
--- a/components/layout/AppHeader.tsx
+++ b/components/layout/AppHeader.tsx
@@ -17,7 +17,7 @@ export function AppHeader({
   title,
   subtitle,
   actions,
-  variant = "light",
+  variant = "dark",
   logoDarkUrl,
   logoLightUrl,
   logoAlt,
@@ -27,10 +27,10 @@ export function AppHeader({
   return (
     <header
       className={[
-        "sticky top-0 z-20 flex items-center justify-between gap-5 px-6 py-4",
+        "sticky top-0 z-20 flex items-center justify-between gap-5 px-6 py-4 backdrop-blur",
         isDark
-          ? "bg-brand-green/95 border-b border-brand-gold/50 backdrop-blur-sm"
-          : "bg-white/95 border-b border-slate-200 backdrop-blur-sm shadow-sm",
+          ? "bg-ink/85 border-b border-brand-gold/35"
+          : "bg-white/95 border-b border-slate-200 shadow-sm",
       ].join(" ")}
     >
       <div className="flex items-center gap-3.5">
@@ -49,8 +49,8 @@ export function AppHeader({
         <div>
           <h1
             className={[
-              "m-0 text-xl font-extrabold uppercase tracking-wide leading-tight",
-              isDark ? "text-white" : "text-slate-900",
+              "m-0 text-2xl font-display uppercase tracking-wide leading-none",
+              isDark ? "text-cream" : "text-slate-900",
             ].join(" ")}
           >
             {title}
@@ -58,8 +58,8 @@ export function AppHeader({
           {subtitle && (
             <p
               className={[
-                "m-0 mt-0.5 text-xs uppercase tracking-widest",
-                isDark ? "text-white/70" : "text-slate-500",
+                "m-0 mt-1 text-[11px] font-bold uppercase tracking-[0.28em]",
+                isDark ? "text-brand-gold-light" : "text-slate-500",
               ].join(" ")}
             >
               {subtitle}
diff --git a/components/ui/Badge.tsx b/components/ui/Badge.tsx
index 6aeb41f..f98eb48 100644
--- a/components/ui/Badge.tsx
+++ b/components/ui/Badge.tsx
@@ -8,8 +8,8 @@ export function Badge({ children, active = false, className = "" }: BadgeProps)
   const base =
     "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide border transition-colors";
   const state = active
-    ? "border-brand-gold bg-amber-50 text-amber-800"
-    : "border-slate-200 bg-slate-100 text-slate-600";
+    ? "border-brand-gold-light bg-brand-gold/20 text-brand-gold-light"
+    : "border-white/15 bg-black/20 text-cream/60";
   const cls = [base, state, className].filter(Boolean).join(" ");
   return <span className={cls}>{children}</span>;
 }
diff --git a/components/ui/Button.tsx b/components/ui/Button.tsx
index bbd2de8..7dcf6b4 100644
--- a/components/ui/Button.tsx
+++ b/components/ui/Button.tsx
@@ -6,13 +6,13 @@ type Size = "sm" | "md";
 
 const variantClasses: Record<Variant, string> = {
   primary:
-    "bg-brand-gold hover:bg-brand-gold-light text-white border-transparent shadow-sm",
+    "bg-brand-gold hover:bg-brand-gold-light text-ink border-brand-gold-light shadow-sm",
   secondary:
-    "bg-white hover:bg-slate-50 text-slate-800 border-slate-300 hover:border-slate-400",
+    "bg-white/[0.06] hover:bg-white/[0.12] text-cream border-white/[0.16]",
   danger:
-    "bg-red-600 hover:bg-red-700 text-white border-transparent shadow-sm",
+    "bg-red-500/20 hover:bg-red-500/30 text-red-200 border-red-400/60",
   success:
-    "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent shadow-sm",
+    "bg-emerald-600 hover:bg-emerald-500 text-emerald-50 border-emerald-400/70 shadow-sm",
 };
 
 const sizeClasses: Record<Size, string> = {
diff --git a/components/ui/Card.tsx b/components/ui/Card.tsx
index 3c4c27d..1619fa9 100644
--- a/components/ui/Card.tsx
+++ b/components/ui/Card.tsx
@@ -11,7 +11,7 @@ type CardProps = {
 
 export function Card({ children, className = "", as: Tag = "div", onSubmit }: CardProps) {
   const base =
-    "bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8";
+    "bg-ink/60 rounded-2xl border border-brand-gold/30 shadow-[0_18px_50px_rgba(0,0,0,0.4)] p-6 sm:p-8 text-cream";
   const cls = [base, className].filter(Boolean).join(" ");
 
   if (Tag === "form") {
diff --git a/components/ui/Notice.tsx b/components/ui/Notice.tsx
index 5ffc9eb..270e069 100644
--- a/components/ui/Notice.tsx
+++ b/components/ui/Notice.tsx
@@ -7,10 +7,10 @@ type NoticeProps = {
 };
 
 const variantClasses: Record<Variant, string> = {
-  success: "bg-emerald-50 border-emerald-300 text-emerald-800",
-  warning: "bg-amber-50 border-amber-300 text-amber-800",
-  error: "bg-red-50 border-red-300 text-red-800",
-  info: "bg-sky-50 border-sky-300 text-sky-800",
+  success: "bg-emerald-500/15 border-emerald-400/50 text-emerald-200",
+  warning: "bg-amber-500/15 border-amber-400/50 text-amber-200",
+  error: "bg-red-500/15 border-red-400/50 text-red-200",
+  info: "bg-sky-500/15 border-sky-400/50 text-sky-200",
 };
 
 export function Notice({ variant, children, className = "" }: NoticeProps) {
diff --git a/components/ui/StepIndicator.tsx b/components/ui/StepIndicator.tsx
index be4101b..32cd04c 100644
--- a/components/ui/StepIndicator.tsx
+++ b/components/ui/StepIndicator.tsx
@@ -21,12 +21,10 @@ export function StepIndicator({
         const canNavigate = Boolean(onStepClick) && (canNavigateToStep?.(i) ?? true);
         const circleClass = [
           "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors",
-          canNavigate ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2" : "",
-          done
-            ? "bg-brand-gold border-brand-gold text-white"
-            : active
-            ? "bg-brand-gold border-brand-gold text-white"
-            : "bg-white border-slate-300 text-slate-400",
+          canNavigate ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink" : "",
+          done || active
+            ? "bg-brand-gold border-brand-gold-light text-ink"
+            : "bg-black/25 border-white/20 text-cream/50",
         ].join(" ");
 
         const circleContent = done ? (
@@ -58,7 +56,7 @@ export function StepIndicator({
               <span
                 className={[
                   "text-xs font-medium whitespace-nowrap",
-                  active ? "text-brand-gold" : done ? "text-slate-600" : "text-slate-400",
+                  active ? "text-brand-gold-light" : done ? "text-cream/70" : "text-cream/40",
                 ].join(" ")}
               >
                 {step.label}
@@ -68,7 +66,7 @@ export function StepIndicator({
               <div
                 className={[
                   "flex-1 h-0.5 mt-[-14px] mx-1",
-                  done ? "bg-brand-gold" : "bg-slate-200",
+                  done ? "bg-brand-gold" : "bg-white/15",
                 ].join(" ")}
               />
             )}
diff --git a/components/ui/formStyles.ts b/components/ui/formStyles.ts
index 0f91523..c89bb41 100644
--- a/components/ui/formStyles.ts
+++ b/components/ui/formStyles.ts
@@ -1,12 +1,12 @@
 export const inputClass =
-  "w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 transition-colors";
+  "w-full bg-black/30 border border-white/15 rounded-xl px-4 py-2.5 text-cream text-sm placeholder:text-cream/40 focus:outline-none focus:border-brand-gold-light focus:ring-2 focus:ring-brand-gold/20 transition-colors";
 
 export const textareaClass =
-  "w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 transition-colors min-h-[200px] resize-y";
+  "w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-cream text-sm placeholder:text-cream/40 focus:outline-none focus:border-brand-gold-light focus:ring-2 focus:ring-brand-gold/20 transition-colors min-h-[200px] resize-y";
 
 export const selectClass =
-  "w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 transition-colors appearance-none";
+  "w-full bg-black/30 border border-white/15 rounded-xl px-4 py-2.5 text-cream text-sm focus:outline-none focus:border-brand-gold-light focus:ring-2 focus:ring-brand-gold/20 transition-colors appearance-none";
 
-export const labelClass = "block text-sm font-semibold text-slate-600 mb-1.5";
+export const labelClass = "block text-xs font-bold uppercase tracking-wide text-cream/65 mb-1.5";
 
-export const helpClass = "text-xs text-slate-500 mt-1";
+export const helpClass = "text-xs text-cream/45 mt-1";
diff --git a/eslint.config.mjs b/eslint.config.mjs
index 6c61202..b94c821 100644
--- a/eslint.config.mjs
+++ b/eslint.config.mjs
@@ -2,6 +2,8 @@ import nextVitals from "eslint-config-next/core-web-vitals";
 import nextTypeScript from "eslint-config-next/typescript";
 
 const config = [
+  // Vendored design prototypes + local caches are reference material, not source.
+  { ignores: ["docs/**", "node-compile-cache/**"] },
   ...nextVitals,
   ...nextTypeScript,
   {
@@ -13,6 +15,7 @@ const config = [
           argsIgnorePattern: "^_",
           varsIgnorePattern: "^_",
           caughtErrorsIgnorePattern: "^_",
+          ignoreRestSiblings: true,
         },
       ],
       "import/no-anonymous-default-export": "off",
diff --git a/lib/brands/brandRepo.ts b/lib/brands/brandRepo.ts
index 1d3bab8..8bc5b28 100644
--- a/lib/brands/brandRepo.ts
+++ b/lib/brands/brandRepo.ts
@@ -13,6 +13,9 @@ type BrandRow = {
   color_accent: string;
   color_accent_light: string;
   font_family: string | null;
+  font_display: string | null;
+  font_body: string | null;
+  event_logo_url: string | null;
   break_message: string | null;
   end_message: string | null;
   website_url: string | null;
@@ -37,6 +40,9 @@ function rowToBrand(row: BrandRow): Brand {
     color_accent: row.color_accent,
     color_accent_light: row.color_accent_light,
     font_family: row.font_family,
+    font_display: row.font_display,
+    font_body: row.font_body,
+    event_logo_url: row.event_logo_url,
     break_message: row.break_message,
     end_message: row.end_message,
     website_url: row.website_url,
@@ -109,6 +115,9 @@ function brandToBrandConfig(brand: Brand): BrandConfig {
     color_accent: brand.color_accent,
     color_accent_light: brand.color_accent_light,
     font_family: brand.font_family,
+    font_display: brand.font_display,
+    font_body: brand.font_body,
+    event_logo_url: brand.event_logo_url,
     break_message: brand.break_message,
     end_message: brand.end_message,
     website_url: brand.website_url,
@@ -141,6 +150,9 @@ type CreateBrandInput = {
   color_accent: string;
   color_accent_light: string;
   font_family?: string | null;
+  font_display?: string | null;
+  font_body?: string | null;
+  event_logo_url?: string | null;
   break_message?: string | null;
   end_message?: string | null;
   website_url?: string | null;
diff --git a/lib/brands/brandStorage.ts b/lib/brands/brandStorage.ts
index 19cc029..dafda49 100644
--- a/lib/brands/brandStorage.ts
+++ b/lib/brands/brandStorage.ts
@@ -5,7 +5,7 @@ const BUCKET_NAME = "brand-assets";
 const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
 const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
 
-type LogoSlot = "logo-dark" | "logo-light";
+export type LogoSlot = "logo-dark" | "logo-light" | "event-logo";
 
 /** Upload a logo to Supabase Storage and return the object key. */
 export async function uploadBrandLogo(
diff --git a/lib/brands/fonts.test.ts b/lib/brands/fonts.test.ts
new file mode 100644
index 0000000..7642deb
--- /dev/null
+++ b/lib/brands/fonts.test.ts
@@ -0,0 +1,70 @@
+import { describe, it, expect } from "vitest";
+import {
+  SUPPORTED_BRAND_FONTS,
+  DEFAULT_DISPLAY_FONT,
+  DEFAULT_BODY_FONT,
+  resolveSupportedFont,
+  resolveBrandFonts,
+  fontFamilyCss,
+  buildGoogleFontHref,
+} from "@/lib/brands/fonts";
+
+describe("resolveSupportedFont", () => {
+  it("returns the font when supported", () => {
+    expect(resolveSupportedFont("Oswald", "Anton")).toBe("Oswald");
+  });
+  it("falls back when the font is unknown", () => {
+    expect(resolveSupportedFont("Comic Sans", "Anton")).toBe("Anton");
+  });
+  it("falls back when null/empty", () => {
+    expect(resolveSupportedFont(null, "Archivo")).toBe("Archivo");
+    expect(resolveSupportedFont("", "Archivo")).toBe("Archivo");
+  });
+});
+
+describe("resolveBrandFonts", () => {
+  it("uses defaults when nothing set", () => {
+    expect(resolveBrandFonts({ font_display: null, font_body: null, font_family: null }))
+      .toEqual({ display: DEFAULT_DISPLAY_FONT, body: DEFAULT_BODY_FONT });
+  });
+  it("falls back body to legacy font_family", () => {
+    expect(resolveBrandFonts({ font_display: null, font_body: null, font_family: "Poppins" }).body)
+      .toBe("Poppins");
+  });
+  it("ignores unsupported values", () => {
+    expect(resolveBrandFonts({ font_display: "Wingdings", font_body: "Oswald", font_family: null }))
+      .toEqual({ display: DEFAULT_DISPLAY_FONT, body: "Oswald" });
+  });
+});
+
+describe("fontFamilyCss", () => {
+  it("uses the next/font variable for built-in defaults", () => {
+    expect(fontFamilyCss("Anton")).toContain("var(--font-anton)");
+    expect(fontFamilyCss("Archivo")).toContain("var(--font-archivo)");
+  });
+  it("quotes other supported families", () => {
+    expect(fontFamilyCss("Oswald")).toContain("'Oswald'");
+  });
+});
+
+describe("buildGoogleFontHref", () => {
+  it("returns null for next/font-managed defaults", () => {
+    expect(buildGoogleFontHref("Anton")).toBeNull();
+    expect(buildGoogleFontHref("Archivo")).toBeNull();
+  });
+  it("returns null for unsupported families (no arbitrary injection)", () => {
+    expect(buildGoogleFontHref("Comic Sans")).toBeNull();
+  });
+  it("builds a css2 URL for supported web fonts", () => {
+    const href = buildGoogleFontHref("Oswald");
+    expect(href).toContain("https://fonts.googleapis.com/css2?family=Oswald");
+    expect(href).toContain("wght@");
+  });
+});
+
+describe("SUPPORTED_BRAND_FONTS", () => {
+  it("includes the defaults", () => {
+    expect(SUPPORTED_BRAND_FONTS).toHaveProperty("Anton");
+    expect(SUPPORTED_BRAND_FONTS).toHaveProperty("Archivo");
+  });
+});
diff --git a/lib/brands/fonts.ts b/lib/brands/fonts.ts
new file mode 100644
index 0000000..cd6c766
--- /dev/null
+++ b/lib/brands/fonts.ts
@@ -0,0 +1,59 @@
+/**
+ * Allowlist of brand-selectable fonts. Brand `font_display`/`font_body` values
+ * MUST resolve through this registry before any dynamic Google Fonts link is
+ * created — never interpolate arbitrary DB strings into stylesheet URLs (spec A9/§14).
+ *
+ * `nextFontVar` marks families already loaded by next/font in app/layout.tsx;
+ * those are referenced via their CSS variable and never re-loaded from Google.
+ */
+export type SupportedFont = {
+  weights: string; // css2 `wght@` list
+  category: "display" | "body" | "both";
+  nextFontVar?: string; // set for next/font-managed defaults
+  genericFallback: string;
+};
+
+export const SUPPORTED_BRAND_FONTS: Record<string, SupportedFont> = {
+  Anton: { weights: "400", category: "display", nextFontVar: "--font-anton", genericFallback: "Impact, sans-serif" },
+  Archivo: { weights: "400;500;600;700;800", category: "both", nextFontVar: "--font-archivo", genericFallback: "ui-sans-serif, system-ui, sans-serif" },
+  Inter: { weights: "400;600;700;900", category: "body", nextFontVar: "--font-inter", genericFallback: "ui-sans-serif, system-ui, sans-serif" },
+  Oswald: { weights: "400;500;600;700", category: "display", genericFallback: "Impact, sans-serif" },
+  "Bebas Neue": { weights: "400", category: "display", genericFallback: "Impact, sans-serif" },
+  "Playfair Display": { weights: "400;600;700;800", category: "display", genericFallback: "Georgia, serif" },
+  Poppins: { weights: "400;500;600;700", category: "body", genericFallback: "ui-sans-serif, system-ui, sans-serif" },
+  Montserrat: { weights: "400;500;600;700", category: "body", genericFallback: "ui-sans-serif, system-ui, sans-serif" },
+};
+
+export const DEFAULT_DISPLAY_FONT = "Anton";
+export const DEFAULT_BODY_FONT = "Archivo";
+
+export function resolveSupportedFont(name: string | null | undefined, fallback: string): string {
+  if (name && Object.prototype.hasOwnProperty.call(SUPPORTED_BRAND_FONTS, name)) return name;
+  return fallback;
+}
+
+export function resolveBrandFonts(input: {
+  font_display?: string | null;
+  font_body?: string | null;
+  font_family?: string | null;
+}): { display: string; body: string } {
+  return {
+    display: resolveSupportedFont(input.font_display, DEFAULT_DISPLAY_FONT),
+    body: resolveSupportedFont(input.font_body ?? input.font_family ?? null, DEFAULT_BODY_FONT),
+  };
+}
+
+/** CSS `font-family` value for a supported family (uses the next/font variable when available). */
+export function fontFamilyCss(family: string): string {
+  const font = SUPPORTED_BRAND_FONTS[family];
+  if (!font) return `var(--font-archivo), ui-sans-serif, system-ui, sans-serif`;
+  if (font.nextFontVar) return `var(${font.nextFontVar}), ${font.genericFallback}`;
+  return `'${family}', ${font.genericFallback}`;
+}
+
+/** Google Fonts css2 URL for families NOT managed by next/font; null otherwise. */
+export function buildGoogleFontHref(family: string): string | null {
+  const font = SUPPORTED_BRAND_FONTS[family];
+  if (!font || font.nextFontVar) return null;
+  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${font.weights}&display=swap`;
+}
diff --git a/lib/brands/types.test.ts b/lib/brands/types.test.ts
new file mode 100644
index 0000000..3e14941
--- /dev/null
+++ b/lib/brands/types.test.ts
@@ -0,0 +1,48 @@
+import { describe, it, expect } from "vitest";
+import { brandSchema, brandInputSchema } from "@/lib/brands/types";
+
+const base = {
+  id: "11111111-1111-4111-8111-111111111111",
+  name: "The Anchor",
+  is_default: true,
+  logo_dark_url: "anchor/logo-dark.png",
+  logo_light_url: "anchor/logo-light.png",
+  color_primary: "#003F27",
+  color_primary_light: "#0F6846",
+  color_accent: "#A57626",
+  color_accent_light: "#C4952F",
+  font_family: null,
+  font_display: "Anton",
+  font_body: "Archivo",
+  event_logo_url: "anchor/event-logo.png",
+  break_message: null,
+  end_message: null,
+  website_url: null,
+  qr_items: null,
+  event_feed_type: "none",
+  event_feed_base_url: null,
+  event_feed_venue_id: null,
+  event_feed_has_key: false,
+  created_at: "2026-05-29T00:00:00.000Z",
+  updated_at: "2026-05-29T00:00:00.000Z",
+};
+
+describe("brandSchema with font + event-logo fields", () => {
+  it("parses a brand carrying the new fields", () => {
+    const parsed = brandSchema.parse(base);
+    expect(parsed.font_display).toBe("Anton");
+    expect(parsed.font_body).toBe("Archivo");
+    expect(parsed.event_logo_url).toBe("anchor/event-logo.png");
+  });
+  it("accepts null/empty for the new fields", () => {
+    const parsed = brandSchema.parse({ ...base, font_display: null, font_body: null, event_logo_url: "" });
+    expect(parsed.font_display).toBeNull();
+    expect(parsed.event_logo_url).toBe("");
+  });
+  it("brandInputSchema omits server-managed fields but keeps the new ones", () => {
+    const { id, created_at, updated_at, event_feed_has_key, ...input } = base;
+    const parsed = brandInputSchema.parse(input);
+    expect(parsed.font_display).toBe("Anton");
+    expect(parsed.event_logo_url).toBe("anchor/event-logo.png");
+  });
+});
diff --git a/lib/brands/types.ts b/lib/brands/types.ts
index 9a029ce..e7712ce 100644
--- a/lib/brands/types.ts
+++ b/lib/brands/types.ts
@@ -24,6 +24,9 @@ export const brandSchema = z.object({
   color_accent: HEX_COLOUR,
   color_accent_light: HEX_COLOUR,
   font_family: z.string().max(100).nullable(),
+  font_display: z.string().max(100).nullable().optional(),
+  font_body: z.string().max(100).nullable().optional(),
+  event_logo_url: z.string().max(300).nullable().or(z.literal("")).optional(),
   break_message: z.string().max(500).nullable(),
   end_message: z.string().max(500).nullable(),
   website_url: z.string().max(200).nullable().or(z.literal("")),
@@ -50,6 +53,9 @@ export type BrandConfig = Pick<
   | "color_accent"
   | "color_accent_light"
   | "font_family"
+  | "font_display"
+  | "font_body"
+  | "event_logo_url"
   | "break_message"
   | "end_message"
   | "website_url"
diff --git a/lib/eventFeed/baronshubAdapter.test.ts b/lib/eventFeed/baronshubAdapter.test.ts
index 42cbc00..5912de9 100644
--- a/lib/eventFeed/baronshubAdapter.test.ts
+++ b/lib/eventFeed/baronshubAdapter.test.ts
@@ -1,63 +1,57 @@
-import assert from "node:assert/strict";
-import test from "node:test";
+import { test, expect } from "vitest";
 
 import { resolveBaronsHubEventUrl } from "./baronshubAdapter.ts";
 
 const apiBaseUrl = "https://baronshub.orangejelly.co.uk/api/v1/events";
 
 test("resolveBaronsHubEventUrl prefers HTTPS booking URLs from the API", () => {
-  assert.equal(
+  expect(
     resolveBaronsHubEventUrl({
       bookingUrl: "https://tickets.example.com/event",
       bookingPageUrl: "https://l.baronspubs.com/local-event",
       seoSlug: "local-event",
       apiBaseUrl,
-    }),
-    "https://tickets.example.com/event"
-  );
+    })
+  ).toBe("https://tickets.example.com/event");
 });
 
 test("resolveBaronsHubEventUrl accepts HTTP booking URLs from the API", () => {
-  assert.equal(
+  expect(
     resolveBaronsHubEventUrl({
       bookingUrl: "http://buytickets.at/meadehallatthecrowncushion/1986164",
       seoSlug: "unforgettable-live-music-experience-2026-08-06",
       apiBaseUrl,
-    }),
-    "http://buytickets.at/meadehallatthecrowncushion/1986164"
-  );
+    })
+  ).toBe("http://buytickets.at/meadehallatthecrowncushion/1986164");
 });
 
 test("resolveBaronsHubEventUrl uses the API booking page URL when no HTTPS booking URL exists", () => {
-  assert.equal(
+  expect(
     resolveBaronsHubEventUrl({
       bookingUrl: null,
       bookingPageUrl: "https://l.baronspubs.com/local-event",
       seoSlug: "local-event",
       apiBaseUrl,
-    }),
-    "https://l.baronspubs.com/local-event"
-  );
+    })
+  ).toBe("https://l.baronspubs.com/local-event");
 });
 
 test("resolveBaronsHubEventUrl falls back to the BaronsHub landing page for current API responses", () => {
-  assert.equal(
+  expect(
     resolveBaronsHubEventUrl({
       bookingUrl: null,
       seoSlug: "summer-party-with-dj-darren-2026-07-05",
       apiBaseUrl,
-    }),
-    "https://baronshub.orangejelly.co.uk/l/summer-party-with-dj-darren-2026-07-05"
-  );
+    })
+  ).toBe("https://baronshub.orangejelly.co.uk/l/summer-party-with-dj-darren-2026-07-05");
 });
 
 test("resolveBaronsHubEventUrl does not turn rejected booking URLs into guessed landing pages", () => {
-  assert.equal(
+  expect(
     resolveBaronsHubEventUrl({
       bookingUrl: "mailto:events@example.com",
       seoSlug: "unforgettable-live-music-experience-2026-08-06",
       apiBaseUrl,
-    }),
-    null
-  );
+    })
+  ).toBeNull();
 });
diff --git a/lib/live/reveal.test.ts b/lib/live/reveal.test.ts
index 81d5c5c..498fd8f 100644
--- a/lib/live/reveal.test.ts
+++ b/lib/live/reveal.test.ts
@@ -1,5 +1,4 @@
-import assert from "node:assert/strict";
-import test from "node:test";
+import { test, expect } from "vitest";
 
 import {
   computeRevealState,
@@ -10,47 +9,47 @@ import {
 import { getRevealConfigWithExtension, makeRevealConfigForSongPlayMs } from "@/lib/live/types";
 
 test("getRevealPhase follows relative 45s default thresholds", () => {
-  assert.equal(getRevealPhase(0), "hidden");
-  assert.equal(getRevealPhase(11_249), "hidden");
-  assert.equal(getRevealPhase(11_250), "album");
-  assert.equal(getRevealPhase(22_499), "album");
-  assert.equal(getRevealPhase(22_500), "title");
-  assert.equal(getRevealPhase(29_999), "title");
-  assert.equal(getRevealPhase(30_000), "artist");
-  assert.equal(getRevealPhase(44_999), "artist");
-  assert.equal(getRevealPhase(45_000), "advance");
+  expect(getRevealPhase(0)).toBe("hidden");
+  expect(getRevealPhase(11_249)).toBe("hidden");
+  expect(getRevealPhase(11_250)).toBe("album");
+  expect(getRevealPhase(22_499)).toBe("album");
+  expect(getRevealPhase(22_500)).toBe("title");
+  expect(getRevealPhase(29_999)).toBe("title");
+  expect(getRevealPhase(30_000)).toBe("artist");
+  expect(getRevealPhase(44_999)).toBe("artist");
+  expect(getRevealPhase(45_000)).toBe("advance");
 });
 
 test("computeRevealState maps phases to reveal booleans", () => {
-  assert.deepEqual(computeRevealState(0), {
+  expect(computeRevealState(0)).toEqual({
     showAlbum: false,
     showTitle: false,
     showArtist: false,
     shouldAdvance: false,
   });
 
-  assert.deepEqual(computeRevealState(11_250), {
+  expect(computeRevealState(11_250)).toEqual({
     showAlbum: true,
     showTitle: false,
     showArtist: false,
     shouldAdvance: false,
   });
 
-  assert.deepEqual(computeRevealState(22_500), {
+  expect(computeRevealState(22_500)).toEqual({
     showAlbum: true,
     showTitle: true,
     showArtist: false,
     shouldAdvance: false,
   });
 
-  assert.deepEqual(computeRevealState(30_000), {
+  expect(computeRevealState(30_000)).toEqual({
     showAlbum: true,
     showTitle: true,
     showArtist: true,
     shouldAdvance: false,
   });
 
-  assert.deepEqual(computeRevealState(45_000), {
+  expect(computeRevealState(45_000)).toEqual({
     showAlbum: true,
     showTitle: true,
     showArtist: true,
@@ -59,13 +58,13 @@ test("computeRevealState maps phases to reveal booleans", () => {
 });
 
 test("makeRevealConfigForSongPlayMs scales milestones with song play time", () => {
-  assert.deepEqual(makeRevealConfigForSongPlayMs(60_000), {
+  expect(makeRevealConfigForSongPlayMs(60_000)).toEqual({
     albumMs: 15_000,
     titleMs: 30_000,
     artistMs: 40_000,
     nextMs: 60_000,
   });
-  assert.deepEqual(makeRevealConfigForSongPlayMs(45_000), {
+  expect(makeRevealConfigForSongPlayMs(45_000)).toEqual({
     albumMs: 11_250,
     titleMs: 22_500,
     artistMs: 30_000,
@@ -76,39 +75,37 @@ test("makeRevealConfigForSongPlayMs scales milestones with song play time", () =
 test("getRevealConfigWithExtension preserves relative timing after skip or extension", () => {
   const cfg = makeRevealConfigForSongPlayMs(45_000);
   const extended = getRevealConfigWithExtension(cfg, 30_000);
-  assert.deepEqual(extended, {
+  expect(extended).toEqual({
     albumMs: 18_750,
     titleMs: 37_500,
     artistMs: 50_000,
     nextMs: 75_000,
   });
-  assert.equal(getRevealPhase(30_000, extended), "album");
-  assert.equal(getRevealPhase(75_000, extended), "advance");
+  expect(getRevealPhase(30_000, extended)).toBe("album");
+  expect(getRevealPhase(75_000, extended)).toBe("advance");
 });
 
 test("shouldTriggerNextForTrack fires once per track", () => {
   const reveal = computeRevealState(45_000);
-  assert.equal(
+  expect(
     shouldTriggerNextForTrack({
       trackId: "abc",
       revealState: reveal,
       advanceTriggeredForTrackId: null,
-    }),
-    true
-  );
+    })
+  ).toBe(true);
 
-  assert.equal(
+  expect(
     shouldTriggerNextForTrack({
       trackId: "abc",
       revealState: reveal,
       advanceTriggeredForTrackId: "abc",
-    }),
-    false
-  );
+    })
+  ).toBe(false);
 });
 
 test("updateAdvanceTrackMarker clears marker when track changes", () => {
-  assert.equal(updateAdvanceTrackMarker({ trackId: "abc", advanceTriggeredForTrackId: "abc" }), "abc");
-  assert.equal(updateAdvanceTrackMarker({ trackId: "xyz", advanceTriggeredForTrackId: "abc" }), null);
-  assert.equal(updateAdvanceTrackMarker({ trackId: null, advanceTriggeredForTrackId: "abc" }), null);
+  expect(updateAdvanceTrackMarker({ trackId: "abc", advanceTriggeredForTrackId: "abc" })).toBe("abc");
+  expect(updateAdvanceTrackMarker({ trackId: "xyz", advanceTriggeredForTrackId: "abc" })).toBeNull();
+  expect(updateAdvanceTrackMarker({ trackId: null, advanceTriggeredForTrackId: "abc" })).toBeNull();
 });
diff --git a/lib/live/storage.test.ts b/lib/live/storage.test.ts
index e4aa2c0..9ea74f1 100644
--- a/lib/live/storage.test.ts
+++ b/lib/live/storage.test.ts
@@ -1,5 +1,4 @@
-import assert from "node:assert/strict";
-import test from "node:test";
+import { test, expect } from "vitest";
 
 import {
   isControlLockStale,
@@ -53,9 +52,9 @@ function makeValidSession(): LiveSessionV1 {
 test("validateLiveSession accepts valid v1 payload", () => {
   const session = makeValidSession();
   const validated = validateLiveSession(session);
-  assert.ok(validated);
-  assert.equal(validated?.id, session.id);
-  assert.equal(validated?.games.length, 2);
+  expect(validated).toBeTruthy();
+  expect(validated?.id).toBe(session.id);
+  expect(validated?.games.length).toBe(2);
 });
 
 test("validateLiveSession rejects wrong schema", () => {
@@ -69,20 +68,20 @@ test("validateLiveSession rejects wrong schema", () => {
     revealConfig: DEFAULT_REVEAL_CONFIG,
     games: [{ gameNumber: 1 }],
   };
-  assert.equal(validateLiveSession(bad), null);
+  expect(validateLiveSession(bad)).toBeNull();
 });
 
 test("storage helpers are safe when localStorage is unavailable", () => {
-  assert.deepEqual(listLiveSessions(), []);
+  expect(listLiveSessions()).toEqual([]);
 });
 
 test("empty runtime starts at timestamp zero so fetched host state can win first load", () => {
   const runtime = makeEmptyRuntimeState("session-123");
-  assert.equal(runtime.updatedAtMs, 0);
+  expect(runtime.updatedAtMs).toBe(0);
 });
 
 test("isControlLockStale uses timeout window", () => {
   const now = 1_000_000;
-  assert.equal(isControlLockStale({ tabId: "abc", lastSeenMs: now - 31_000 }, now, 30_000), true);
-  assert.equal(isControlLockStale({ tabId: "abc", lastSeenMs: now - 29_000 }, now, 30_000), false);
+  expect(isControlLockStale({ tabId: "abc", lastSeenMs: now - 31_000 }, now, 30_000)).toBe(true);
+  expect(isControlLockStale({ tabId: "abc", lastSeenMs: now - 29_000 }, now, 30_000)).toBe(false);
 });
diff --git a/package.json b/package.json
index 94cd599..e7d89b2 100644
--- a/package.json
+++ b/package.json
@@ -13,7 +13,8 @@
     "typecheck": "tsc --noEmit",
     "test:e2e": "node scripts/e2e-flows.mjs",
     "test:py": "python3 -m pytest -q",
-    "verify": "npm run lint && npm run typecheck && npm run test:py && npm run test:e2e && npm run build"
+    "test:unit": "vitest run",
+    "verify": "npm run lint && npm run typecheck && npm run test:unit && npm run test:py && npm run test:e2e && npm run build"
   },
   "dependencies": {
     "@supabase/supabase-js": "^2.97.0",
@@ -42,6 +43,7 @@
     "postcss": "^8.5.6",
     "tailwindcss": "^3.4.19",
     "typescript": "^5.5.4",
-    "typescript-eslint": "^8.56.0"
+    "typescript-eslint": "^8.56.0",
+    "vitest": "^2.1.9"
   }
 }
diff --git a/supabase/migrations/20260529120000_add_brand_fonts_and_event_logo.sql b/supabase/migrations/20260529120000_add_brand_fonts_and_event_logo.sql
new file mode 100644
index 0000000..10bc5fb
--- /dev/null
+++ b/supabase/migrations/20260529120000_add_brand_fonts_and_event_logo.sql
@@ -0,0 +1,11 @@
+-- After Hours redesign: split display/body fonts + add a gold event logo.
+-- Additive only; font_family is retained as a deprecated alias of font_body.
+ALTER TABLE brands
+  ADD COLUMN IF NOT EXISTS font_display text,     -- e.g. "Anton"   (nullable; default resolved in app)
+  ADD COLUMN IF NOT EXISTS font_body text,        -- e.g. "Archivo" (nullable; default resolved in app)
+  ADD COLUMN IF NOT EXISTS event_logo_url text;   -- brand-assets Storage object key for the gold event logo
+
+-- Backfill: existing single font becomes the body font.
+UPDATE brands
+  SET font_body = font_family
+  WHERE font_body IS NULL AND font_family IS NOT NULL;
diff --git a/tailwind.config.ts b/tailwind.config.ts
index 554cd86..42cb0c2 100644
--- a/tailwind.config.ts
+++ b/tailwind.config.ts
@@ -12,9 +12,16 @@ const config: Config = {
         "brand-green-light": "rgb(var(--brand-primary-light-rgb) / <alpha-value>)",
         "brand-gold": "rgb(var(--brand-accent-rgb) / <alpha-value>)",
         "brand-gold-light": "rgb(var(--brand-accent-light-rgb) / <alpha-value>)",
+        "brand-primary": "rgb(var(--brand-primary-rgb) / <alpha-value>)",
+        "brand-accent": "rgb(var(--brand-accent-rgb) / <alpha-value>)",
+        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
+        cream: "rgb(var(--cream-rgb) / <alpha-value>)",
+        "cream-dim": "#cdbfa0",
       },
       fontFamily: {
-        sans: ["var(--brand-font, 'Inter')", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
+        sans: ["var(--brand-body)", "ui-sans-serif", "system-ui", "sans-serif"],
+        body: ["var(--brand-body)", "ui-sans-serif", "system-ui", "sans-serif"],
+        display: ["var(--brand-display)", "Impact", "sans-serif"],
       },
     },
   },
diff --git a/vitest.config.ts b/vitest.config.ts
new file mode 100644
index 0000000..1dab7f1
--- /dev/null
+++ b/vitest.config.ts
@@ -0,0 +1,15 @@
+import { defineConfig } from "vitest/config";
+import path from "node:path";
+import { fileURLToPath } from "node:url";
+
+const root = path.dirname(fileURLToPath(import.meta.url));
+
+export default defineConfig({
+  test: {
+    environment: "node",
+    include: ["lib/**/*.test.ts", "components/**/*.test.ts"],
+  },
+  resolve: {
+    alias: { "@": root },
+  },
+});
```

## Changed File Contents

### `app/globals.css`

```
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* brand (overridden per-venue by BrandProvider) */
  --brand-primary: #003F27;        --brand-primary-rgb: 0 63 39;
  --brand-primary-light: #0F6846;  --brand-primary-light-rgb: 15 104 70;
  --brand-accent: #A57626;         --brand-accent-rgb: 165 118 38;
  --brand-accent-light: #C4952F;   --brand-accent-light-rgb: 196 149 47;

  /* fonts (next/font vars are set on <html> in layout.tsx) */
  --brand-display: var(--font-anton), Impact, sans-serif;
  --brand-body: var(--font-archivo), ui-sans-serif, system-ui, sans-serif;

  /* derived */
  --ink: #04130C;   --ink-rgb: 4 19 12;
  --cream: #F6EFDD; --cream-rgb: 246 239 221; --cream-dim: #cdbfa0;
}

/* ===== type helpers ===== */
.kicker {
  font-family: var(--brand-body), sans-serif; font-weight: 700; text-transform: uppercase;
  letter-spacing: .42em; color: var(--brand-accent-light);
  display: inline-flex; align-items: center; gap: 22px; white-space: nowrap;
}
.kicker::before, .kicker::after { content: ""; width: 54px; height: 2px;
  background: linear-gradient(90deg, transparent, var(--brand-accent-light)); }
.kicker--plain::before, .kicker--plain::after { display: none; }
.display {
  font-family: var(--brand-display), Impact, sans-serif; font-weight: 400;
  text-transform: uppercase; line-height: .9; letter-spacing: .005em; margin: 0; color: var(--cream);
}
.display--gold {
  background: linear-gradient(180deg, #fff6dd 0%, var(--brand-accent-light) 42%, var(--brand-accent) 100%);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  white-space: nowrap; padding: 0 0.12em;
}
.display--gold > div, .display--gold > span { white-space: nowrap; }
.lede { line-height: 1.35; font-weight: 500; color: rgb(var(--cream-rgb) / .86); margin: 0; text-wrap: pretty; }
.pill {
  display: inline-flex; align-items: center; gap: 14px; padding: 14px 30px; border-radius: 999px;
  border: 2px solid rgb(var(--brand-accent-light-rgb) / .7); background: rgb(var(--brand-accent-rgb) / .14);
  color: var(--brand-accent-light); font-weight: 700; text-transform: uppercase; letter-spacing: .14em;
  backdrop-filter: blur(4px);
}
.rule { height: 3px; border: 0; width: 100%;
  background: linear-gradient(90deg, transparent, var(--brand-accent), transparent); }

/* ===== screen backgrounds ===== */
.screen {
  position: absolute; inset: 0; display: flex; flex-direction: column; color: var(--cream); overflow: hidden;
  background:
    radial-gradient(130% 100% at 50% -20%, rgb(var(--brand-primary-light-rgb) / .55) 0%, transparent 55%),
    radial-gradient(80% 70% at 50% 120%, rgb(var(--brand-accent-rgb) / .18) 0%, transparent 60%),
    linear-gradient(180deg, var(--brand-primary) 0%, var(--ink) 100%);
}
.screen--warm {
  background:
    radial-gradient(130% 100% at 50% -10%, rgb(var(--brand-accent-light-rgb) / .6) 0%, transparent 55%),
    linear-gradient(180deg, var(--brand-accent) 0%, var(--ink) 100%);
}
.grain::after {
  content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 40; opacity: .05; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
.vignette::before { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 35;
  box-shadow: inset 0 0 240px 60px rgba(0,0,0,.55); }

/* ===== disco motifs (all CSS) ===== */
.sunburst {
  position: absolute; border-radius: 50%; opacity: .5; animation: spin 80s linear infinite;
  background: repeating-conic-gradient(from 0deg, rgb(var(--brand-accent-rgb) / .38) 0deg 6deg, transparent 6deg 12deg);
  -webkit-mask: radial-gradient(closest-side, transparent 12%, #000 16%, #000 100%);
          mask: radial-gradient(closest-side, transparent 12%, #000 16%, #000 100%);
}
@keyframes spin { to { transform: rotate(360deg); } }
.vinyl {
  position: relative; border-radius: 50%; display: grid; place-items: center; animation: spin 6s linear infinite;
  background: radial-gradient(circle at 50% 50%, #1b1b1b 0 17%, transparent 17.4%),
    repeating-radial-gradient(circle at 50% 50%, #0c0c0c 0 2px, #161616 2px 4px), #0a0a0a;
  box-shadow: 0 30px 80px rgba(0,0,0,.6), inset 0 0 0 2px rgba(255,255,255,.04);
}
.vinyl__label { width: 34%; height: 34%; border-radius: 50%; display: grid; place-items: center;
  background: radial-gradient(circle, var(--brand-accent-light), var(--brand-accent));
  box-shadow: inset 0 0 0 4px rgba(0,0,0,.25); }
.vinyl__hole { width: 7%; height: 7%; border-radius: 50%; background: var(--ink); box-shadow: 0 0 0 6px rgba(0,0,0,.25); }
.eq { display: flex; align-items: flex-end; gap: 7px; height: 60px; }
.eq i { width: 10px; border-radius: 4px 4px 0 0;
  background: linear-gradient(180deg, var(--brand-accent-light), var(--brand-accent));
  animation: eq 900ms ease-in-out infinite alternate; }
@keyframes eq { from { height: 18%; } to { height: 100%; } }
.ball {
  border-radius: 50%; display: grid; place-items: center; font-family: var(--brand-display), sans-serif;
  color: var(--ink); position: relative;
  background: radial-gradient(circle at 35% 28%, #fff 0%, var(--brand-accent-light) 30%, var(--brand-accent) 78%);
  box-shadow: inset 0 -10px 22px rgba(0,0,0,.25), 0 14px 30px rgba(0,0,0,.4);
}
.ball::after { content:""; position:absolute; inset: 14%; border-radius:50%; border: 3px solid rgba(255,255,255,.5); }
.chrome {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 30; display: flex; align-items: center;
  justify-content: space-between; padding: 22px 56px; letter-spacing: .18em; text-transform: uppercase;
  color: rgb(var(--cream-rgb) / .6);
}
.chrome .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--brand-accent-light);
  box-shadow: 0 0 14px var(--brand-accent-light); display: inline-block; margin-right: 12px;
  animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .35; } }

/* ===== entrance animations ===== */
@keyframes rise { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: none; } }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes pop  { from { opacity: 0; transform: scale(.8); } to { opacity: 1; transform: none; } }
@keyframes slideL { from { opacity:0; transform: translateX(-60px);} to {opacity:1; transform:none;} }
.an-rise { animation: rise .8s cubic-bezier(.2,.8,.2,1) backwards; }
.an-fade { animation: fade 1s ease backwards; }
.an-pop  { animation: pop .7s cubic-bezier(.2,1.2,.3,1) backwards; }
.an-slideL { animation: slideL .7s cubic-bezier(.2,.8,.2,1) backwards; }
.d1{ animation-delay:.08s;} .d2{ animation-delay:.18s;} .d3{ animation-delay:.30s;}
.d4{ animation-delay:.42s;} .d5{ animation-delay:.56s;} .d6{ animation-delay:.7s;}

/* ===== host-side click-to-edit (enabled only inside the host preview) ===== */
[data-edit] { outline: none; border-radius: 6px; transition: box-shadow .15s, background .15s; }
.editing [data-edit] { box-shadow: 0 0 0 2px rgb(var(--brand-accent-light-rgb) / .7); background: rgba(0,0,0,.18); cursor: text; }
.editing [data-edit]:hover { box-shadow: 0 0 0 2px var(--brand-accent-light); }
.editing [data-edit]:focus { box-shadow: 0 0 0 3px var(--brand-accent-light); background: rgba(0,0,0,.3); }
[data-edit]:empty::before { content: attr(data-placeholder); opacity: .4; }

/* ===== LEGACY (retained until Phase 2 rebuilds the guest page) ===== */
.guest-projection-shell {
  background:
    radial-gradient(circle at 10% 20%, rgb(var(--brand-accent-rgb) / 0.14), transparent 45%),
    radial-gradient(circle at 90% 10%, rgb(var(--brand-primary-light-rgb) / 0.22), transparent 50%),
    linear-gradient(180deg, rgb(var(--brand-primary-rgb)) 0%, rgb(var(--brand-primary-rgb) / 0.85) 100%);
}
.challenge-projection-shell {
  background:
    radial-gradient(circle at 20% 15%, rgb(254 240 138 / 0.35), transparent 34%),
    radial-gradient(circle at 80% 0%, rgb(251 191 36 / 0.35), transparent 38%),
    linear-gradient(180deg, rgb(245 158 11) 0%, rgb(217 119 6) 48%, rgb(146 64 14) 100%);
}
```

### `app/layout.tsx`

```
import "./globals.css";
import type { Metadata } from "next";
import { Inter, Anton, Archivo } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });

export const metadata: Metadata = {
  title: "Music Bingo",
  description: "Generate music bingo cards (PDF) and a private Spotify playlist.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${anton.variable} ${archivo.variable}`}>
      <body className="min-h-screen bg-ink text-cream font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
```

### `components/brand/BrandProvider.tsx`

```
"use client";

import { useEffect, type ReactNode } from "react";
import { hexToRgbChannels } from "@/lib/brands/hexToRgb";
import { resolveBrandFonts, fontFamilyCss, buildGoogleFontHref } from "@/lib/brands/fonts";
import type { BrandConfig } from "@/lib/brands/types";

type BrandProviderProps = {
  brand: BrandConfig | null;
  children: ReactNode;
};

function setBrandFontLink(attr: string, family: string) {
  const existing = document.querySelector(`link[${attr}]`);
  if (existing) existing.remove();
  const href = buildGoogleFontHref(family);
  if (!href) return; // next/font-managed default or unsupported — nothing to load
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute(attr, "true");
  document.head.appendChild(link);
}

export function BrandProvider({ brand, children }: BrandProviderProps): ReactNode {
  useEffect(() => {
    if (!brand) return;
    const root = document.documentElement;

    // Hex + RGB-channel tokens (the design uses both forms).
    const colours: Array<[string, string]> = [
      ["--brand-primary", brand.color_primary],
      ["--brand-primary-light", brand.color_primary_light],
      ["--brand-accent", brand.color_accent],
      ["--brand-accent-light", brand.color_accent_light],
    ];
    for (const [name, hex] of colours) {
      root.style.setProperty(name, hex);
      root.style.setProperty(`${name}-rgb`, hexToRgbChannels(hex));
    }

    // Fonts — resolved through the allowlist (A9); links only for non-next/font families.
    const { display, body } = resolveBrandFonts(brand);
    root.style.setProperty("--brand-display", fontFamilyCss(display));
    root.style.setProperty("--brand-body", fontFamilyCss(body));
    setBrandFontLink("data-brand-font-display", display);
    setBrandFontLink("data-brand-font-body", body);

    document.title = `${brand.name} — Music Bingo`;

    return () => {
      for (const [name] of colours) {
        root.style.removeProperty(name);
        root.style.removeProperty(`${name}-rgb`);
      }
      root.style.removeProperty("--brand-display");
      root.style.removeProperty("--brand-body");
      document.querySelector("link[data-brand-font-display]")?.remove();
      document.querySelector("link[data-brand-font-body]")?.remove();
      document.title = "Music Bingo";
    };
  }, [brand]);

  return <>{children}</>;
}
```

### `components/layout/AppHeader.tsx`

```
import Image from "next/image";
import type { ReactNode } from "react";

type Variant = "light" | "dark";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  variant?: Variant;
  logoDarkUrl?: string;
  logoLightUrl?: string;
  logoAlt?: string;
};

export function AppHeader({
  title,
  subtitle,
  actions,
  variant = "dark",
  logoDarkUrl,
  logoLightUrl,
  logoAlt,
}: AppHeaderProps) {
  const isDark = variant === "dark";

  return (
    <header
      className={[
        "sticky top-0 z-20 flex items-center justify-between gap-5 px-6 py-4 backdrop-blur",
        isDark
          ? "bg-ink/85 border-b border-brand-gold/35"
          : "bg-white/95 border-b border-slate-200 shadow-sm",
      ].join(" ")}
    >
      <div className="flex items-center gap-3.5">
        <Image
          src={
            isDark
              ? (logoDarkUrl ?? "/the-anchor-pub-logo-white-transparent.png")
              : (logoLightUrl ?? "/the-anchor-pub-logo-black-transparent.png")
          }
          alt={logoAlt ?? "Logo"}
          width={140}
          height={44}
          priority
          className="max-h-11 w-auto object-contain"
        />
        <div>
          <h1
            className={[
              "m-0 text-2xl font-display uppercase tracking-wide leading-none",
              isDark ? "text-cream" : "text-slate-900",
            ].join(" ")}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className={[
                "m-0 mt-1 text-[11px] font-bold uppercase tracking-[0.28em]",
                isDark ? "text-brand-gold-light" : "text-slate-500",
              ].join(" ")}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 flex-wrap">{actions}</div>
      )}
    </header>
  );
}
```

### `components/ui/Badge.tsx`

```
type BadgeProps = {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
};

export function Badge({ children, active = false, className = "" }: BadgeProps) {
  const base =
    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide border transition-colors";
  const state = active
    ? "border-brand-gold-light bg-brand-gold/20 text-brand-gold-light"
    : "border-white/15 bg-black/20 text-cream/60";
  const cls = [base, state, className].filter(Boolean).join(" ");
  return <span className={cls}>{children}</span>;
}
```

### `components/ui/Button.tsx`

```
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "success";
type Size = "sm" | "md";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand-gold hover:bg-brand-gold-light text-ink border-brand-gold-light shadow-sm",
  secondary:
    "bg-white/[0.06] hover:bg-white/[0.12] text-cream border-white/[0.16]",
  danger:
    "bg-red-500/20 hover:bg-red-500/30 text-red-200 border-red-400/60",
  success:
    "bg-emerald-600 hover:bg-emerald-500 text-emerald-50 border-emerald-400/70 shadow-sm",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-2.5 text-sm font-semibold",
};

function buildClassName(
  variant: Variant,
  size: Size,
  fullWidth: boolean,
  extra?: string
): string {
  return [
    "inline-flex items-center justify-center rounded-xl border",
    "font-semibold tracking-wide transition-colors cursor-pointer",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    variantClasses[variant],
    sizeClasses[size],
    fullWidth ? "w-full" : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

// Button as a <button>
type ButtonAsButton = {
  as?: "button";
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
} & ComponentPropsWithoutRef<"button">;

// Button as a Next.js <Link>
type ButtonAsLink = {
  as: "link";
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
} & ComponentPropsWithoutRef<typeof Link>;

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button(props: ButtonProps) {
  if (props.as === "link") {
    const { as: _as, variant = "secondary", size = "md", fullWidth = false, className, ...rest } = props;
    const cls = buildClassName(variant, size, fullWidth, className);
    return <Link className={cls} {...rest} />;
  }

  const { as: _as, variant = "secondary", size = "md", fullWidth = false, className, ...rest } = props;
  const cls = buildClassName(variant, size, fullWidth, className);
  return <button type="button" className={cls} {...rest} />;
}
```

### `components/ui/Card.tsx`

```
import type { ComponentPropsWithoutRef } from "react";

type CardAs = "div" | "article" | "form" | "section";

type CardProps = {
  children: React.ReactNode;
  className?: string;
  as?: CardAs;
  onSubmit?: ComponentPropsWithoutRef<"form">["onSubmit"];
};

export function Card({ children, className = "", as: Tag = "div", onSubmit }: CardProps) {
  const base =
    "bg-ink/60 rounded-2xl border border-brand-gold/30 shadow-[0_18px_50px_rgba(0,0,0,0.4)] p-6 sm:p-8 text-cream";
  const cls = [base, className].filter(Boolean).join(" ");

  if (Tag === "form") {
    return (
      <form className={cls} onSubmit={onSubmit}>
        {children}
      </form>
    );
  }

  return <Tag className={cls}>{children}</Tag>;
}
```

### `components/ui/Notice.tsx`

```
type Variant = "success" | "warning" | "error" | "info";

type NoticeProps = {
  variant: Variant;
  children: React.ReactNode;
  className?: string;
};

const variantClasses: Record<Variant, string> = {
  success: "bg-emerald-500/15 border-emerald-400/50 text-emerald-200",
  warning: "bg-amber-500/15 border-amber-400/50 text-amber-200",
  error: "bg-red-500/15 border-red-400/50 text-red-200",
  info: "bg-sky-500/15 border-sky-400/50 text-sky-200",
};

export function Notice({ variant, children, className = "" }: NoticeProps) {
  const cls = [
    "rounded-xl border px-4 py-3 text-sm font-medium",
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const role = variant === "error" || variant === "warning" ? "alert" : "status";
  return <div className={cls} role={role}>{children}</div>;
}
```

### `components/ui/StepIndicator.tsx`

```
type Step = { label: string };

type StepIndicatorProps = {
  steps: Step[];
  currentStep: number; // 0-based
  onStepClick?: (step: number) => void;
  canNavigateToStep?: (step: number) => boolean;
};

export function StepIndicator({
  steps,
  currentStep,
  onStepClick,
  canNavigateToStep,
}: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((step, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        const canNavigate = Boolean(onStepClick) && (canNavigateToStep?.(i) ?? true);
        const circleClass = [
          "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors",
          canNavigate ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink" : "",
          done || active
            ? "bg-brand-gold border-brand-gold-light text-ink"
            : "bg-black/25 border-white/20 text-cream/50",
        ].join(" ");

        const circleContent = done ? (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          i + 1
        );

        return (
          <div key={step.label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              {canNavigate ? (
                <button
                  type="button"
                  className={circleClass}
                  onClick={() => onStepClick?.(i)}
                  aria-current={active ? "step" : undefined}
                  aria-label={`Go to ${step.label}`}
                >
                  {circleContent}
                </button>
              ) : (
                <div className={circleClass} aria-current={active ? "step" : undefined}>
                  {circleContent}
                </div>
              )}
              <span
                className={[
                  "text-xs font-medium whitespace-nowrap",
                  active ? "text-brand-gold-light" : done ? "text-cream/70" : "text-cream/40",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={[
                  "flex-1 h-0.5 mt-[-14px] mx-1",
                  done ? "bg-brand-gold" : "bg-white/15",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

### `components/ui/formStyles.ts`

```
export const inputClass =
  "w-full bg-black/30 border border-white/15 rounded-xl px-4 py-2.5 text-cream text-sm placeholder:text-cream/40 focus:outline-none focus:border-brand-gold-light focus:ring-2 focus:ring-brand-gold/20 transition-colors";

export const textareaClass =
  "w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-cream text-sm placeholder:text-cream/40 focus:outline-none focus:border-brand-gold-light focus:ring-2 focus:ring-brand-gold/20 transition-colors min-h-[200px] resize-y";

export const selectClass =
  "w-full bg-black/30 border border-white/15 rounded-xl px-4 py-2.5 text-cream text-sm focus:outline-none focus:border-brand-gold-light focus:ring-2 focus:ring-brand-gold/20 transition-colors appearance-none";

export const labelClass = "block text-xs font-bold uppercase tracking-wide text-cream/65 mb-1.5";

export const helpClass = "text-xs text-cream/45 mt-1";
```

### `eslint.config.mjs`

```
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  // Vendored design prototypes + local caches are reference material, not source.
  { ignores: ["docs/**", "node-compile-cache/**"] },
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "import/no-anonymous-default-export": "off",
    },
  },
];

export default config;
```

### `lib/brands/brandRepo.ts`

```
// lib/brands/brandRepo.ts
import { getSupabaseClient } from "@/lib/supabase";
import type { Brand, BrandConfig, BrandFeedConfig } from "@/lib/brands/types";

type BrandRow = {
  id: string;
  name: string;
  is_default: boolean;
  logo_dark_url: string;
  logo_light_url: string;
  color_primary: string;
  color_primary_light: string;
  color_accent: string;
  color_accent_light: string;
  font_family: string | null;
  font_display: string | null;
  font_body: string | null;
  event_logo_url: string | null;
  break_message: string | null;
  end_message: string | null;
  website_url: string | null;
  qr_items: unknown;
  event_feed_type: string;
  event_feed_base_url: string | null;
  event_feed_venue_id: string | null;
  event_feed_api_key: string | null;
  created_at: string;
  updated_at: string;
};

function rowToBrand(row: BrandRow): Brand {
  return {
    id: row.id,
    name: row.name,
    is_default: row.is_default,
    logo_dark_url: row.logo_dark_url,
    logo_light_url: row.logo_light_url,
    color_primary: row.color_primary,
    color_primary_light: row.color_primary_light,
    color_accent: row.color_accent,
    color_accent_light: row.color_accent_light,
    font_family: row.font_family,
    font_display: row.font_display,
    font_body: row.font_body,
    event_logo_url: row.event_logo_url,
    break_message: row.break_message,
    end_message: row.end_message,
    website_url: row.website_url,
    qr_items: Array.isArray(row.qr_items) ? (row.qr_items as Brand["qr_items"]) : null,
    event_feed_type: row.event_feed_type as Brand["event_feed_type"],
    event_feed_base_url: row.event_feed_base_url,
    event_feed_venue_id: row.event_feed_venue_id,
    event_feed_has_key: Boolean(row.event_feed_api_key),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listBrands(): Promise<Brand[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to list brands: ${error.message}`);
  return ((data ?? []) as BrandRow[]).map(rowToBrand);
}

export async function getBrand(id: string): Promise<Brand | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to get brand: ${error.message}`);
  if (!data) return null;
  return rowToBrand(data as BrandRow);
}

export async function getDefaultBrand(): Promise<Brand | null> {
  const supabase = getSupabaseClient();
  // Try the explicit default first
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .eq("is_default", true)
    .maybeSingle();

  if (error) throw new Error(`Failed to get default brand: ${error.message}`);
  if (data) return rowToBrand(data as BrandRow);

  // Fallback: first brand by created_at
  const { data: fallback, error: fallbackError } = await supabase
    .from("brands")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fallbackError) throw new Error(`Failed to get fallback brand: ${fallbackError.message}`);
  return fallback ? rowToBrand(fallback as BrandRow) : null;
}

function brandToBrandConfig(brand: Brand): BrandConfig {
  return {
    id: brand.id,
    name: brand.name,
    logo_dark_url: brand.logo_dark_url,
    logo_light_url: brand.logo_light_url,
    color_primary: brand.color_primary,
    color_primary_light: brand.color_primary_light,
    color_accent: brand.color_accent,
    color_accent_light: brand.color_accent_light,
    font_family: brand.font_family,
    font_display: brand.font_display,
    font_body: brand.font_body,
    event_logo_url: brand.event_logo_url,
    break_message: brand.break_message,
    end_message: brand.end_message,
    website_url: brand.website_url,
    qr_items: brand.qr_items,
    event_feed_type: brand.event_feed_type,
    event_feed_base_url: brand.event_feed_base_url,
    event_feed_venue_id: brand.event_feed_venue_id,
    event_feed_has_key: brand.event_feed_has_key,
  };
}

/** Resolve a brand for a session: use brand_id if provided, otherwise default. */
export async function resolveBrandConfig(brandId: string | null | undefined): Promise<BrandConfig | null> {
  if (brandId) {
    const brand = await getBrand(brandId);
    if (brand) return brandToBrandConfig(brand);
  }
  const defaultBrand = await getDefaultBrand();
  return defaultBrand ? brandToBrandConfig(defaultBrand) : null;
}

/** Input type for createBrand — matches DB columns, includes event_feed_api_key. */
type CreateBrandInput = {
  name: string;
  is_default: boolean;
  logo_dark_url: string;
  logo_light_url: string;
  color_primary: string;
  color_primary_light: string;
  color_accent: string;
  color_accent_light: string;
  font_family?: string | null;
  font_display?: string | null;
  font_body?: string | null;
  event_logo_url?: string | null;
  break_message?: string | null;
  end_message?: string | null;
  website_url?: string | null;
  qr_items?: Brand["qr_items"];
  event_feed_type?: string;
  event_feed_base_url?: string | null;
  event_feed_venue_id?: string | null;
  event_feed_api_key?: string | null;
};

export async function createBrand(input: CreateBrandInput): Promise<Brand> {
  const supabase = getSupabaseClient();

  // If setting as default, unset the current default first
  if (input.is_default) {
    await supabase.from("brands").update({ is_default: false }).eq("is_default", true);
  }

  const { data, error } = await supabase
    .from("brands")
    .insert(input)
    .select()
    .single();

  if (error) throw new Error(`Failed to create brand: ${error.message}`);
  return rowToBrand(data as BrandRow);
}

export async function updateBrand(
  id: string,
  input: Partial<CreateBrandInput>
): Promise<Brand> {
  const supabase = getSupabaseClient();

  // If setting as default, unset the current default first
  if (input.is_default) {
    await supabase.from("brands").update({ is_default: false }).neq("id", id);
  }

  const { data, error } = await supabase
    .from("brands")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

[truncated at line 200 — original has 272 lines]
```

### `lib/brands/brandStorage.ts`

```
// lib/brands/brandStorage.ts
import { getSupabaseClient } from "@/lib/supabase";

const BUCKET_NAME = "brand-assets";
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

export type LogoSlot = "logo-dark" | "logo-light" | "event-logo";

/** Upload a logo to Supabase Storage and return the object key. */
export async function uploadBrandLogo(
  brandId: string,
  slot: LogoSlot,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Invalid file type: ${mimeType}. Must be PNG or JPEG.`);
  }
  if (fileBuffer.byteLength > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${(fileBuffer.byteLength / 1024 / 1024).toFixed(1)}MB. Max 2MB.`);
  }

  const ext = mimeType === "image/png" ? "png" : "jpg";
  const objectKey = `${brandId}/${slot}.${ext}`;
  const supabase = getSupabaseClient();

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(objectKey, fileBuffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) throw new Error(`Failed to upload logo: ${error.message}`);
  return objectKey;
}

/** Construct the full public URL for a brand logo object key. */
export function getBrandLogoPublicUrl(objectKey: string): string {
  // Object keys starting with "/" are legacy /public paths (seed data)
  if (objectKey.startsWith("/")) return objectKey;

  const supabase = getSupabaseClient();
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(objectKey);
  return data.publicUrl;
}

/** Fetch logo bytes from Storage (for PDF rendering). Only fetches from known bucket. */
export async function fetchBrandLogoPngBytes(objectKey: string): Promise<Uint8Array | null> {
  // Legacy /public paths — read from filesystem
  if (objectKey.startsWith("/")) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    try {
      const buf = await fs.readFile(path.join(process.cwd(), "public", objectKey));
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(objectKey);

  if (error || !data) return null;
  const arrayBuffer = await data.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
```

### `lib/brands/fonts.test.ts`

```
import { describe, it, expect } from "vitest";
import {
  SUPPORTED_BRAND_FONTS,
  DEFAULT_DISPLAY_FONT,
  DEFAULT_BODY_FONT,
  resolveSupportedFont,
  resolveBrandFonts,
  fontFamilyCss,
  buildGoogleFontHref,
} from "@/lib/brands/fonts";

describe("resolveSupportedFont", () => {
  it("returns the font when supported", () => {
    expect(resolveSupportedFont("Oswald", "Anton")).toBe("Oswald");
  });
  it("falls back when the font is unknown", () => {
    expect(resolveSupportedFont("Comic Sans", "Anton")).toBe("Anton");
  });
  it("falls back when null/empty", () => {
    expect(resolveSupportedFont(null, "Archivo")).toBe("Archivo");
    expect(resolveSupportedFont("", "Archivo")).toBe("Archivo");
  });
});

describe("resolveBrandFonts", () => {
  it("uses defaults when nothing set", () => {
    expect(resolveBrandFonts({ font_display: null, font_body: null, font_family: null }))
      .toEqual({ display: DEFAULT_DISPLAY_FONT, body: DEFAULT_BODY_FONT });
  });
  it("falls back body to legacy font_family", () => {
    expect(resolveBrandFonts({ font_display: null, font_body: null, font_family: "Poppins" }).body)
      .toBe("Poppins");
  });
  it("ignores unsupported values", () => {
    expect(resolveBrandFonts({ font_display: "Wingdings", font_body: "Oswald", font_family: null }))
      .toEqual({ display: DEFAULT_DISPLAY_FONT, body: "Oswald" });
  });
});

describe("fontFamilyCss", () => {
  it("uses the next/font variable for built-in defaults", () => {
    expect(fontFamilyCss("Anton")).toContain("var(--font-anton)");
    expect(fontFamilyCss("Archivo")).toContain("var(--font-archivo)");
  });
  it("quotes other supported families", () => {
    expect(fontFamilyCss("Oswald")).toContain("'Oswald'");
  });
});

describe("buildGoogleFontHref", () => {
  it("returns null for next/font-managed defaults", () => {
    expect(buildGoogleFontHref("Anton")).toBeNull();
    expect(buildGoogleFontHref("Archivo")).toBeNull();
  });
  it("returns null for unsupported families (no arbitrary injection)", () => {
    expect(buildGoogleFontHref("Comic Sans")).toBeNull();
  });
  it("builds a css2 URL for supported web fonts", () => {
    const href = buildGoogleFontHref("Oswald");
    expect(href).toContain("https://fonts.googleapis.com/css2?family=Oswald");
    expect(href).toContain("wght@");
  });
});

describe("SUPPORTED_BRAND_FONTS", () => {
  it("includes the defaults", () => {
    expect(SUPPORTED_BRAND_FONTS).toHaveProperty("Anton");
    expect(SUPPORTED_BRAND_FONTS).toHaveProperty("Archivo");
  });
});
```

### `lib/brands/fonts.ts`

```
/**
 * Allowlist of brand-selectable fonts. Brand `font_display`/`font_body` values
 * MUST resolve through this registry before any dynamic Google Fonts link is
 * created — never interpolate arbitrary DB strings into stylesheet URLs (spec A9/§14).
 *
 * `nextFontVar` marks families already loaded by next/font in app/layout.tsx;
 * those are referenced via their CSS variable and never re-loaded from Google.
 */
export type SupportedFont = {
  weights: string; // css2 `wght@` list
  category: "display" | "body" | "both";
  nextFontVar?: string; // set for next/font-managed defaults
  genericFallback: string;
};

export const SUPPORTED_BRAND_FONTS: Record<string, SupportedFont> = {
  Anton: { weights: "400", category: "display", nextFontVar: "--font-anton", genericFallback: "Impact, sans-serif" },
  Archivo: { weights: "400;500;600;700;800", category: "both", nextFontVar: "--font-archivo", genericFallback: "ui-sans-serif, system-ui, sans-serif" },
  Inter: { weights: "400;600;700;900", category: "body", nextFontVar: "--font-inter", genericFallback: "ui-sans-serif, system-ui, sans-serif" },
  Oswald: { weights: "400;500;600;700", category: "display", genericFallback: "Impact, sans-serif" },
  "Bebas Neue": { weights: "400", category: "display", genericFallback: "Impact, sans-serif" },
  "Playfair Display": { weights: "400;600;700;800", category: "display", genericFallback: "Georgia, serif" },
  Poppins: { weights: "400;500;600;700", category: "body", genericFallback: "ui-sans-serif, system-ui, sans-serif" },
  Montserrat: { weights: "400;500;600;700", category: "body", genericFallback: "ui-sans-serif, system-ui, sans-serif" },
};

export const DEFAULT_DISPLAY_FONT = "Anton";
export const DEFAULT_BODY_FONT = "Archivo";

export function resolveSupportedFont(name: string | null | undefined, fallback: string): string {
  if (name && Object.prototype.hasOwnProperty.call(SUPPORTED_BRAND_FONTS, name)) return name;
  return fallback;
}

export function resolveBrandFonts(input: {
  font_display?: string | null;
  font_body?: string | null;
  font_family?: string | null;
}): { display: string; body: string } {
  return {
    display: resolveSupportedFont(input.font_display, DEFAULT_DISPLAY_FONT),
    body: resolveSupportedFont(input.font_body ?? input.font_family ?? null, DEFAULT_BODY_FONT),
  };
}

/** CSS `font-family` value for a supported family (uses the next/font variable when available). */
export function fontFamilyCss(family: string): string {
  const font = SUPPORTED_BRAND_FONTS[family];
  if (!font) return `var(--font-archivo), ui-sans-serif, system-ui, sans-serif`;
  if (font.nextFontVar) return `var(${font.nextFontVar}), ${font.genericFallback}`;
  return `'${family}', ${font.genericFallback}`;
}

/** Google Fonts css2 URL for families NOT managed by next/font; null otherwise. */
export function buildGoogleFontHref(family: string): string | null {
  const font = SUPPORTED_BRAND_FONTS[family];
  if (!font || font.nextFontVar) return null;
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${font.weights}&display=swap`;
}
```

### `lib/brands/types.test.ts`

```
import { describe, it, expect } from "vitest";
import { brandSchema, brandInputSchema } from "@/lib/brands/types";

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "The Anchor",
  is_default: true,
  logo_dark_url: "anchor/logo-dark.png",
  logo_light_url: "anchor/logo-light.png",
  color_primary: "#003F27",
  color_primary_light: "#0F6846",
  color_accent: "#A57626",
  color_accent_light: "#C4952F",
  font_family: null,
  font_display: "Anton",
  font_body: "Archivo",
  event_logo_url: "anchor/event-logo.png",
  break_message: null,
  end_message: null,
  website_url: null,
  qr_items: null,
  event_feed_type: "none",
  event_feed_base_url: null,
  event_feed_venue_id: null,
  event_feed_has_key: false,
  created_at: "2026-05-29T00:00:00.000Z",
  updated_at: "2026-05-29T00:00:00.000Z",
};

describe("brandSchema with font + event-logo fields", () => {
  it("parses a brand carrying the new fields", () => {
    const parsed = brandSchema.parse(base);
    expect(parsed.font_display).toBe("Anton");
    expect(parsed.font_body).toBe("Archivo");
    expect(parsed.event_logo_url).toBe("anchor/event-logo.png");
  });
  it("accepts null/empty for the new fields", () => {
    const parsed = brandSchema.parse({ ...base, font_display: null, font_body: null, event_logo_url: "" });
    expect(parsed.font_display).toBeNull();
    expect(parsed.event_logo_url).toBe("");
  });
  it("brandInputSchema omits server-managed fields but keeps the new ones", () => {
    const { id, created_at, updated_at, event_feed_has_key, ...input } = base;
    const parsed = brandInputSchema.parse(input);
    expect(parsed.font_display).toBe("Anton");
    expect(parsed.event_logo_url).toBe("anchor/event-logo.png");
  });
});
```

### `lib/brands/types.ts`

```
import { z } from "zod";

const HEX_COLOUR = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be #RRGGBB format");

export const qrItemSchema = z.object({
  label: z.string().max(50),
  url: z.string().url(),
});

/** Validates that an event feed base URL uses HTTPS. */
export const eventFeedBaseUrlSchema = z.string().url().refine(
  (url) => url.startsWith("https://"),
  { message: "Must be an HTTPS URL" }
);

export const brandSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  is_default: z.boolean(),
  logo_dark_url: z.string().min(1),
  logo_light_url: z.string().min(1),
  color_primary: HEX_COLOUR,
  color_primary_light: HEX_COLOUR,
  color_accent: HEX_COLOUR,
  color_accent_light: HEX_COLOUR,
  font_family: z.string().max(100).nullable(),
  font_display: z.string().max(100).nullable().optional(),
  font_body: z.string().max(100).nullable().optional(),
  event_logo_url: z.string().max(300).nullable().or(z.literal("")).optional(),
  break_message: z.string().max(500).nullable(),
  end_message: z.string().max(500).nullable(),
  website_url: z.string().max(200).nullable().or(z.literal("")),
  qr_items: z.array(qrItemSchema).max(4).nullable(),
  event_feed_type: z.enum(["anchor_management", "baronshub", "none"]).default("none"),
  event_feed_base_url: z.string().url().nullable().or(z.literal("")),
  event_feed_venue_id: z.string().max(100).nullable().or(z.literal("")),
  event_feed_has_key: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Brand = z.infer<typeof brandSchema>;

/** Subset of Brand fields needed for runtime theming (no timestamps). */
export type BrandConfig = Pick<
  Brand,
  | "id"
  | "name"
  | "logo_dark_url"
  | "logo_light_url"
  | "color_primary"
  | "color_primary_light"
  | "color_accent"
  | "color_accent_light"
  | "font_family"
  | "font_display"
  | "font_body"
  | "event_logo_url"
  | "break_message"
  | "end_message"
  | "website_url"
  | "qr_items"
  | "event_feed_type"
  | "event_feed_base_url"
  | "event_feed_venue_id"
  | "event_feed_has_key"
>;

/** Server-only type for event feed configuration (includes secret API key). */
export type BrandFeedConfig = {
  type: "anchor_management" | "baronshub" | "none";
  baseUrl: string | null;
  apiKey: string | null;
  websiteUrl: string | null;
  venueId: string | null;
};

/** Schema for creating/updating a brand (no id, timestamps auto-generated). */
export const brandInputSchema = brandSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  event_feed_has_key: true,
});

export type BrandInput = z.infer<typeof brandInputSchema>;
```

### `lib/eventFeed/baronshubAdapter.test.ts`

```
import { test, expect } from "vitest";

import { resolveBaronsHubEventUrl } from "./baronshubAdapter.ts";

const apiBaseUrl = "https://baronshub.orangejelly.co.uk/api/v1/events";

test("resolveBaronsHubEventUrl prefers HTTPS booking URLs from the API", () => {
  expect(
    resolveBaronsHubEventUrl({
      bookingUrl: "https://tickets.example.com/event",
      bookingPageUrl: "https://l.baronspubs.com/local-event",
      seoSlug: "local-event",
      apiBaseUrl,
    })
  ).toBe("https://tickets.example.com/event");
});

test("resolveBaronsHubEventUrl accepts HTTP booking URLs from the API", () => {
  expect(
    resolveBaronsHubEventUrl({
      bookingUrl: "http://buytickets.at/meadehallatthecrowncushion/1986164",
      seoSlug: "unforgettable-live-music-experience-2026-08-06",
      apiBaseUrl,
    })
  ).toBe("http://buytickets.at/meadehallatthecrowncushion/1986164");
});

test("resolveBaronsHubEventUrl uses the API booking page URL when no HTTPS booking URL exists", () => {
  expect(
    resolveBaronsHubEventUrl({
      bookingUrl: null,
      bookingPageUrl: "https://l.baronspubs.com/local-event",
      seoSlug: "local-event",
      apiBaseUrl,
    })
  ).toBe("https://l.baronspubs.com/local-event");
});

test("resolveBaronsHubEventUrl falls back to the BaronsHub landing page for current API responses", () => {
  expect(
    resolveBaronsHubEventUrl({
      bookingUrl: null,
      seoSlug: "summer-party-with-dj-darren-2026-07-05",
      apiBaseUrl,
    })
  ).toBe("https://baronshub.orangejelly.co.uk/l/summer-party-with-dj-darren-2026-07-05");
});

test("resolveBaronsHubEventUrl does not turn rejected booking URLs into guessed landing pages", () => {
  expect(
    resolveBaronsHubEventUrl({
      bookingUrl: "mailto:events@example.com",
      seoSlug: "unforgettable-live-music-experience-2026-08-06",
      apiBaseUrl,
    })
  ).toBeNull();
});
```

### `lib/live/reveal.test.ts`

```
import { test, expect } from "vitest";

import {
  computeRevealState,
  getRevealPhase,
  shouldTriggerNextForTrack,
  updateAdvanceTrackMarker,
} from "@/lib/live/reveal";
import { getRevealConfigWithExtension, makeRevealConfigForSongPlayMs } from "@/lib/live/types";

test("getRevealPhase follows relative 45s default thresholds", () => {
  expect(getRevealPhase(0)).toBe("hidden");
  expect(getRevealPhase(11_249)).toBe("hidden");
  expect(getRevealPhase(11_250)).toBe("album");
  expect(getRevealPhase(22_499)).toBe("album");
  expect(getRevealPhase(22_500)).toBe("title");
  expect(getRevealPhase(29_999)).toBe("title");
  expect(getRevealPhase(30_000)).toBe("artist");
  expect(getRevealPhase(44_999)).toBe("artist");
  expect(getRevealPhase(45_000)).toBe("advance");
});

test("computeRevealState maps phases to reveal booleans", () => {
  expect(computeRevealState(0)).toEqual({
    showAlbum: false,
    showTitle: false,
    showArtist: false,
    shouldAdvance: false,
  });

  expect(computeRevealState(11_250)).toEqual({
    showAlbum: true,
    showTitle: false,
    showArtist: false,
    shouldAdvance: false,
  });

  expect(computeRevealState(22_500)).toEqual({
    showAlbum: true,
    showTitle: true,
    showArtist: false,
    shouldAdvance: false,
  });

  expect(computeRevealState(30_000)).toEqual({
    showAlbum: true,
    showTitle: true,
    showArtist: true,
    shouldAdvance: false,
  });

  expect(computeRevealState(45_000)).toEqual({
    showAlbum: true,
    showTitle: true,
    showArtist: true,
    shouldAdvance: true,
  });
});

test("makeRevealConfigForSongPlayMs scales milestones with song play time", () => {
  expect(makeRevealConfigForSongPlayMs(60_000)).toEqual({
    albumMs: 15_000,
    titleMs: 30_000,
    artistMs: 40_000,
    nextMs: 60_000,
  });
  expect(makeRevealConfigForSongPlayMs(45_000)).toEqual({
    albumMs: 11_250,
    titleMs: 22_500,
    artistMs: 30_000,
    nextMs: 45_000,
  });
});

test("getRevealConfigWithExtension preserves relative timing after skip or extension", () => {
  const cfg = makeRevealConfigForSongPlayMs(45_000);
  const extended = getRevealConfigWithExtension(cfg, 30_000);
  expect(extended).toEqual({
    albumMs: 18_750,
    titleMs: 37_500,
    artistMs: 50_000,
    nextMs: 75_000,
  });
  expect(getRevealPhase(30_000, extended)).toBe("album");
  expect(getRevealPhase(75_000, extended)).toBe("advance");
});

test("shouldTriggerNextForTrack fires once per track", () => {
  const reveal = computeRevealState(45_000);
  expect(
    shouldTriggerNextForTrack({
      trackId: "abc",
      revealState: reveal,
      advanceTriggeredForTrackId: null,
    })
  ).toBe(true);

  expect(
    shouldTriggerNextForTrack({
      trackId: "abc",
      revealState: reveal,
      advanceTriggeredForTrackId: "abc",
    })
  ).toBe(false);
});

test("updateAdvanceTrackMarker clears marker when track changes", () => {
  expect(updateAdvanceTrackMarker({ trackId: "abc", advanceTriggeredForTrackId: "abc" })).toBe("abc");
  expect(updateAdvanceTrackMarker({ trackId: "xyz", advanceTriggeredForTrackId: "abc" })).toBeNull();
  expect(updateAdvanceTrackMarker({ trackId: null, advanceTriggeredForTrackId: "abc" })).toBeNull();
});
```

### `lib/live/storage.test.ts`

```
import { test, expect } from "vitest";

import {
  isControlLockStale,
  listLiveSessions,
  validateLiveSession,
} from "@/lib/live/storage";
import {
  DEFAULT_REVEAL_CONFIG,
  LIVE_SESSION_VERSION,
  makeEmptyRuntimeState,
  type LiveSessionV1,
} from "@/lib/live/types";

function makeValidSession(): LiveSessionV1 {
  return {
    version: LIVE_SESSION_VERSION,
    id: "session-123",
    name: "Music Bingo - March 1st 2026",
    createdAt: "2026-02-22T12:00:00.000Z",
    eventDateInput: "2026-03-01",
    eventDateDisplay: "March 1st 2026",
    revealConfig: DEFAULT_REVEAL_CONFIG,
    breakPlaylistId: "",
    games: [
      {
        gameNumber: 1,
        theme: "General",
        playlistId: "pl-game-1",
        playlistName: "Game 1",
        playlistUrl: "https://open.spotify.com/playlist/pl-game-1",
        totalSongs: 50,
        addedCount: 48,
        challengeSongArtist: "Elvis Presley",
        challengeSongTitle: "Jailhouse Rock",
      },
      {
        gameNumber: 2,
        theme: "General",
        playlistId: "pl-game-2",
        playlistName: "Game 2",
        playlistUrl: "https://open.spotify.com/playlist/pl-game-2",
        totalSongs: 50,
        addedCount: 47,
        challengeSongArtist: "ABBA",
        challengeSongTitle: "Dancing Queen",
      },
    ],
  };
}

test("validateLiveSession accepts valid v1 payload", () => {
  const session = makeValidSession();
  const validated = validateLiveSession(session);
  expect(validated).toBeTruthy();
  expect(validated?.id).toBe(session.id);
  expect(validated?.games.length).toBe(2);
});

test("validateLiveSession rejects wrong schema", () => {
  const bad = {
    version: LIVE_SESSION_VERSION,
    id: "bad-session",
    name: "Bad",
    createdAt: "2026-02-22T12:00:00.000Z",
    eventDateInput: "2026-03-01",
    eventDateDisplay: "March 1st 2026",
    revealConfig: DEFAULT_REVEAL_CONFIG,
    games: [{ gameNumber: 1 }],
  };
  expect(validateLiveSession(bad)).toBeNull();
});

test("storage helpers are safe when localStorage is unavailable", () => {
  expect(listLiveSessions()).toEqual([]);
});

test("empty runtime starts at timestamp zero so fetched host state can win first load", () => {
  const runtime = makeEmptyRuntimeState("session-123");
  expect(runtime.updatedAtMs).toBe(0);
});

test("isControlLockStale uses timeout window", () => {
  const now = 1_000_000;
  expect(isControlLockStale({ tabId: "abc", lastSeenMs: now - 31_000 }, now, 30_000)).toBe(true);
  expect(isControlLockStale({ tabId: "abc", lastSeenMs: now - 29_000 }, now, 30_000)).toBe(false);
});
```

### `package.json`

```
{
  "name": "music-bingo-next",
  "private": true,
  "version": "0.1.0",
  "engines": {
    "node": ">=20.9.0"
  },
  "scripts": {
    "dev": "node scripts/next-with-localstorage.mjs dev",
    "build": "node scripts/next-with-localstorage.mjs build",
    "start": "node scripts/next-with-localstorage.mjs start",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "test:e2e": "node scripts/e2e-flows.mjs",
    "test:py": "python3 -m pytest -q",
    "test:unit": "vitest run",
    "verify": "npm run lint && npm run typecheck && npm run test:unit && npm run test:py && npm run test:e2e && npm run build"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.97.0",
    "docx": "^9.5.1",
    "jszip": "^3.10.1",
    "next": "16.1.3",
    "nosleep.js": "^0.12.0",
    "pdf-lib": "^1.17.1",
    "qrcode": "^1.5.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "seedrandom": "^3.0.5",
    "sharp": "^0.33.5"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.2",
    "@types/node": "^20.11.30",
    "@types/qrcode": "^1.5.5",
    "@types/react": "^18.2.79",
    "@types/react-dom": "^18.2.25",
    "@types/seedrandom": "^3.0.8",
    "autoprefixer": "^10.4.24",
    "eslint": "^9.39.2",
    "eslint-config-next": "^16.1.6",
    "playwright": "^1.58.2",
    "postcss": "^8.5.6",
    "tailwindcss": "^3.4.19",
    "typescript": "^5.5.4",
    "typescript-eslint": "^8.56.0",
    "vitest": "^2.1.9"
  }
}
```

### `supabase/migrations/20260529120000_add_brand_fonts_and_event_logo.sql`

```
-- After Hours redesign: split display/body fonts + add a gold event logo.
-- Additive only; font_family is retained as a deprecated alias of font_body.
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS font_display text,     -- e.g. "Anton"   (nullable; default resolved in app)
  ADD COLUMN IF NOT EXISTS font_body text,        -- e.g. "Archivo" (nullable; default resolved in app)
  ADD COLUMN IF NOT EXISTS event_logo_url text;   -- brand-assets Storage object key for the gold event logo

-- Backfill: existing single font becomes the body font.
UPDATE brands
  SET font_body = font_family
  WHERE font_body IS NULL AND font_family IS NOT NULL;
```

### `tailwind.config.ts`

```
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "brand-green": "rgb(var(--brand-primary-rgb) / <alpha-value>)",
        "brand-green-light": "rgb(var(--brand-primary-light-rgb) / <alpha-value>)",
        "brand-gold": "rgb(var(--brand-accent-rgb) / <alpha-value>)",
        "brand-gold-light": "rgb(var(--brand-accent-light-rgb) / <alpha-value>)",
        "brand-primary": "rgb(var(--brand-primary-rgb) / <alpha-value>)",
        "brand-accent": "rgb(var(--brand-accent-rgb) / <alpha-value>)",
        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        cream: "rgb(var(--cream-rgb) / <alpha-value>)",
        "cream-dim": "#cdbfa0",
      },
      fontFamily: {
        sans: ["var(--brand-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--brand-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--brand-display)", "Impact", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
```

### `vitest.config.ts`

```
import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": root },
  },
});
```

## Related Files (grep hints)

These files reference the basenames of changed files. They are hints for verification — not included inline. Read them only if a specific finding requires it.

```
.claude/changes-manifest.log
.superpowers/brainstorm/12682-1777013081/content/brand-anatomy.html
.superpowers/brainstorm/12682-1777013081/content/pdf-branding.html
.superpowers/brainstorm/61901-1777108897/content/a4-comparison.html
.superpowers/brainstorm/61901-1777108897/content/card-layout-comparison.html
.superpowers/brainstorm/61901-1777108897/content/card-layout-v2.html
.superpowers/brainstorm/61901-1777108897/content/card-layout-v3.html
.superpowers/brainstorm/61901-1777108897/content/double-sided.html
.superpowers/brainstorm/61901-1777108897/content/events-back-designed.html
.superpowers/brainstorm/61901-1777108897/content/events-bw.html
```

## Project Conventions (`CLAUDE.md`)

```markdown
# CLAUDE.md — Music Bingo

This file provides project-specific guidance. See the workspace-level `CLAUDE.md` one directory up for shared conventions.

## Quick Profile

- **Framework**: Next.js 16, React 18.3
- **Test runners**: Playwright (E2E), Python pytest, Node (custom scripts)
- **Database**: Supabase (live sessions, persistent storage)
- **Key integrations**: Spotify Web API, Anchor Management API, PDF generation (pdf-lib), QR codes
- **Size**: ~23 files in lib/, 10+ routes, custom Python module
- **Novel aspects**: Dual test suite (JS + Python), localStorage-to-Supabase live session sync, multi-device gameplay

## Commands

```bash
npm run dev          # Start Next.js dev with custom localStorage script
npm run build        # Production build with custom script
npm run start        # Production server
npm run lint         # ESLint (zero warnings)
npm run typecheck    # TypeScript (no emit)
npm run test:e2e     # Playwright flows (scripts/e2e-flows.mjs)
npm run test:py      # Python pytest -q
npm run verify       # Full pipeline: lint → typecheck → test:py → test:e2e → build
```

## Architecture

**Routes & Pages**
- `/` — Home/landing
- `/host` — Game host view (prep + gameplay)
- `/guest/[sessionId]` — Guest player view
- `/api/sessions/*` — Live session management (Supabase Realtime)
- `/api/spotify/*` — Spotify OAuth + playlist creation
- `/api/generate/*` — PDF & DOCX export

**Key Patterns**
- **Live Sessions**: WebSocket-like via Supabase Realtime on `live_sessions` table; clients subscribe to session channel
- **Game State**: Hosted in localStorage (client) synced to Supabase; reveals (clues/answers) computed on-the-fly
- **PDF Generation**: Custom lib/pdf.ts using pdf-lib + Sharp for image rendering
- **Spotify Auth**: OAuth 2.0 callback → token stored server-side, used to create/populate playlists
- **Custom Scripts**:
  - `next-with-localstorage.mjs` wraps Next.js CLI to enable localStorage in Node/SSR
  - `e2e-flows.mjs` runs Playwright flows end-to-end

## Key Files

| Path | Purpose |
|------|---------|
| `lib/live/types.ts` | Session, game, card, reveal types |
| `lib/live/channel.ts` | Supabase Realtime subscription logic |
| `lib/live/sessionRepo.ts` | CRUD for `live_sessions` table |
| `lib/live/storage.ts` | localStorage ↔ Session object conversion |
| `lib/live/reveal.ts` | Clue/answer reveal computation |
| `lib/generator.ts` | Create bingo cards from tracks |
| `lib/pdf.ts` | PDF export (pdf-lib + Sharp) |
| `lib/spotifyWeb.ts` | Spotify OAuth & web API calls |
| `lib/spotifyLive.ts` | Live Spotify player control |
| `lib/supabase.ts` | Supabase client init (service-role for migrations) |
| `components/` | Game UI (host, guest, card display) |
| `app/api/sessions/` | Session CRUD endpoints |
| `app/api/spotify/` | OAuth callback, playlist creation |
| `app/api/generate/` | PDF/DOCX generation |
| `supabase/migrations/` | DB schema: `live_sessions`, `session_events` |

## Environment Variables

```
# Spotify OAuth (from developer.spotify.com)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
# Optional: override callback URI if default doesn't match Spotify app settings
SPOTIFY_WEB_REDIRECT_URI=http://localhost:3000/api/spotify/callback

# Supabase (required)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Optional: Anchor Management API (for next 3 events in PDF QR codes)
MANAGEMENT_API_BASE_URL=https://management.orangejelly.co.uk
MANAGEMENT_API_TOKEN=anch_your_api_key_here
```

## Project-Specific Rules / Gotchas

### localStorage in Node/SSR
Next.js doesn't provide localStorage natively on the server. The project works around this:
- `next-with-localstorage.mjs` monkeypatches `globalThis.localStorage` during builds and server runs
- All DB writes go through `lib/live/sessionRepo.ts` (Supabase client)
- Client components hydrate from session data passed as props

### Supabase Realtime Subscriptions
- Live sessions use `supabase.channel()` for real-time updates
- Clients subscribe on mount; unsubscribe on unmount to avoid connection leaks
- Message format defined in `lib/live/types.ts` — stay consistent

### Reveal Logic
- `lib/live/reveal.ts` computes clues on-the-fly from card + reveal index
- **Critical**: all clients must use the same seed/reveal algorithm for consistency
- Test with `npm run test:py` (Python implementation also available)

### PDF Export Path
- Uses Sharp + pdf-lib to render images + embed fonts
- Spotify metadata fetched at export time (may vary if playlist updated mid-game)
- QR codes generated via `qrcode` library; embed in PDF with dimensions ~50x50px

### Python Test Suite
- Located in `music_bingo/` (Python module)
- Tests game logic, reveal computation, PDF parsing
- Run with `npm run test:py`; requires Python 3.8+
- Useful for validating cross-language consistency

### Spotify Redirect URI Mismatch
- Common issue: localhost vs 127.0.0.1
- Spotify app settings must list **both** URIs if testing locally
- Production: ensure `SPOTIFY_WEB_REDIRECT_URI` matches your domain exactly

## Deployment Notes

- Build requires `SUPABASE_SERVICE_ROLE_KEY` (used during migration setup)
- Vercel: set all env vars in project settings
- DB migrations auto-run on first deploy (see `supabase/migrations/`)
- Playwright tests can run in CI via `test:e2e` (uses native browser locally; set `BROWSERLESS_URL` in CI)

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |
```

---

_End of pack._
