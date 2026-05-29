/* global React, ReactDOM, BRANDS, applyBrand, EventStep, GameStep, GenerateStep, parseSongs */
const { useState, useEffect, useRef, useCallback } = React;

const SKEY = "mb_sessions_v1";
const loadJSON = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const uid = () => `s-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;

const emptyGame = (g) => ({ theme: "", songsText: "", intro: "", challenges: Array.from({ length: 5 }, () => ({ type: g === 1 ? "dance-along" : "sing-along", value: "" })) });
const newForm = () => ({
  id: null, name: "", date: "", pages: "40", brandId: "anchor", breakUrl: "",
  status: "draft", timing: { song: 45, album: 11, title: 23, artist: 30 },
  g1: emptyGame(1), g2: emptyGame(2),
});

/* seed examples so the dashboard isn't empty */
function seedSessions() {
  const g = (theme, songs, intro, chal) => ({
    theme, intro,
    songsText: songs.join("\n"),
    challenges: [{ type: "dance-along", value: chal }, ...Array.from({ length: 4 }, () => ({ type: "sing-along", value: "" }))],
  });
  const pop = ["The Killers - Mr. Brightside","ABBA - Dancing Queen","Queen - Don't Stop Me Now","Oasis - Wonderwall","Mark Ronson - Uptown Funk","Neil Diamond - Sweet Caroline","ELO - Mr Blue Sky","Journey - Don't Stop Believin'","Whitney Houston - I Wanna Dance with Somebody","Bon Jovi - Livin' on a Prayer","Toto - Africa","a-ha - Take On Me","Spice Girls - Wannabe","Madonna - Like a Prayer","Wham! - Last Christmas","Robbie Williams - Angels","Katy Perry - Firework","Lady Gaga - Just Dance","Rihanna - Umbrella","Coldplay - Yellow","Kings of Leon - Sex on Fire","Pulp - Common People","Blur - Song 2","The Beatles - Hey Jude","Elvis Presley - Jailhouse Rock"];
  const throwback = ["Backstreet Boys - I Want It That Way","Britney Spears - Baby One More Time","NSYNC - Bye Bye Bye","Steps - Tragedy","S Club 7 - Reach","Vengaboys - We Like to Party","Aqua - Barbie Girl","Eiffel 65 - Blue","Las Ketchup - The Ketchup Song","Shaggy - It Wasn't Me","Outkast - Hey Ya!","Gnarls Barkley - Crazy","Black Eyed Peas - I Gotta Feeling","Flo Rida - Low","Kesha - Tik Tok","LMFAO - Party Rock Anthem","Cee Lo Green - Forget You","Maroon 5 - Moves Like Jagger","Pharrell - Happy","Daft Punk - Get Lucky","Mark Morrison - Return of the Mack","Lou Bega - Mambo No. 5","Ricky Martin - Livin' la Vida Loca","Sisqo - Thong Song","Crazy Town - Butterfly"];
  return [
    {
      ...newForm(), id: uid(), name: "Friday Night Bingo", date: "2026-06-27", pages: "40", brandId: "anchor", status: "ready",
      g1: g("Pop Anthems", pop, "ABBA - Dancing Queen", "Whitney Houston - I Wanna Dance with Somebody"),
      g2: g("90s & 00s Throwbacks", throwback, "Oasis - Don't Look Back in Anger", "S Club 7 - Reach"),
    },
    {
      ...newForm(), id: uid(), name: "Velvet Room · Quiz Night", date: "2026-07-04", pages: "30", brandId: "velvet", status: "draft",
      g1: g("Disco & Soul", pop.slice(0, 26), "Earth Wind & Fire - September", "Chic - Le Freak"),
      g2: { ...emptyGame(2), theme: "Movie Soundtracks" },
    },
  ];
}

function fmtDate(iso) {
  if (!iso) return "No date set";
  try { return new Date(iso + "T00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function SetupApp() {
  const [sessions, setSessions] = useState(() => { const s = loadJSON(SKEY, null); return s && s.length ? s : seedSessions(); });
  const [view, setView] = useState("dash");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(newForm);
  const [playlistsReady, setPlaylistsReady] = useState(false);
  const [toast, setToast] = useState("");
  const rootRef = useRef(null);

  useEffect(() => { applyBrand(rootRef.current, BRANDS.anchor); }, []);
  useEffect(() => { saveJSON(SKEY, sessions); }, [sessions]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2200); return () => clearTimeout(t); }, [toast]);

  const update = useCallback((patch) => setForm((f) => ({ ...f, ...patch })), []);

  const openNew = () => { setForm(newForm()); setStep(0); setPlaylistsReady(false); setView("wiz"); };
  const openEdit = (s) => { setForm(JSON.parse(JSON.stringify(s))); setStep(0); setPlaylistsReady(s.status === "ready"); setView("wiz"); };
  const duplicate = (s) => { const c = { ...JSON.parse(JSON.stringify(s)), id: uid(), name: `${s.name} (copy)`, status: "draft" }; setSessions((p) => [c, ...p]); setToast("Duplicated"); };
  const remove = (id) => { if (confirm("Delete this game? This cannot be undone.")) setSessions((p) => p.filter((x) => x.id !== id)); };

  const saveSession = (markReady) => {
    setForm((f) => {
      const rec = { ...f, status: markReady ? "ready" : f.status, id: f.id || uid() };
      setSessions((prev) => {
        const exists = prev.some((x) => x.id === rec.id);
        return exists ? prev.map((x) => (x.id === rec.id ? rec : x)) : [rec, ...prev];
      });
      return rec;
    });
    setToast(form.id ? "Changes saved" : "Game created");
    setView("dash");
  };

  const STEP_LABELS = ["Event", "Game 1", "Game 2", "Generate"];
  const isEdit = Boolean(form.id);

  return (
    <div className="host-root" ref={rootRef}>
      <div className="host-bar">
        <div className="brandlock">
          <img className="logo" src={BRANDS.anchor.logoLight} alt="The Anchor" />
          <div className="host-title">Music Bingo<small>Setup &amp; Manage</small></div>
        </div>
        <div className="right">
          <a className="hbtn" href="Music Bingo Brands.html">Brands</a>
          <a className="hbtn" href="Music Bingo Display.html" target="_blank" rel="noreferrer">TV ↗</a>
          <span className="statuspill"><span className="led" />Spotify Connected</span>
          {view === "wiz"
            ? <button className="hbtn" onClick={() => setView("dash")}>← Dashboard</button>
            : <>
                <button className="hbtn" onClick={() => setToast("Session imported")}>↧ Import</button>
                <button className="hbtn hbtn--primary" onClick={openNew}>+ New Game</button>
              </>}
        </div>
      </div>

      <div className="host-main" style={{ display: "block" }}>
        {view === "dash" ? (
          <>
            <div className="dash-head">
              <div><h1>Your Games</h1><p>Create a new game, or open any existing one to edit songs, themes, timing and details — nothing gets locked.</p></div>
            </div>
            <div className="gtable-wrap">
              <table className="gtable">
                <thead>
                  <tr>
                    <th>Game</th><th>Venue</th><th>Date</th><th>Status</th>
                    <th>Game 1</th><th>Game 2</th><th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const b = BRANDS[s.brandId] || BRANDS.anchor;
                    const c1 = parseSongs(s.g1.songsText).length, c2 = parseSongs(s.g2.songsText).length;
                    return (
                      <tr key={s.id}>
                        <td><div className="gt-name">{s.name || "Untitled game"}</div></td>
                        <td><span className="brand-chip"><span className="sw" style={{ background: b.color_accent }} />{b.name}</span></td>
                        <td className="gt-when">{fmtDate(s.date)}</td>
                        <td><span className={`statustag ${s.status}`}>{s.status === "ready" ? "Ready" : "Draft"}</span></td>
                        <td className="gt-game"><b>{s.g1.theme || "Game 1"}</b><br /><span>{c1} songs</span></td>
                        <td className="gt-game"><b>{s.g2.theme || "Game 2"}</b><br /><span>{c2} songs</span></td>
                        <td>
                          <div className="gt-actions">
                            <a className="hbtn hbtn--primary" href="Music Bingo Host.html" target="_blank" rel="noreferrer">▶ Control</a>
                            <button className="hbtn" onClick={() => openEdit(s)}>✏ Edit</button>
                            <a className="hbtn iconbtn" title="Bingo cards PDF" href="Music Bingo Cards.html" target="_blank" rel="noreferrer">🃏</a>
                            <a className="hbtn iconbtn" title="Run sheet" href="Music Bingo Run Sheet.html" target="_blank" rel="noreferrer">📋</a>
                            <button className="hbtn iconbtn" title="Export session JSON" onClick={() => setToast("Session exported")}>⇪</button>
                            <button className="hbtn iconbtn" title="Duplicate" onClick={() => duplicate(s)}>⧉</button>
                            <button className="hbtn iconbtn hbtn--danger" title="Delete" onClick={() => remove(s.id)}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="wiz">
            {isEdit && (
              <div className="editbanner">
                <span className="pillmini">Editing</span>
                <span><b>{form.name || "Untitled game"}</b> — changes save to the same game, so your host link and cards stay valid.</span>
              </div>
            )}
            <div className="stepper">
              {STEP_LABELS.map((l, i) => (
                <button key={l} className={`stp ${i === step ? "active" : i < step ? "done" : ""}`} onClick={() => setStep(i)}>
                  <span className="num">{i < step ? "✓" : i + 1}</span><span className="lbl">{l}</span>
                </button>
              ))}
            </div>

            {step === 0 && <EventStep data={form} update={update} />}
            {step === 1 && <GameStep game={1} data={form} update={update} />}
            {step === 2 && <GameStep game={2} data={form} update={update} />}
            {step === 3 && <GenerateStep data={form} isEdit={isEdit} playlistsReady={playlistsReady}
              onCreatePlaylists={() => { setPlaylistsReady(true); setToast("Playlists created"); }}
              onDownload={(msg) => setToast(msg || "Downloaded")} />}

            <div className="wiznav">
              <button className="hbtn" onClick={() => (step === 0 ? setView("dash") : setStep(step - 1))}>
                {step === 0 ? "Cancel" : "← Back"}
              </button>
              {step < 3
                ? <button className="hbtn hbtn--primary" onClick={() => setStep(step + 1)}>Next: {STEP_LABELS[step + 1]} →</button>
                : <div style={{ display: "flex", gap: 10 }}>
                    <button className="hbtn" onClick={() => saveSession(false)}>Save Draft</button>
                    <button className="hbtn hbtn--go" onClick={() => saveSession(true)}>{isEdit ? "Save Changes" : "Save & Finish"}</button>
                  </div>}
            </div>
          </div>
        )}
      </div>

      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<SetupApp />);
