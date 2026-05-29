/* global React, Editable, Sunburst, Vinyl, Eq, Ball, VenueLogo, QR, Chrome */

/* striped album-art placeholder (dev wires real Spotify artwork) */
function AlbumArt({ size = 560, revealed = true }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 22, position: "relative", overflow: "hidden",
      border: "4px solid rgb(var(--brand-accent-light-rgb) / .8)",
      boxShadow: "0 30px 80px rgba(0,0,0,.55)",
      background: revealed
        ? "repeating-linear-gradient(135deg, rgb(var(--brand-primary-light-rgb)) 0 22px, rgb(var(--brand-primary-rgb)) 22px 44px)"
        : "rgba(0,0,0,.3)",
      display: "grid", placeItems: "center",
    }}>
      {revealed
        ? <Vinyl size={size * 0.52} />
        : <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 22, letterSpacing: ".2em", color: "var(--cream-dim)" }}>ALBUM ART</span>}
      <span style={{ position: "absolute", bottom: 14, right: 16, fontFamily: "ui-monospace,monospace",
        fontSize: 13, letterSpacing: ".18em", color: "rgba(246,239,221,.5)" }}>SPOTIFY ARTWORK</span>
    </div>
  );
}

/* ============================================================
   6 / 10 · WARM-UP  (dance | sing)
   ============================================================ */
function Warmup({ brand, type = "dance" }) {
  const dance = type === "dance";
  return (
    <div className={`screen grain vignette ${dance ? "screen--warm" : ""}`}
      style={{ flexDirection: "row", alignItems: "center", padding: "0 130px" }}>
      <Sunburst size={1500} style={{ left: dance ? "-300px" : "auto", right: dance ? "auto" : "-320px", top: "50%", transform: "translateY(-50%)", opacity: .4 }} />
      <div className="col" style={{ flex: 1, position: "relative", zIndex: 2, gap: 22, order: dance ? 1 : 2, alignItems: dance ? "flex-start" : "flex-end", textAlign: dance ? "left" : "right" }}>
        <div className="pill an-rise d1">{dance ? "Game 1 · Warm Up" : "Game 2 · Warm Up"}</div>
        <h1 className={`display an-rise d2 ${dance ? "" : "display--gold"}`} style={{ fontSize: dance ? 210 : 200, lineHeight: .9,
          color: dance ? "#04130C" : undefined }}>
          {dance ? <><span style={{ display: "block" }}>Get Up</span><span style={{ display: "block" }}>&amp; Dance!</span></>
                 : <><span style={{ display: "block" }}>Time To</span><span style={{ display: "block" }}>Sing Along!</span></>}
        </h1>
        <p className="lede an-rise d3" style={{ maxWidth: 760, color: dance ? "rgba(4,19,12,.82)" : undefined }}>
          {dance
            ? <Editable field="danceLede" placeholder="On your feet — this one's just for fun. Game 1 starts the moment it ends." />
            : <Editable field="singLede" placeholder="Lungs ready! A big sing-along to warm up. Game 2 kicks off right after." />}
        </p>
        <div className="an-rise d4">
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 22, padding: "18px 30px", borderRadius: 999,
            background: dance ? "rgba(4,19,12,.16)" : "rgba(0,0,0,.3)",
            border: `2px solid ${dance ? "rgba(4,19,12,.3)" : "rgb(var(--brand-accent-light-rgb) / .55)"}`,
          }}>
            <Eq bars={6} style={{ height: 40 }} />
            <div style={{ textAlign: "left", color: dance ? "var(--ink)" : "var(--cream)" }}>
              <div style={{ fontSize: 14, letterSpacing: ".24em", textTransform: "uppercase", fontWeight: 700, opacity: .8 }}>Now Playing · Full Track</div>
              <div style={{ fontSize: 30, fontWeight: 700 }}>
                <Editable field={dance ? "danceTitle" : "singTitle"} placeholder={dance ? "Dancing Queen" : "Don't Look Back in Anger"} />
                <span style={{ opacity: .5, margin: "0 10px" }}>·</span>
                <Editable field={dance ? "danceArtist" : "singArtist"} placeholder={dance ? "ABBA" : "Oasis"} style={{ fontWeight: 500 }} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ flex: "0 0 600px", display: "grid", placeItems: "center", position: "relative", zIndex: 2, order: dance ? 2 : 1 }}>
        <div className="an-pop d2"><AlbumArt size={560} /></div>
      </div>
      <Chrome left={dance ? "Dance Along" : "Sing Along"} right={<Editable field="venueName" placeholder={brand.name} />} />
    </div>
  );
}

