/* global React */
const { useState, useEffect, useRef, useContext, createContext } = React;

/* ============================================================
   BRANDS — multi-venue. All theming flows from these tokens so
   every screen restyles consistently when the venue changes.
   ============================================================ */
const BRANDS = {
  anchor: {
    id: "anchor",
    name: "The Anchor",
    tagline: "Stanwell Moor Village",
    logoLight: "assets/the-anchor-pub-logo-white-transparent.png", // white logo for dark bg
    logoDark: "assets/the-anchor-pub-logo-black-transparent.png",
    eventLogoGold: "assets/music-bingo-gold.png",
    eventLogoRaw: "assets/event_logo.jpeg",
    color_primary: "#003F27",
    color_primary_light: "#0F6846",
    color_accent: "#A57626",
    color_accent_light: "#C4952F",
    font_display: "Anton",
    font_body: "Archivo",
    website: "theanchor.pub",
    reviewUrl: "https://g.page/r/the-anchor-stanwell-moor/review",
    bookingUrl: "https://theanchor.pub/events",
  },
  // Second demo venue — shows the same layouts re-themed end-to-end.
  velvet: {
    id: "velvet",
    name: "The Velvet Room",
    tagline: "Soho · London",
    logoLight: null, // falls back to styled wordmark
    logoDark: null,
    eventLogoGold: null,
    eventLogoRaw: null,
    color_primary: "#2A1538",
    color_primary_light: "#5B2A6E",
    color_accent: "#C06A8E",
    color_accent_light: "#E59ABA",
    font_display: "Anton",
    font_body: "Archivo",
    website: "velvetroom.london",
    reviewUrl: "https://g.page/velvet-room/review",
    bookingUrl: "https://velvetroom.london/whats-on",
  },
};

function hexTriplet(hex) {
  const m = hex.replace('#','').match(/.{2}/g) || ['00','00','00'];
  return m.slice(0,3).map((h) => parseInt(h,16)).join(' ');
}
function applyBrand(el, brand) {
  if (!el) return;
  el.style.setProperty("--brand-primary", brand.color_primary);
  el.style.setProperty("--brand-primary-light", brand.color_primary_light);
  el.style.setProperty("--brand-accent", brand.color_accent);
  el.style.setProperty("--brand-accent-light", brand.color_accent_light);
  el.style.setProperty("--brand-primary-rgb", hexTriplet(brand.color_primary));
  el.style.setProperty("--brand-primary-light-rgb", hexTriplet(brand.color_primary_light));
  el.style.setProperty("--brand-accent-rgb", hexTriplet(brand.color_accent));
  el.style.setProperty("--brand-accent-light-rgb", hexTriplet(brand.color_accent_light));
  el.style.setProperty("--brand-display", brand.font_display);
  el.style.setProperty("--brand-body", brand.font_body);
}

/* ============================================================
   EDIT STORE — live in-play editing, persisted to localStorage.
   ============================================================ */
const EditCtx = createContext({ editing: false, get: () => "", set: () => {} });

/* Editable text. Uncontrolled while focused to keep the caret stable. */
function Editable({ field, placeholder, as = "span", className = "", style }) {
  const { editing, get, set } = useContext(EditCtx);
  const ref = useRef(null);
  const value = get(field, placeholder);

  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      ref.current.textContent = value;
    }
  }, [value]);

  const Tag = as;
  return (
    <Tag
      ref={ref}
      data-edit
      data-placeholder={placeholder}
      className={className}
      style={style}
      contentEditable={editing}
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={(e) => set(field, e.currentTarget.textContent.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter" && as !== "div") { e.preventDefault(); e.currentTarget.blur(); }
      }}
    />
  );
}

/* ============================================================
   MOTIFS
   ============================================================ */
function Sunburst({ size = 1400, style }) {
  return <div className="sunburst" style={{ width: size, height: size, ...style }} aria-hidden />;
}

