/* global React, ReactDOM, BRANDS, applyBrand, VenueLogo, Welcome, EditCtx */
const { useState, useEffect, useRef, useCallback } = React;

const BKEY = "mb_brands_v1";
const loadJSON = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const uid = () => `b-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;

function fromBrand(b) {
  return {
    id: b.id, name: b.name, isDefault: b.id === "anchor",
    logoLight: b.logoLight || "", logoPrint: b.logoDark || "", eventLogoGold: b.eventLogoGold || null,
    cPrimary: b.color_primary, cPrimaryLite: b.color_primary_light, cAccent: b.color_accent, cAccentLite: b.color_accent_light,
    fontDisplay: b.font_display, fontBody: b.font_body,
    breakMsg: b.id === "anchor" ? "More bingo next month — see you there!" : "Back in 10 — grab a drink",
    endMsg: "Thanks for playing — drive safe!",
    website: b.website || "", reviewUrl: b.reviewUrl || "", bookingUrl: b.bookingUrl || "",
    qr: [{ label: "Google Review", url: b.reviewUrl || "" }, { label: "Book Next Event", url: b.bookingUrl || "" }],
    feedType: b.id === "anchor" ? "anchor_management" : "none", feedUrl: "", feedVenue: "", feedKey: b.id === "anchor",
  };
}
function toPreview(d) {
  return {
    name: d.name, logoLight: d.logoLight || null, eventLogoGold: d.eventLogoGold,
    color_primary: d.cPrimary, color_primary_light: d.cPrimaryLite, color_accent: d.cAccent, color_accent_light: d.cAccentLite,
    font_display: d.fontDisplay, font_body: d.fontBody, reviewUrl: d.reviewUrl, bookingUrl: d.bookingUrl,
  };
}

function Field({ label, help, children }) {
  return <div className="fg span2"><label>{label}</label>{children}{help && <span className="help">{help}</span>}</div>;
}
function ColorRow({ label, value, onChange }) {
  return (
    <div className="fg">
      <label>{label}</label>
      <div className="colorrow">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

function BrandsApp() {
  const seed = () => [fromBrand(BRANDS.anchor), fromBrand(BRANDS.velvet)];
  const [brands, setBrands] = useState(() => { const s = loadJSON(BKEY, null); return s && s.length ? s : seed(); });
  const [selId, setSelId] = useState(brands[0].id);
  const draft = brands.find((b) => b.id === selId) || brands[0];
  const [scale, setScale] = useState(0.3);
  const rootRef = useRef(null); const frameRef = useRef(null);

  useEffect(() => { applyBrand(rootRef.current, BRANDS.anchor); }, []);
  useEffect(() => { saveJSON(BKEY, brands); }, [brands]);
  useEffect(() => {
    const fit = () => { if (frameRef.current) setScale(frameRef.current.clientWidth / 1920); };
    fit(); const ro = new ResizeObserver(fit); if (frameRef.current) ro.observe(frameRef.current);
    return () => ro.disconnect();
  }, []);

  const previewRef = useRef(null);
  useEffect(() => { applyBrand(previewRef.current, toPreview(draft)); }, [draft]);

  const upd = useCallback((patch) => setBrands((bs) => bs.map((b) => (b.id === selId ? { ...b, ...patch } : b))), [selId]);
  const updQr = (i, patch) => upd({ qr: draft.qr.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const setDefault = (id) => setBrands((bs) => bs.map((b) => ({ ...b, isDefault: b.id === id })));
  const addVenue = () => { const nb = { ...fromBrand(BRANDS.velvet), id: uid(), name: "New Venue", logoLight: "", eventLogoGold: null }; setBrands((bs) => [...bs, nb]); setSelId(nb.id); };

  const get = useCallback(() => "", []);
  const noop = useCallback(() => {}, []);

  return (
    <EditCtx.Provider value={{ editing: false, get, set: noop }}>
      <div className="host-root" ref={rootRef}>
        <div className="host-bar">
          <div className="brandlock">
            <img className="logo" src={BRANDS.anchor.logoLight} alt="" />
            <div className="host-title">Music Bingo<small>Brands &amp; Venues</small></div>
          </div>
          <div className="right">
            <a className="hbtn" href="Music Bingo Setup.html">← Dashboard</a>
            <button className="hbtn hbtn--primary" onClick={addVenue}>+ New Venue</button>
          </div>
        </div>

        <div className="host-main" style={{ gridTemplateColumns: "260px minmax(0,1fr) minmax(0,1fr)" }}>
          {/* venue list */}
          <div className="host-col">
            <div className="panel">
              <h2>Venues</h2>
              <div className="ros">
                {brands.map((b) => (
                  <button key={b.id} className={`ros-step ${b.id === selId ? "live" : ""}`} onClick={() => setSelId(b.id)}>
                    <span className="sw-lg" style={{ background: b.cAccent }} />
                    <span><span className="lbl">{b.name}</span><br /><span className="sub">{b.isDefault ? "★ Default · " : ""}{b.feedType === "none" ? "No event feed" : "Live event feed"}</span></span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* edit form */}
          <div className="host-col">
            <div className="panel">
              <h2>Brand Details</h2>
              <div className="form-grid">
                <Field label="Venue name"><input value={draft.name} onChange={(e) => upd({ name: e.target.value })} /></Field>
                <Field label="Logo for dark screens (URL)" help="Shown on the TV display & host console"><input value={draft.logoLight} onChange={(e) => upd({ logoLight: e.target.value })} placeholder="https://… (light / white logo)" /></Field>
                <Field label="Logo for light / print (URL)" help="Used on the black & white bingo cards and run sheet"><input value={draft.logoPrint} onChange={(e) => upd({ logoPrint: e.target.value })} placeholder="https://… (dark / black logo)" /></Field>
                <div className="fg span2" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <button className={`hbtn ${draft.isDefault ? "hbtn--on" : ""}`} style={{ minHeight: 40 }} onClick={() => setDefault(selId)} disabled={draft.isDefault}>{draft.isDefault ? "★ Default venue" : "Set as default venue"}</button>
                  <span className="help">Pre-selected when creating a new game.</span>
                </div>
                <ColorRow label="Primary" value={draft.cPrimary} onChange={(v) => upd({ cPrimary: v })} />
                <ColorRow label="Primary light" value={draft.cPrimaryLite} onChange={(v) => upd({ cPrimaryLite: v })} />
                <ColorRow label="Accent" value={draft.cAccent} onChange={(v) => upd({ cAccent: v })} />
                <ColorRow label="Accent light" value={draft.cAccentLite} onChange={(v) => upd({ cAccentLite: v })} />
                <div className="fg"><label>Display font</label><input value={draft.fontDisplay} onChange={(e) => upd({ fontDisplay: e.target.value })} /></div>
                <div className="fg"><label>Body font</label><input value={draft.fontBody} onChange={(e) => upd({ fontBody: e.target.value })} /></div>
                <Field label="Break message"><input value={draft.breakMsg} onChange={(e) => upd({ breakMsg: e.target.value })} /></Field>
                <Field label="End message"><input value={draft.endMsg} onChange={(e) => upd({ endMsg: e.target.value })} /></Field>
                <Field label="Website"><input value={draft.website} onChange={(e) => upd({ website: e.target.value })} placeholder="theanchor.pub" /></Field>
              </div>
            </div>

            <div className="panel">
              <h2>QR Links <span className="meta">on the thank-you screen · up to 4</span></h2>
              {draft.qr.map((q, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input style={{ flex: "0 0 36%", background: "rgb(0 0 0 / .3)", border: "1px solid rgb(255 255 255 / .16)", borderRadius: 11, color: "var(--cream)", fontFamily: "inherit", fontSize: 15, padding: "11px 13px" }} value={q.label} onChange={(e) => updQr(i, { label: e.target.value })} placeholder="Label" />
                  <input style={{ flex: 1, background: "rgb(0 0 0 / .3)", border: "1px solid rgb(255 255 255 / .16)", borderRadius: 11, color: "var(--cream)", fontFamily: "inherit", fontSize: 15, padding: "11px 13px" }} value={q.url} onChange={(e) => updQr(i, { url: e.target.value })} placeholder="https://…" />
                  <button className="hbtn iconbtn hbtn--danger" title="Remove" onClick={() => upd({ qr: draft.qr.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              {draft.qr.length < 4 && <button className="hbtn" onClick={() => upd({ qr: [...draft.qr, { label: "", url: "" }] })}>+ Add QR link</button>}
            </div>

            <div className="panel">
              <h2>Event Feed <span className="meta">auto-fills upcoming events</span></h2>
              <div className="form-grid">
                <div className="fg"><label>Provider</label>
                  <select value={draft.feedType} onChange={(e) => upd({ feedType: e.target.value })}>
                    <option value="none">None</option>
                    <option value="anchor_management">Anchor Management</option>
                    <option value="baronshub">Baron&apos;s Hub</option>
                  </select>
                </div>
                <div className="fg"><label>Venue ID</label><input value={draft.feedVenue} onChange={(e) => upd({ feedVenue: e.target.value })} disabled={draft.feedType === "none"} /></div>
                <Field label="API base URL"><input value={draft.feedUrl} onChange={(e) => upd({ feedUrl: e.target.value })} placeholder="https://…" disabled={draft.feedType === "none"} /></Field>
                <div className="fg span2" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <span className={`statustag ${draft.feedKey ? "ready" : "draft"}`}>{draft.feedKey ? "API key saved" : "No API key"}</span>
                  <button className="hbtn" style={{ minHeight: 38 }} disabled={draft.feedType === "none"} onClick={() => upd({ feedKey: !draft.feedKey })}>{draft.feedKey ? "Replace key" : "Add API key"}</button>
                </div>
              </div>
            </div>
          </div>

          {/* live preview */}
          <div className="host-col">
            <div className="panel" style={{ position: "sticky", top: 90 }}>
              <h2>Live Preview <span className="meta">{draft.name}</span></h2>
              <div className="tv-frame" ref={frameRef}>
                <div className="tv-canvas" ref={previewRef} style={{ transform: `scale(${scale})` }}>
                  <Welcome brand={toPreview(draft)} variant="A" />
                </div>
              </div>
              <div className="swatches">
                {[draft.cPrimary, draft.cPrimaryLite, draft.cAccent, draft.cAccentLite].map((c, i) => (
                  <div key={i} className="swatch"><span style={{ background: c }} /><code>{c}</code></div>
                ))}
              </div>
              <p className="hint-small">Colours, logo and fonts apply consistently across the TV screens, host console, bingo cards and run sheet.</p>
            </div>
          </div>
        </div>
      </div>
    </EditCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<BrandsApp />);