/* ============================================================
   7 / 11 · MUSIC BINGO — LIVE GAME (album reveal)
   ============================================================ */
function GameLive({ brand, game = 1 }) {
  const themeField = game === 1 ? "g1theme" : "g2theme";
  const themePH = game === 1 ? "Pop Anthems" : "Throwback Bangers";
  const t = game === 1 ? "g1" : "g2";
  return (
    <div className="screen grain vignette" style={{ padding: "60px 110px 96px", flexDirection: "row", alignItems: "center", gap: 90 }}>
      <div style={{ flex: "0 0 600px", display: "grid", placeItems: "center" }}>
        <div className="an-pop d2"><AlbumArt size={600} /></div>
      </div>
      <div className="col" style={{ flex: 1, gap: 22, minWidth: 0 }}>
        <div className="an-rise d1" style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Ball n={game} size={76} />
          <div>
            <div style={{ fontSize: 18, letterSpacing: ".26em", textTransform: "uppercase", color: "var(--brand-accent-light)", fontWeight: 700 }}>Game {game} · Now Playing</div>
            <div style={{ fontSize: 26, fontWeight: 600 }} className="muted">Theme — <Editable field={themeField} placeholder={themePH} style={{ color: "var(--cream)", fontWeight: 700 }} /></div>
          </div>
        </div>
        <h1 className="display display--gold an-rise d2" style={{ fontSize: 130, lineHeight: .92 }}>
          <Editable field={`${t}title`} placeholder="Mr. Brightside" />
        </h1>
        <p className="an-rise d3" style={{ fontSize: 56, fontWeight: 700, margin: 0, color: "var(--cream)" }}>
          <Editable field={`${t}artist`} placeholder="The Killers" />
        </p>
        {/* reveal timeline */}
        <div className="an-rise d4" style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
          {[["Album", true], ["Title", true], ["Artist", true]].map(([l, on]) => (
            <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 22px", borderRadius: 999,
              background: "rgb(var(--brand-accent-rgb) / .18)", border: "2px solid var(--brand-accent)",
              fontSize: 22, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--brand-accent-light)" }}>
              ✓ {l}
            </span>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "12px 24px", borderRadius: 999,
            background: "rgba(0,0,0,.3)", border: "2px solid rgba(246,239,221,.3)", fontSize: 22, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: ".1em" }}>
            <Eq bars={4} style={{ height: 22 }} /> Next song · 0:08
          </span>
        </div>
      </div>
      <Chrome left={<><Editable field="venueName" placeholder={brand.name} /> · Game {game}</>} right="Eyes Down" />
    </div>
  );
}

/* ============================================================
   8 · BREAK / INTERVAL
   ============================================================ */
function BreakScreen({ brand }) {
  return (
    <div className="screen grain vignette center-all" style={{ padding: 80 }}>
      <Vinyl size={760} spin style={{ position: "absolute", right: -260, bottom: -240, opacity: .4 }} />
      <div className="col center-all" style={{ position: "relative", zIndex: 2, gap: 26 }}>
        <div className="pill an-rise d1">☕ &nbsp; Interval</div>
        <h1 className="display display--gold an-rise d2" style={{ fontSize: 230 }}>
          <Editable as="div" field="breakL1" placeholder="We're On" /><Editable as="div" field="breakL2" placeholder="A Break" />
        </h1>
        <p className="lede an-rise d3" style={{ maxWidth: 1000 }}>
          <Editable field="breakLede" placeholder="Grab a refill, stretch your legs and keep your cards safe." />
        </p>
        <div className="an-rise d4" style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 8 }}>
          <span style={{ fontSize: 24, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--brand-accent-light)", fontWeight: 700 }}>Back In</span>
          <span style={{ fontFamily: "var(--brand-display)", fontSize: 110, color: "var(--cream)", lineHeight: .8 }}>
            <Editable field="breakMins" placeholder="10" />
          </span>
          <span style={{ fontSize: 24, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--brand-accent-light)", fontWeight: 700 }}>Minutes</span>
        </div>
      </div>
      <Chrome left="Interval" right={<Editable field="venueName" placeholder={brand.name} />} />
    </div>
  );
}

