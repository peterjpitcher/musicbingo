/* global React, ReactDOM, BRANDS, applyBrand, EditCtx, VenueLogo,
   Welcome, RunningOrder, QuizSwitch, Title, HouseRules, Warmup, GameLive, BreakScreen, Winners, ThankYou,
   NowPlayingPanel, GameFlowPanel, TimingPanel, ContentPanel, PlaylistPanel */
const { useState, useEffect, useRef, useCallback } = React;

/* run-of-show — mirrors the guest TV screens */
const STEPS = [
  { id: "welcome", short: "Welcome", sub: "Doors / intro song", render: (b) => <Welcome brand={b} variant="A" /> },
  { id: "order",   short: "Running Order", sub: "Tonight’s plan", render: (b) => <RunningOrder brand={b} /> },
  { id: "quiz1",   short: "Switch · Quiz R1", sub: "KaraFun round 1", render: (b) => <QuizSwitch brand={b} round="One" screenKey="q1" /> },
  { id: "title",   short: "Bingo Title", sub: "Logo reveal", render: (b) => <Title brand={b} variant="A" /> },
  { id: "rules",   short: "House Rules", sub: "How it works", render: (b) => <HouseRules brand={b} /> },
  { id: "dance",   short: "Dance Warm-Up", sub: "Intro · plays in full", game: 1, intro: true, render: (b) => <Warmup brand={b} type="dance" /> },
  { id: "game1",   short: "Game 1", sub: "Music Bingo", game: 1, play: true, render: (b) => <GameLive brand={b} game={1} /> },
  { id: "break",   short: "Interval", sub: "Break screen", render: (b) => <BreakScreen brand={b} /> },
  { id: "quiz2",   short: "Switch · Quiz R2", sub: "KaraFun round 2", render: (b) => <QuizSwitch brand={b} round="Two" screenKey="q2" /> },
  { id: "sing",    short: "Sing Warm-Up", sub: "Intro · plays in full", game: 2, intro: true, render: (b) => <Warmup brand={b} type="sing" /> },
  { id: "game2",   short: "Game 2", sub: "Music Bingo", game: 2, play: true, render: (b) => <GameLive brand={b} game={2} /> },
  { id: "winners", short: "Winners", sub: "1st & wooden spoon", render: (b) => <Winners brand={b} /> },
  { id: "thanks",  short: "Thank You", sub: "Reviews / next event", render: (b) => <ThankYou brand={b} /> },
];

const PLAYLISTS = {
  1: [
    { title: "Mr. Brightside", artist: "The Killers" }, { title: "Dancing Queen", artist: "ABBA" },
    { title: "Valerie", artist: "Amy Winehouse" }, { title: "Wonderwall", artist: "Oasis" },
    { title: "Uptown Funk", artist: "Mark Ronson" }, { title: "Sweet Caroline", artist: "Neil Diamond" },
    { title: "Mr Blue Sky", artist: "ELO" }, { title: "Don’t Stop Me Now", artist: "Queen" },
  ],
  2: [
    { title: "Take On Me", artist: "a-ha" }, { title: "Africa", artist: "Toto" },
    { title: "Wannabe", artist: "Spice Girls" }, { title: "Mr. Jones", artist: "Counting Crows" },
    { title: "Common People", artist: "Pulp" }, { title: "Sex on Fire", artist: "Kings of Leon" },
  ],
};
const INTRO_TRACK = { dance: { title: "Dancing Queen", artist: "ABBA" }, sing: { title: "Don’t Look Back in Anger", artist: "Oasis" } };

const LS = { brand: "mb_brand", fields: (b) => `mb_fields_${b}` };
const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