function Vinyl({ size = 360, style, spin = true }) {
  return (
    <div className="vinyl" style={{ width: size, height: size, animationPlayState: spin ? "running" : "paused", ...style }} aria-hidden>
      <div className="vinyl__label"><div className="vinyl__hole" /></div>
    </div>
  );
}

function Eq({ bars = 9, style }) {
  return (
    <div className="eq" style={style} aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <i key={i} style={{ animationDelay: `${(i % 5) * 120}ms`, animationDuration: `${700 + (i % 4) * 160}ms` }} />
      ))}
    </div>
  );
}

function Ball({ n, size = 120, style }) {
  return <div className="ball" style={{ width: size, height: size, fontSize: size * 0.42, ...style }}>{n}</div>;
}

/* marquee light-bulb frame around a box */
function Bulbs({ gap = 46, r = 6 }) {
  return (
    <svg className="bulbs" width="100%" height="100%" preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden>
      <defs>
        <pattern id="b-h" width={gap} height={gap} patternUnits="userSpaceOnUse">
          <circle cx={gap / 2} cy={r + 2} r={r} fill="var(--brand-accent-light)" opacity=".9" />
        </pattern>
      </defs>
    </svg>
  );
}

/* ============================================================
   VENUE LOGO — brand logo image, or styled wordmark fallback
   ============================================================ */
function VenueLogo({ brand, size = "md" }) {
  const cls = size === "sm" ? "venue-logo venue-logo--sm" : "venue-logo";
  if (brand.logoLight) {
    return <img src={brand.logoLight} alt={brand.name} className={cls} />;
  }
  return (
    <div className="logo-fallback" style={{ fontSize: size === "sm" ? 26 : 40 }}>
      {brand.name}
    </div>
  );
}

/* ============================================================
   QR CODE — real code via qrcode-generator (CDN), faux fallback
   ============================================================ */
function QR({ value, size = 320, light = "#F6EFDD", dark = "#04130C" }) {
  let modules = null;
  try {
    if (typeof window.qrcode === "function") {
      const qr = window.qrcode(0, "M");
      qr.addData(value || "https://example.com");
      qr.make();
      const count = qr.getModuleCount();
      modules = { count, isDark: (r, c) => qr.isDark(r, c) };
    }
  } catch (e) { modules = null; }

  const pad = 2;
  if (modules) {
    const total = modules.count + pad * 2;
    const cell = size / total;
    const rects = [];
    for (let r = 0; r < modules.count; r++) {
      for (let c = 0; c < modules.count; c++) {
        if (modules.isDark(r, c)) {
          rects.push(<rect key={`${r}-${c}`} x={(c + pad) * cell} y={(r + pad) * cell} width={cell + 0.5} height={cell + 0.5} fill={dark} />);
        }
      }
    }
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", borderRadius: 14 }}>
        <rect width={size} height={size} fill={light} rx="14" />
        {rects}
      </svg>
    );
  }
  // faux fallback
  return (
    <div style={{ width: size, height: size, background: light, borderRadius: 14, display: "grid",
      gridTemplate: "repeat(11,1fr)/repeat(11,1fr)", padding: size * 0.08, gap: 2 }}>
      {Array.from({ length: 121 }).map((_, i) => {
        const corner = (i < 33 && (i % 11) < 3) || (i % 11 > 7 && i < 33) || (i > 87 && (i % 11) < 3);
        const on = corner || (Math.sin(i * 12.9898) * 43758.5 % 1 > 0.5);
        return <div key={i} style={{ background: on ? dark : "transparent", borderRadius: 1 }} />;
      })}
    </div>
  );
}

/* footer chrome strip */
function Chrome({ left, right }) {
  return (
    <div className="chrome">
      <div><span className="dot" />{left}</div>
      <div>{right}</div>
    </div>
  );
}

Object.assign(window, {
  BRANDS, applyBrand, EditCtx, Editable,
  Sunburst, Vinyl, Eq, Ball, Bulbs, VenueLogo, QR, Chrome,
});