/* ============================================================
   12 · WINNERS  (1st prize + 2nd-from-last "wooden spoon")
   ============================================================ */
function Winners({ brand }) {
  const Card = ({ rank, place, teamField, teamPH, prizeField, prizePH, hero }) => (
    <div className={`an-pop ${hero ? "d2" : "d3"}`} style={{
      flex: 1, padding: "50px 46px", borderRadius: 26, textAlign: "center", position: "relative",
      background: hero ? "linear-gradient(180deg, rgb(var(--brand-accent-rgb) / .9), rgba(0,0,0,.4))" : "rgba(0,0,0,.3)",
      border: hero ? "3px solid var(--brand-accent-light)" : "2px solid rgb(var(--brand-accent-rgb) / .4)",
      boxShadow: hero ? "0 30px 90px rgba(0,0,0,.5)" : "none", transform: hero ? "scale(1.04)" : "none",
    }}>
      <div style={{ fontSize: 90, lineHeight: 1 }}>{rank}</div>
      <div style={{ fontSize: 22, letterSpacing: ".24em", textTransform: "uppercase", color: "var(--brand-accent-light)", fontWeight: 700, marginTop: 12 }}>{place}</div>
      <div className="display display--gold" style={{ fontSize: hero ? 96 : 76, margin: "14px 0 18px", lineHeight: .9 }}>
        <Editable field={teamField} placeholder={teamPH} />
      </div>
      <hr className="rule" style={{ maxWidth: 220, margin: "0 auto 18px" }} />
      <div style={{ fontSize: 18, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--cream-dim)", fontWeight: 700 }}>Wins</div>
      <div style={{ fontSize: 38, fontWeight: 700, marginTop: 8 }}>
        <Editable field={prizeField} placeholder={prizePH} />
      </div>
    </div>
  );
  return (
    <div className="screen grain vignette" style={{ padding: "70px 120px 104px" }}>
      <Sunburst size={1700} style={{ top: "46%", left: "50%", transform: "translate(-50%,-50%)", opacity: .3 }} />
      <div className="col center-all" style={{ gap: 12, position: "relative", zIndex: 2 }}>
        <div className="kicker an-rise d1">Drum Roll, Please</div>
        <h1 className="display display--gold an-rise d2" style={{ fontSize: 124 }}>Tonight&apos;s Winners</h1>
      </div>
      <div className="fill" style={{ display: "flex", gap: 56, alignItems: "center", justifyContent: "center", position: "relative", zIndex: 2, marginTop: 20 }}>
        <Card rank="🏆" place="Champions · 1st Place" teamField="winTeam" teamPH="The Spice Curls" prizeField="winPrize" prizePH="£100 Bar Tab" hero />
        <Card rank="🥄" place="Wooden Spoon · 2nd from Last" teamField="spoonTeam" teamPH="Quiztopher Biggins" prizeField="spoonPrize" prizePH="A Round of Shots" />
      </div>
      <Chrome left={<Editable field="venueName" placeholder={brand.name} />} right="Well Played, Everyone" />
    </div>
  );
}

/* ============================================================
   13 · THANK YOU · REVIEWS · NEXT EVENT
   ============================================================ */
function ThankYou({ brand }) {
  return (
    <div className="screen grain vignette" style={{ padding: "76px 120px 104px", flexDirection: "row", alignItems: "center", gap: 90 }}>
      <Sunburst size={1500} style={{ left: "-360px", top: "50%", transform: "translateY(-50%)", opacity: .3 }} />
      <div className="col" style={{ flex: 1, gap: 24, position: "relative", zIndex: 2 }}>
        <VenueLogo brand={brand} />
        <h1 className="display display--gold an-rise d2" style={{ fontSize: 150 }}>
          <Editable as="div" field="tyL1" placeholder="Thank You" /><Editable as="div" field="tyL2" placeholder="& Goodnight" />
        </h1>
        <p className="lede an-rise d3" style={{ maxWidth: 760 }}>
          <Editable field="tyLede" placeholder="We hope you had a brilliant night. If you did, a Google review means the world to us." />
        </p>
        <div className="an-rise d4" style={{
          display: "inline-flex", alignItems: "center", gap: 22, padding: "20px 30px", borderRadius: 18, width: "fit-content",
          background: "rgb(var(--brand-accent-rgb) / .16)", border: "2px solid var(--brand-accent)",
        }}>
          <span style={{ fontSize: 18, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--brand-accent-light)", fontWeight: 700 }}>Next Event</span>
          <span style={{ fontFamily: "var(--brand-display)", fontSize: 52, color: "var(--cream)", lineHeight: .9 }}>
            <Editable field="nextDate" placeholder="Fri 27 June · 8PM" />
          </span>
        </div>
      </div>
      <div className="col" style={{ flex: "0 0 620px", flexDirection: "row", gap: 44, position: "relative", zIndex: 2 }}>
        {[["Review Us", "review", brand.reviewUrl, "Scan & rate us ★★★★★"],
          ["Book Again", "book", brand.bookingUrl, "Reserve your table"]].map(([label, key, url, sub], i) => (
          <div key={key} className={`an-pop d${i + 4}`} style={{ textAlign: "center", flex: 1 }}>
            <div style={{ padding: 16, background: "var(--cream)", borderRadius: 20, display: "inline-block",
              boxShadow: "0 24px 60px rgba(0,0,0,.5)", border: "3px solid var(--brand-accent-light)" }}>
              <QR value={url} size={250} />
            </div>
            <div style={{ fontFamily: "var(--brand-display)", fontSize: 38, textTransform: "uppercase", marginTop: 20, color: "var(--cream)", whiteSpace: "nowrap" }}>{label}</div>
            <div className="muted" style={{ fontSize: 22, marginTop: 6 }}>{sub}</div>
          </div>
        ))}
      </div>
      <Chrome left={<Editable field="venueWeb" placeholder={brand.website} />} right="See You Next Month" />
    </div>
  );
}

Object.assign(window, { AlbumArt, Warmup, GameLive, BreakScreen, Winners, ThankYou });

/* ============================================================
   SYSTEM STATES (loading / session not found)
   ============================================================ */
function SysLoading({ brand }) {
  return (
    <div className="screen grain vignette center-all" style={{ padding: 80 }}>
      <Sunburst size={1500} style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)", opacity: .3 }} />
      <div className="col center-all" style={{ position: "relative", zIndex: 2, gap: 30 }}>
        <div style={{ position: "relative" }}><Vinyl size={220} /></div>
        <div className="kicker an-rise d1" style={{ marginTop: 10 }}>One Moment</div>
        <h1 className="display display--gold an-rise d2" style={{ fontSize: 150 }}>Loading…</h1>
        <p className="lede an-rise d3">Connecting to tonight&apos;s game.</p>
      </div>
      <Chrome left={<Editable field="venueName" placeholder={brand.name} />} right="Please Wait" />
    </div>
  );
}

function SysNotFound({ brand }) {
  return (
    <div className="screen grain vignette center-all" style={{ padding: 80 }}>
      <div className="col center-all" style={{ position: "relative", zIndex: 2, gap: 24, maxWidth: 1200 }}>
        <div className="pill an-rise d1">📺 &nbsp; No Game Connected</div>
        <h1 className="display display--gold an-rise d2" style={{ fontSize: 128 }}>
          <Editable as="div" field="nfL1" placeholder="Nothing" /><Editable as="div" field="nfL2" placeholder="On Yet" />
        </h1>
        <p className="lede an-rise d3" style={{ maxWidth: 980 }}>
          This screen isn&apos;t linked to a live game right now. On the host device, open the controller and start a session — it&apos;ll appear here automatically.
        </p>
        <div className="an-rise d4" style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 6,
          padding: "16px 28px", borderRadius: 14, background: "rgba(0,0,0,.3)", border: "2px dashed rgb(var(--brand-accent-light-rgb) / .55)" }}>
          <span style={{ fontSize: 18, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--brand-accent-light)", fontWeight: 700 }}>Host</span>
          <span style={{ fontSize: 26, color: "var(--cream)" }}>Open the controller &amp; press <b style={{ color: "var(--brand-accent-light)" }}>Start Game</b></span>
        </div>
      </div>
      <Chrome left={<Editable field="venueName" placeholder={brand.name} />} right="Standing By" />
    </div>
  );
}

Object.assign(window, { SysLoading, SysNotFound });
