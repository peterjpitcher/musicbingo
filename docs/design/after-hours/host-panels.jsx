/* global React */
const { useState: useStateHP } = React;

/* ---- Now Playing + transport ---- */
function NowPlayingPanel({ track, playing, progressMs, timing, isIntro, isChallenge, freePlay,
  onTransport, onFree, onExtend, onSkip, onRestart, extendedMs }) {
  const nextMs = (isChallenge ? 90 : timing.song) * 1000 + extendedMs;
  const pct = Math.min(100, (progressMs / nextMs) * 100);
  const sec = Math.floor(progressMs / 1000);
  const reveals = [
    ["Album", timing.album], ["Title", timing.title], ["Artist", timing.artist],
    ["Next", isChallenge ? 90 : timing.song],
  ];
  return (
    <div className="panel">
      <h2>Now Playing <span className="meta">{playing ? "▶ Live" : "❚❚ Paused"}</span></h2>
      <div className="np">
        <div className="np-art">🎵</div>
        <div style={{ minWidth: 0 }}>
          <div className="np-title">{track.title}</div>
          <div className="np-artist">{track.artist}</div>
          <div className="np-tags">
            {isIntro && <span className="tag tag--intro">Intro · Full Play</span>}
            {isChallenge && !isIntro && <span className="tag tag--chal">Challenge · 90s</span>}
            {freePlay && <span className="tag tag--chal">Free Play</span>}
          </div>
        </div>
      </div>

      {!isIntro && (
        <>
          <div className="prog"><i style={{ width: `${pct}%` }} /></div>
          <div className="prog-meta">
            <span>{sec}s {freePlay ? "" : `/ ${Math.round(nextMs / 1000)}s`}</span>
            <span>{freePlay ? "Plays in full" : `Next song in ${Math.max(0, Math.ceil((nextMs - progressMs) / 1000))}s`}{extendedMs ? ` · +${extendedMs/1000}s` : ""}</span>
          </div>
          <div className="reveal-row">
            {reveals.map(([l, t]) => (
              <span key={l} className={`rbadge ${sec >= t || freePlay ? "on" : ""}`}>{l} @{t}s</span>
            ))}
          </div>
        </>
      )}
      {isIntro && <div className="prog-meta"><span>{sec}s elapsed</span><span>Plays in full — no auto-advance</span></div>}

      <div className="btn-row" style={{ marginBottom: 10 }}>
        <button className="hbtn hbtn--icon" onClick={() => onTransport("previous")} title="Previous">⏮</button>
        <button className="hbtn hbtn--icon hbtn--primary grow" onClick={() => onTransport(playing ? "pause" : "resume")}>
          {playing ? "❚❚ Pause" : "▶ Resume"}
        </button>
        <button className="hbtn hbtn--icon" onClick={() => onTransport("next")} title="Next">⏭</button>
      </div>
      <div className="btn-row">
        <button className="hbtn grow" onClick={onExtend} disabled={freePlay || isIntro}>+30s</button>
        <button className="hbtn grow" onClick={onSkip} disabled={isIntro}>Skip 30s</button>
        <button className="hbtn grow" onClick={onRestart}>Restart</button>
        <button className={`hbtn grow ${freePlay ? "hbtn--on" : ""}`} onClick={onFree} title="Songs play in full, no auto-advance — use after bingo is called">
          {freePlay ? "Free Play ON" : "Free Play"}
        </button>
      </div>
    </div>
  );
}

/* ---- Game flow ---- */
function GameFlowPanel({ mode, activeGame, onIntro, onStart, onBreak, onResume, onEnd, onReset }) {
  return (
    <div className="panel">
      <h2>Game Flow <span className="meta">Mode: {mode.toUpperCase()}{activeGame ? ` · Game ${activeGame}` : ""}</span></h2>
      {mode === "break" ? (
        <div className="btn-row">
          <button className="hbtn hbtn--go hbtn--lg grow" onClick={onResume}>▶ Resume Game</button>
          <button className="hbtn hbtn--danger" onClick={onEnd}>End Session</button>
        </div>
      ) : (
        <>
          <div className="btn-grid" style={{ marginBottom: 10 }}>
            <button className="hbtn" onClick={() => onIntro(1)}>▶ Dance Along</button>
            <button className="hbtn hbtn--primary" onClick={() => onStart(1)}>Start Game 1</button>
            <button className="hbtn" onClick={() => onIntro(2)}>▶ Sing Along</button>
            <button className="hbtn hbtn--primary" onClick={() => onStart(2)}>Start Game 2</button>
          </div>
          <div className="btn-row">
            <button className="hbtn grow" onClick={onBreak}>Show Break Screen</button>
            {mode === "ended"
              ? <button className="hbtn grow" onClick={onReset}>Reset to Lobby</button>
              : <button className="hbtn hbtn--danger" onClick={onEnd}>End Session</button>}
          </div>
        </>
      )}
    </div>
  );
}