function HostApp() {
  const [brandId, setBrandId] = useState(() => load(LS.brand, "anchor"));
  const brand = BRANDS[brandId] || BRANDS.anchor;
  const [fields, setFields] = useState(() => load(LS.fields(load(LS.brand, "anchor")), {}));
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState("idle");
  const [activeGame, setActiveGame] = useState(null);
  const [playing, setPlaying] = useState(true);
  const [progressMs, setProgressMs] = useState(0);
  const [extendedMs, setExtendedMs] = useState(0);
  const [freePlay, setFreePlay] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timing, setTiming] = useState({ song: 45, album: 11, title: 23, artist: 30 });
  const [contentCollapsed, setContentCollapsed] = useState(false);
  const [scale, setScale] = useState(0.27);

  const rootRef = useRef(null);
  const frameRef = useRef(null);
  const step = STEPS[idx];

  useEffect(() => { applyBrand(rootRef.current, brand); }, [brand]);
  useEffect(() => { save(LS.brand, brandId); setFields(load(LS.fields(brandId), {})); }, [brandId]);

  /* preview scale */
  useEffect(() => {
    const fit = () => { if (frameRef.current) setScale(frameRef.current.clientWidth / 1920); };
    fit();
    const ro = new ResizeObserver(fit); if (frameRef.current) ro.observe(frameRef.current);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  /* edit store */
  const get = useCallback((k, d) => (fields[k] != null && fields[k] !== "" ? fields[k] : d), [fields]);
  const set = useCallback((k, v) => setFields((p) => { const n = { ...p, [k]: v }; save(LS.fields(brandId), n); return n; }), [brandId]);

  /* current track for the panel */
  const isPlayScreen = step.play || step.intro;
  const track = step.intro ? INTRO_TRACK[step.id === "dance" ? "dance" : "sing"]
    : step.play ? (PLAYLISTS[step.game]?.[currentIdx] ?? { title: "—", artist: "" })
    : { title: "Standing by", artist: "No game running" };

  /* progress tick — intros & free play never auto-advance (the 45s fix, by design) */
  useEffect(() => {
    if (!playing || !isPlayScreen) return;
    const nextMs = (timing.song) * 1000 + extendedMs;
    const t = window.setInterval(() => {
      setProgressMs((p) => {
        const np = p + 1000;
        if (!step.intro && !freePlay && step.play && np >= nextMs) {
          setCurrentIdx((c) => Math.min(c + 1, (PLAYLISTS[step.game]?.length ?? 1) - 1));
          setExtendedMs(0);
          return 0;
        }
        return np;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [playing, isPlayScreen, step, freePlay, timing.song, extendedMs]);

  const goTo = (i) => { setIdx(Math.max(0, Math.min(STEPS.length - 1, i))); setProgressMs(0); setExtendedMs(0); };

  /* game flow */
  const startGame = (n) => { setActiveGame(n); setMode("running"); setCurrentIdx(0); setFreePlay(false); setProgressMs(0); setExtendedMs(0); setPlaying(true); setIdx(STEPS.findIndex((s) => s.id === `game${n}`)); };
  const playIntro = (n) => { setActiveGame(n); setMode("running"); setProgressMs(0); setPlaying(true); setIdx(STEPS.findIndex((s) => s.id === (n === 1 ? "dance" : "sing"))); };
  const showBreak = () => { setMode("break"); setIdx(STEPS.findIndex((s) => s.id === "break")); };
  const resume = () => { setMode("running"); if (activeGame) setIdx(STEPS.findIndex((s) => s.id === `game${activeGame}`)); };
  const endSession = () => { setMode("ended"); setIdx(STEPS.findIndex((s) => s.id === "winners")); };
  const resetLobby = () => { setMode("idle"); setActiveGame(null); setIdx(0); };

  const transport = (a) => {
    if (a === "pause") setPlaying(false);
    else if (a === "resume") setPlaying(true);
    else if (a === "next") { setCurrentIdx((c) => Math.min(c + 1, (PLAYLISTS[step.game]?.length ?? 1) - 1)); setProgressMs(0); setExtendedMs(0); }
    else if (a === "previous") { setCurrentIdx((c) => Math.max(0, c - 1)); setProgressMs(0); setExtendedMs(0); }
  };

  const [sysState, setSysState] = useState("normal");

  return (
    <EditCtx.Provider value={{ editing: false, get, set }}>
      <div className="host-root" ref={rootRef}>
        <div className="host-bar">
          <div className="brandlock">
            {brand.logoLight ? <img className="logo" src={brand.logoLight} alt={brand.name} /> : null}
            <div className="host-title">Music Bingo<small>{brand.name} · Host Controller</small></div>
          </div>
          <div className="right">
            <select className="host-sel" value={sysState} onChange={(e) => setSysState(e.target.value)} title="Preview a system state">
              <option value="normal">State · Normal</option>
              <option value="readonly">State · Read-only</option>
              <option value="offline">State · Spotify offline</option>
              <option value="manual">State · Manual control</option>
            </select>
            <span className={`statuspill ${sysState === "offline" || sysState === "manual" ? "warn" : ""}`}><span className="led" />{sysState === "offline" ? "Spotify Offline" : sysState === "manual" ? "Manual Mode" : "Spotify Connected"}</span>
            <select className="host-sel" value={brandId} onChange={(e) => setBrandId(e.target.value)} title="Venue">
              {Object.values(BRANDS).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <a className="hbtn" href="Music Bingo Display.html" target="_blank" rel="noreferrer">Open TV ↗</a>
          </div>
        </div>

        {sysState !== "normal" && (
          <div style={{ maxWidth: 1560, margin: "0 auto", padding: "18px 26px 0" }}>
            {sysState === "readonly" && (
              <div className="banner banner--warn"><span className="bi">🔒</span><div className="bx"><b>Read-only mode</b><p>Another host tab is controlling this session — your controls are disabled.</p></div><button className="hbtn hbtn--primary">Take Control</button></div>
            )}
            {sysState === "offline" && (
              <div className="banner banner--danger"><span className="bi">⚠</span><div className="bx"><b>Spotify disconnected</b><p>Playback control is unavailable — your Spotify session expired. Reconnect to resume.</p></div><button className="hbtn">Reconnect Spotify</button></div>
            )}
            {sysState === "manual" && (
              <>
                <div className="banner banner--warn"><span className="bi">🎛</span><div className="bx"><b>Manual host control mode</b><p>No active Spotify device detected — control playback in the Spotify app while this screen drives the on-screen reveals.</p></div><button className="hbtn">Resync</button></div>
                <div className="notice notice--ok"><span>✓</span><span>Reveal timing is still running — the TV will advance on schedule.</span></div>
              </>
            )}
          </div>
        )}

        <div className="host-main">
          {/* LEFT — preview + run of show */}
          <div className="host-col">
            <div className="panel tv-wrap">
              <h2>On The TV Now <span className="meta">{step.short}</span></h2>
              <div className="tv-frame" ref={frameRef}>
                <div className="tv-live"><span className="led" />Live</div>
                <div className="tv-canvas" style={{ transform: `scale(${scale})` }}>
                  {step.render(brand)}
                </div>
              </div>
              <div className="bignav">
                <button className="hbtn grow hbtn--lg" onClick={() => goTo(idx - 1)} disabled={idx === 0}>‹ Previous Screen</button>
                <button className="hbtn grow hbtn--lg hbtn--primary" onClick={() => goTo(idx + 1)} disabled={idx === STEPS.length - 1}>Next Screen ›</button>
              </div>
            </div>

            <div className="panel">
              <h2>Run Of Show <span className="meta">{idx + 1} / {STEPS.length}</span></h2>
              <div className="ros">
                {STEPS.map((s, i) => (
                  <button key={s.id} className={`ros-step ${i === idx ? "live" : i < idx ? "done" : ""}`} onClick={() => goTo(i)}>
                    <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                    <span><span className="lbl">{s.short}</span><br /><span className="sub">{s.sub}</span></span>
                    {i === idx && <span className="nowtag">● On TV</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT — controls */}
          <div className="host-col">
            <NowPlayingPanel
              track={track} playing={playing} progressMs={progressMs} timing={timing}
              isIntro={!!step.intro} isChallenge={false} freePlay={freePlay} extendedMs={extendedMs}
              onTransport={transport} onFree={() => setFreePlay((f) => !f)}
              onExtend={() => setExtendedMs((e) => Math.min(e + 30000, 300000))}
              onSkip={() => setProgressMs((p) => p + 30000)} onRestart={() => { setProgressMs(0); setExtendedMs(0); }}
            />
            <GameFlowPanel mode={mode} activeGame={activeGame}
              onIntro={playIntro} onStart={startGame} onBreak={showBreak} onResume={resume} onEnd={endSession} onReset={resetLobby} />
            <ContentPanel get={get} set={set} collapsed={contentCollapsed} onToggle={() => setContentCollapsed((c) => !c)} />
            <TimingPanel timing={timing} setTiming={setTiming} />
            {step.play && (
              <PlaylistPanel playlist={PLAYLISTS[step.game] || []} currentIdx={currentIdx} activeGame={step.game} theme={get(step.game === 1 ? "g1theme" : "g2theme", step.game === 1 ? "Pop Anthems" : "Throwbacks")} />
            )}
          </div>
        </div>
      </div>
    </EditCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<HostApp />);
