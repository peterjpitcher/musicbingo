/* global React, BRANDS */
const { useMemo: useMemoS } = React;

function parseSongs(text) {
  return (text || "").split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const dash = line.indexOf(" - ");
    if (dash > 0) return { artist: line.slice(0, dash).trim(), title: line.slice(dash + 3).trim(), label: line };
    return { artist: line, title: "", label: line };
  });
}
window.parseSongs = parseSongs;

/* ---- Step 1 · Event Setup ---- */
function EventStep({ data, update }) {
  const t = data.timing;
  const setT = (k) => (e) => update({ timing: { ...t, [k]: e.target.value } });
  return (
    <div className="wizpanel">
      <h2>Event Setup</h2>
      <div className="form-grid">
        <div className="fg span2">
          <label>Session name</label>
          <input value={data.name} onChange={(e) => update({ name: e.target.value })} placeholder="Music Bingo — Friday Night" />
          <span className="help">Identifies this game in the dashboard & host console</span>
        </div>
        <div className="fg">
          <label>Event date</label>
          <input type="date" value={data.date} onChange={(e) => update({ date: e.target.value })} />
        </div>
        <div className="fg">
          <label>Pages <span style={{ opacity: .5 }}>(6 cards each)</span></label>
          <input type="number" min="1" max="200" value={data.pages} onChange={(e) => update({ pages: e.target.value })} />
          <span className="help">{(+data.pages || 0) * 6} cards total</span>
        </div>
        <div className="fg">
          <label>Venue / brand</label>
          <select value={data.brandId} onChange={(e) => update({ brandId: e.target.value })}>
            {Object.values(BRANDS).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="fg">
          <label>Break playlist URL <span style={{ opacity: .5 }}>(optional)</span></label>
          <input value={data.breakUrl} onChange={(e) => update({ breakUrl: e.target.value })} placeholder="open.spotify.com/playlist/…" />
        </div>
      </div>

      <div className="fg" style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label>Normal song timing <span style={{ opacity: .5 }}>(seconds)</span></label>
          <button className="hbtn" style={{ minHeight: 38, fontSize: 13 }} onClick={() => update({ timing: { song: 45, album: 11, title: 23, artist: 30 } })}>Use Defaults</button>
        </div>
      </div>
      <div className="timing-grid">
        {[["song", "Song length"], ["album", "Album reveal"], ["title", "Title reveal"], ["artist", "Artist reveal"]].map(([k, l]) => (
          <div className="fg" key={k}>
            <label style={{ fontSize: 11 }}>{l}</label>
            <input type="number" min="0" step="1" value={t[k]} onChange={setT(k)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Step 2/3 · Game config ---- */
function GameStep({ game, data, update }) {
  const g = data[`g${game}`];
  const setG = (patch) => update({ [`g${game}`]: { ...g, ...patch } });
  const songs = useMemoS(() => parseSongs(g.songsText), [g.songsText]);
  const count = songs.length;
  const introLabel = game === 1 ? "Dance Along song (plays before game, in full)" : "Sing Along song (plays before game, in full)";
  const chalCount = g.challenges.filter((c) => c.value).length;

  const setChallenge = (i, patch) => {
    const next = g.challenges.map((c, j) => (j === i ? { ...c, ...patch } : c));
    setG({ challenges: next });
  };

  return (
    <div className="wizpanel">
      <h2>Game {game}</h2>
      <div className="form-grid">
        <div className="fg span2">
          <label>Theme</label>
          <input value={g.theme} onChange={(e) => setG({ theme: e.target.value })} placeholder={game === 1 ? "Pop Anthems" : "Throwback Bangers"} />
        </div>
        <div className="fg span2">
          <label>Song list <span style={{ opacity: .5 }}>(one per line — “Artist - Title”)</span></label>
          <textarea value={g.songsText} onChange={(e) => setG({ songsText: e.target.value })}
            placeholder={"The Killers - Mr. Brightside\nABBA - Dancing Queen\nQueen - Don't Stop Me Now"} />
          <div className="songmeta">
            <span className={count > 50 ? "bad" : count >= 25 ? "ok" : "warn"}>{count} songs{count > 50 ? " — too many (max 50)" : count < 25 ? " — need ≥25" : ""}</span>
          </div>
        </div>
        <div className="fg span2">
          <label>{introLabel}</label>
          <input value={g.intro} onChange={(e) => setG({ intro: e.target.value })} placeholder="Paste Spotify track URL…" />
          <span className="help">Plays in full with no auto-advance — the warm-up before {game === 1 ? "Game 1" : "Game 2"}.</span>
        </div>
      </div>

      <div className="fg" style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label>Challenge songs <span style={{ opacity: .5 }}>(play for 90s)</span></label>
          <span className="chal-count">{chalCount} / 5 selected</span>
        </div>
      </div>
      {g.challenges.map((c, i) => {
        const taken = g.challenges.filter((_, j) => j !== i).map((x) => x.value).filter(Boolean);
        const opts = songs.filter((s) => !taken.includes(s.label));
        return (
          <div className="chal-row" key={i}>
            <div className="seg">
              <button className={c.type === "sing-along" ? "on" : ""} onClick={() => setChallenge(i, { type: "sing-along" })}>Sing</button>
              <button className={c.type === "dance-along" ? "on" : ""} onClick={() => setChallenge(i, { type: "dance-along" })}>Dance</button>
            </div>
            <div className="fg" style={{ flex: 1 }}>
              <select value={c.value} onChange={(e) => setChallenge(i, { value: e.target.value })} disabled={!count}>
                <option value="">{count ? `Challenge song ${i + 1} — None` : "Add songs first"}</option>
                {opts.map((s) => <option key={s.label} value={s.label}>{s.label}</option>)}
                {c.value && !opts.some((s) => s.label === c.value) && <option value={c.value}>{c.value}</option>}
              </select>
            </div>
          </div>
        );
      })}
      <p className="help" style={{ marginTop: 4 }}>At least 1 challenge song required. They play longer (90s) with the special on-screen banner.</p>
    </div>
  );
}

/* ---- Step 4 · Generate / Save ---- */
function GenerateStep({ data, isEdit, onCreatePlaylists, onDownload, playlistsReady }) {
  const cards = (+data.pages || 0) * 6;
  const [connected, setConnected] = React.useState(true);
  const [missing, setMissing] = React.useState([]);

  const createPlaylists = () => {
    onCreatePlaylists();
    // simulate a few songs Spotify couldn't auto-match (the real flow surfaces these)
    const g1 = parseSongs(data.g1.songsText), g2 = parseSongs(data.g2.songsText);
    const pick = [g1[g1.length - 1], g2[g2.length - 1]].filter(Boolean)
      .map((s) => ({ label: s.label, game: s === g1[g1.length - 1] ? 1 : 2, status: "missing", url: "" }));
    setMissing(pick);
  };
  const resolve = (i, url) => setMissing((m) => m.map((x, j) => (j === i ? { ...x, url, status: url.trim() ? "resolved" : "missing" } : x)));
  const skip = (i) => setMissing((m) => m.map((x, j) => (j === i ? { ...x, status: "skipped" } : x)));

  return (
    <div className="wizpanel">
      <h2>{isEdit ? "Save & Regenerate" : "Generate & Connect"}</h2>

      {/* Spotify */}
      <div className="genrow">
        <div className="ic">🎧</div>
        <div className="gx"><b>Spotify</b><p>{connected ? "Connected as The Anchor · playback ready" : "Connect your Spotify account to build playlists & control playback"}</p></div>
        {connected
          ? <button className="hbtn" onClick={() => setConnected(false)}>Disconnect</button>
          : <button className="hbtn hbtn--go" onClick={() => setConnected(true)}>Connect Spotify</button>}
      </div>

      {/* Playlists */}
      <div className="genrow">
        <div className="ic">🎵</div>
        <div className="gx"><b>Playlists</b><p>{playlistsReady ? "Game 1 & Game 2 playlists created on Spotify" : "Search Spotify & build a shuffled playlist per game"}</p></div>
        {playlistsReady ? <span className="check">✓</span>
          : <button className="hbtn hbtn--primary" disabled={!connected} onClick={createPlaylists}>Create Playlists</button>}
      </div>

      {/* Songs not found on Spotify */}
      {playlistsReady && missing.some((m) => m.status !== "skipped") && (
        <div className="notfound">
          <div className="nf-head">⚠ {missing.filter((m) => m.status === "missing").length} song(s) not found on Spotify — match them manually or skip</div>
          {missing.map((m, i) => m.status === "skipped" ? null : (
            <div className="nf-row" key={i}>
              <span className="nf-song"><b>Game {m.game}</b> · {m.label}</span>
              {m.status === "resolved"
                ? <span className="nf-ok">✓ Matched</span>
                : <>
                    <input className="nf-input" placeholder="Paste Spotify track link…" value={m.url} onChange={(e) => resolve(i, e.target.value)} />
                    <button className="hbtn" style={{ minHeight: 38 }} onClick={() => skip(i)}>Skip</button>
                  </>}
            </div>
          ))}
        </div>
      )}

      {/* Downloads */}
      <div className="genrow">
        <div className="ic">🃏</div>
        <div className="gx"><b>Bingo cards</b><p>{cards} cards · {data.pages} pages · double-sided PDF (cards + what’s-on)</p></div>
        <a className="hbtn" href="Music Bingo Cards.html" target="_blank" rel="noreferrer">Open / Print</a>
      </div>
      <div className="genrow">
        <div className="ic">📋</div>
        <div className="gx"><b>Host run sheet</b><p>Schedule & timings — print or copy to clipboard</p></div>
        <a className="hbtn" href="Music Bingo Run Sheet.html" target="_blank" rel="noreferrer">Open / Print</a>
      </div>
      <div className="genrow">
        <div className="ic">🗜️</div>
        <div className="gx"><b>Download bundle</b><p>Everything zipped — cards PDF, run sheet & session file</p></div>
        <button className="hbtn" onClick={() => onDownload("Bundle downloaded")}>Download ZIP</button>
      </div>
      <div className="genrow">
        <div className="ic">🗄️</div>
        <div className="gx"><b>Session file</b><p>Export this game as JSON to back up or move between devices</p></div>
        <button className="hbtn" onClick={() => onDownload("Session exported")}>Export JSON</button>
      </div>

      <p className="help" style={{ marginTop: 10 }}>
        {isEdit
          ? "Saving keeps the same session — your live host link and downloaded cards stay valid. Regenerate only if you changed the song lists."
          : "After generating, this game appears on the dashboard. You can edit any detail later without starting over."}
      </p>
    </div>
  );
}

Object.assign(window, { EventStep, GameStep, GenerateStep });