/* ---- Reveal timing ---- */
function TimingPanel({ timing, setTiming }) {
  const [draft, setDraft] = useStateHP(timing);
  const f = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const changed = JSON.stringify({ ...draft, song: +draft.song, album: +draft.album, title: +draft.title, artist: +draft.artist }) !== JSON.stringify(timing);
  const fields = [["song", "Song length"], ["album", "Album reveal"], ["title", "Title reveal"], ["artist", "Artist reveal"]];
  return (
    <div className="panel">
      <h2>Reveal Timing <span className="meta">seconds</span></h2>
      <div className="fields">
        {fields.map(([k, label]) => (
          <div className="field" key={k}>
            <label>{label}</label>
            <input type="number" min="0" step="1" value={draft[k]} onChange={f(k)} />
          </div>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="hbtn grow" disabled={!changed}
          onClick={() => setTiming({ song: +draft.song, album: +draft.album, title: +draft.title, artist: +draft.artist })}>
          Save Timing
        </button>
        <button className="hbtn grow" onClick={() => { const d = { song: 45, album: 11, title: 23, artist: 30 }; setDraft(d); setTiming(d); }}>
          Use Defaults
        </button>
      </div>
      <p className="hint-small">Defaults scale to the clip; custom values must stay in order before the next-song time.</p>
    </div>
  );
}

/* ---- Live content editor (drives the TV) ---- */
function ContentPanel({ get, set, collapsed, onToggle }) {
  const Row = ({ field, ph, label, area }) => (
    <div className="ed-grp">
      <span className="k">{label}</span>
      {area
        ? <textarea value={get(field, "")} placeholder={ph} onChange={(e) => set(field, e.target.value)} />
        : <input value={get(field, "")} placeholder={ph} onChange={(e) => set(field, e.target.value)} />}
    </div>
  );
  return (
    <div className={`panel ${collapsed ? "collapsed" : ""}`}>
      <h2 className="collapse-h" onClick={onToggle}>Live Content · Pushes to TV</h2>
      <div className="ed">
        <div className="ed-grp">
          <span className="k">Winners — 1st Place</span>
          <div className="ed-two">
            <input value={get("winTeam", "")} placeholder="Team name" onChange={(e) => set("winTeam", e.target.value)} />
            <input value={get("winPrize", "")} placeholder="Prize" onChange={(e) => set("winPrize", e.target.value)} />
          </div>
        </div>
        <div className="ed-grp">
          <span className="k">Winners — Wooden Spoon (2nd from last)</span>
          <div className="ed-two">
            <input value={get("spoonTeam", "")} placeholder="Team name" onChange={(e) => set("spoonTeam", e.target.value)} />
            <input value={get("spoonPrize", "")} placeholder="Prize" onChange={(e) => set("spoonPrize", e.target.value)} />
          </div>
        </div>
        <Row field="nextDate" label="Next event date" ph="Fri 27 June · 8PM" />
        <Row field="hostName" label="Host name" ph="Nikki" />
        <div className="ed-two">
          <Row field="g1theme" label="Game 1 theme" ph="Pop Anthems" />
          <Row field="g2theme" label="Game 2 theme" ph="Throwbacks" />
        </div>
        <Row field="breakMins" label="Break — minutes" ph="10" />
        <p className="hint-small">Edits appear on the TV instantly. Tip: you can also tap any text on the TV preview after pressing “Edit live”.</p>
      </div>
    </div>
  );
}

/* ---- Playlist ---- */
function PlaylistPanel({ playlist, currentIdx, activeGame, theme }) {
  return (
    <div className="panel">
      <h2>{activeGame ? `Game ${activeGame} · ${theme}` : "Playlist"} <span className="meta">{currentIdx + 1} / {playlist.length} played</span></h2>
      <ol className="pl">
        {playlist.map((t, i) => (
          <li key={i} className={i === currentIdx ? "cur" : i < currentIdx ? "played" : ""}>
            <span className="n">{i + 1}</span>
            <span className="t">{t.title} <span style={{ opacity: .6 }}>— {t.artist}</span></span>
            {i === currentIdx && <span className="nowtag">Now</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

Object.assign(window, { NowPlayingPanel, GameFlowPanel, TimingPanel, ContentPanel, PlaylistPanel });
