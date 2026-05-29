/* global React, ReactDOM, BRANDS, applyBrand, EditCtx,
   Welcome, RunningOrder, QuizSwitch, Title, HouseRules,
   Warmup, GameLive, BreakScreen, Winners, ThankYou */
const { useState, useEffect, useRef, useCallback } = React;

/* Run-of-show — the 13 guest TV screens in order */
const SCREENS = [
  { id: "welcome",  short: "Welcome",        variants: true,  render: (b, v) => <Welcome brand={b} variant={v} /> },
  { id: "order",    short: "Running Order",  render: (b) => <RunningOrder brand={b} /> },
  { id: "quiz1",    short: "Quiz · Round 1", render: (b) => <QuizSwitch brand={b} round="One" screenKey="q1" /> },
  { id: "title",    short: "Bingo Title",    variants: true,  render: (b, v) => <Title brand={b} variant={v} /> },
  { id: "rules",    short: "House Rules",    render: (b) => <HouseRules brand={b} /> },
  { id: "dance",    short: "Dance Warm-Up",  render: (b) => <Warmup brand={b} type="dance" /> },
  { id: "game1",    short: "Game 1",         render: (b) => <GameLive brand={b} game={1} /> },
  { id: "break",    short: "Interval",       render: (b) => <BreakScreen brand={b} /> },
  { id: "quiz2",    short: "Quiz · Round 2", render: (b) => <QuizSwitch brand={b} round="Two" screenKey="q2" /> },
  { id: "sing",     short: "Sing Warm-Up",   render: (b) => <Warmup brand={b} type="sing" /> },
  { id: "game2",    short: "Game 2",         render: (b) => <GameLive brand={b} game={2} /> },
  { id: "winners",  short: "Winners",        render: (b) => <Winners brand={b} /> },
  { id: "thanks",   short: "Thank You",      render: (b) => <ThankYou brand={b} /> },
  { id: "sys-load", short: "⚙ Loading",      render: (b) => <SysLoading brand={b} /> },
  { id: "sys-none", short: "⚙ No Session",   render: (b) => <SysNotFound brand={b} /> },
];

const LS = {
  idx: "mb_idx", brand: "mb_brand", edit: "mb_edit",
  welcomeVar: "mb_welcome_var", titleVar: "mb_title_var",
  fields: (b) => `mb_fields_${b}`,
};
const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

function App() {
  const [idx, setIdx] = useState(() => load(LS.idx, 0));
  const [brandId, setBrandId] = useState(() => load(LS.brand, "anchor"));
  const [editing, setEditing] = useState(() => load(LS.edit, false));
  const [welcomeVar, setWelcomeVar] = useState(() => load(LS.welcomeVar, "A"));
  const [titleVar, setTitleVar] = useState(() => load(LS.titleVar, "A"));
  const [fields, setFields] = useState(() => load(LS.fields(load(LS.brand, "anchor")), {}));
  const [scale, setScale] = useState(1);

  const brand = BRANDS[brandId] || BRANDS.anchor;
  const stageRef = useRef(null);

  /* persist primitives */
  useEffect(() => save(LS.idx, idx), [idx]);
  useEffect(() => save(LS.brand, brandId), [brandId]);
  useEffect(() => save(LS.edit, editing), [editing]);
  useEffect(() => save(LS.welcomeVar, welcomeVar), [welcomeVar]);
  useEffect(() => save(LS.titleVar, titleVar), [titleVar]);

  /* load this brand's field set when venue changes */
  useEffect(() => { setFields(load(LS.fields(brandId), {})); }, [brandId]);

  /* apply brand tokens */
  useEffect(() => { applyBrand(stageRef.current, brand); }, [brand]);

  /* scaling */
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const go = useCallback((d) => setIdx((i) => Math.max(0, Math.min(SCREENS.length - 1, i + d))), []);

  /* keyboard nav */
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.isContentEditable) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
      else if (e.key.toLowerCase() === "e") setEditing((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  /* edit store */
  const getField = useCallback((k, d) => (fields[k] != null ? fields[k] : d), [fields]);
  const setField = useCallback((k, v) => {
    setFields((prev) => {
      if (prev[k] === v) return prev;
      const next = { ...prev, [k]: v };
      save(LS.fields(brandId), next);
      return next;
    });
  }, [brandId]);

  const cur = SCREENS[idx];
  const variant = cur.id === "welcome" ? welcomeVar : cur.id === "title" ? titleVar : "A";
  const setVariant = cur.id === "welcome" ? setWelcomeVar : setTitleVar;

  return (
    <EditCtx.Provider value={{ editing, get: getField, set: setField }}>
      <div className="viewport">
        <div className="stage-scaler" ref={stageRef} style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
          <div className={`stage ${editing ? "editing" : ""}`}>
            <div className="screen-wrap in" key={`${brandId}-${cur.id}-${variant}`}>
              {cur.render(brand, variant)}
            </div>
          </div>
        </div>
      </div>

      {/* hint */}
      <div className="hint">← → screens · press E to {editing ? "stop editing" : "edit live"}</div>

      {/* control bar (outside scaled stage) */}
      <div className="controls">
        <button onClick={() => go(-1)} title="Previous (←)">‹</button>
        <span className="label"><span className="num">{idx + 1}</span> / {SCREENS.length} · {cur.short}</span>
        <button onClick={() => go(1)} title="Next (→)">›</button>
        <span className="sep" />
        {cur.variants && (
          <>
            {["A", "B", "C"].map((v) => (
              <button key={v} className={variant === v ? "on" : ""} onClick={() => setVariant(v)} title={`Variation ${v}`}>{v}</button>
            ))}
            <span className="sep" />
          </>
        )}
        <button className={editing ? "on" : ""} onClick={() => setEditing((x) => !x)} title="Edit text live (E)">
          ✎ {editing ? "Editing" : "Edit"}
        </button>
        <span className="sep" />
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} title="Venue / brand">
          {Object.values(BRANDS).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
    </EditCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
