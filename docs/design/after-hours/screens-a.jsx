/* global React, Editable, Sunburst, Vinyl, Eq, Ball, VenueLogo, QR, Chrome */
const { useContext: useCtxA } = React;

/* Shared "now playing" strip for welcome + warm-up screens */
function NowPlaying({ label = "Now Playing", titleField, artistField, titlePH, artistPH }) {
  return (
    <div className="an-rise d5" style={{
      display: "inline-flex", alignItems: "center", gap: 26,
      padding: "20px 34px", borderRadius: 999,
      border: "2px solid rgb(var(--brand-accent-light-rgb) / .55)",
      background: "rgba(0,0,0,.28)", backdropFilter: "blur(6px)",
    }}>
      <Vinyl size={70} />
      <div style={{ textAlign: "left" }}>
        <div style={{ fontSize: 16, letterSpacing: ".26em", textTransform: "uppercase", color: "var(--brand-accent-light)", fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>
          <Editable field={titleField} placeholder={titlePH} />
          <span style={{ opacity: .45, margin: "0 12px" }}>·</span>
          <Editable field={artistField} placeholder={artistPH} style={{ fontWeight: 500, opacity: .8 }} />
        </div>
      </div>
      <Eq bars={7} style={{ height: 44 }} />
    </div>
  );
}

/* ============================================================
   1 · WELCOME  (variants A / B / C)
   ============================================================ */
function Welcome({ brand, variant = "A" }) {
  if (variant === "B") {
    return (
      <div className="screen grain vignette" style={{ flexDirection: "row", alignItems: "center" }}>
        <div className="col" style={{ flex: 1, padding: "0 0 0 130px", gap: 30, position: "relative", zIndex: 2 }}>
          <VenueLogo brand={brand} />
          <div className="kicker an-rise d1">Tonight at <Editable field="venueName" placeholder={brand.name} /></div>
          <h1 className="display display--gold an-rise d2" style={{ fontSize: 230 }}>
            <Editable as="div" field="welcomeTitle" placeholder="Music" /><Editable as="div" field="welcomeTitle2" placeholder="Bingo" />
          </h1>
          <p className="lede an-rise d3" style={{ maxWidth: 720 }}>
            <Editable field="welcomeLede" placeholder="Grab a drink, find your table and settle in — your host" />{" "}
            <b style={{ color: "var(--brand-accent-light)" }}><Editable field="hostName" placeholder="Nikki" /></b>{" "}is about to take the mic.
          </p>
          <div className="an-rise d4" style={{ marginTop: 10 }}>
            <NowPlaying titleField="introTitle" artistField="introArtist" titlePH="Yes Sir, I Can Boogie" artistPH="Baccara" />
          </div>
        </div>
        <div style={{ flex: "0 0 740px", position: "relative", height: "100%", display: "grid", placeItems: "center" }}>
          <Sunburst size={1100} style={{ right: -260 }} />
          <div className="an-pop d2" style={{ position: "relative" }}>
            <Vinyl size={620} />
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
              <div style={{ width: 210, height: 210, borderRadius: "50%", display: "grid", placeItems: "center",
                background: "radial-gradient(circle,var(--brand-accent-light),var(--brand-accent))", color: "var(--ink)",
                fontFamily: "var(--brand-display)", fontSize: 30, textAlign: "center", lineHeight: .92, boxShadow: "inset 0 0 0 5px rgba(0,0,0,.25)" }}>
                EST.<br />2024
              </div>
            </div>
          </div>
        </div>
        <Chrome left="Welcome" right={<Editable field="welcomeDate" placeholder="Friday · 8:00 PM" />} />
      </div>
    );
  }

  if (variant === "C") {
    return (
      <div className="screen grain vignette center-all" style={{ padding: 70 }}>
        <Sunburst size={1500} style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
        <div className="an-pop d1" style={{
          position: "relative", zIndex: 2, width: 1320, padding: "78px 80px",
          borderRadius: 28, textAlign: "center",
          background: "linear-gradient(180deg, rgba(0,0,0,.42), rgba(0,0,0,.28))",
          border: "3px solid var(--brand-accent)",
          boxShadow: "0 0 0 14px rgb(var(--brand-primary-rgb) / .7), 0 40px 100px rgba(0,0,0,.6)",
        }}>
          <div className="bulb-row" aria-hidden style={{ position: "absolute", inset: "14px", borderRadius: 18,
            background: "radial-gradient(circle, var(--brand-accent-light) 0 2.4px, transparent 3px) 0 0/40px 40px",
            opacity: .8, maskImage: "linear-gradient(#000,#000)", pointerEvents: "none",
            WebkitMaskImage: "none" }} />
          <div style={{ position: "relative" }}>
            <VenueLogo brand={brand} />
            <div className="kicker kicker--plain an-rise d2" style={{ justifyContent: "center", marginTop: 20 }}>★ &nbsp; Tonight &nbsp; ★</div>
            <h1 className="display display--gold an-rise d3" style={{ fontSize: 168, margin: "12px 0 6px" }}>
              <Editable field="welcomeTitleC" placeholder="Welcome To The Show" />
            </h1>
            <p className="lede an-rise d4" style={{ maxWidth: 900, margin: "0 auto" }}>
              The room&apos;s filling up and the records are warming. Your host{" "}
              <b style={{ color: "var(--brand-accent-light)" }}><Editable field="hostName" placeholder="Nikki" /></b>{" "}is on in a moment.
            </p>
            <hr className="rule an-fade d5" style={{ margin: "34px auto 28px", maxWidth: 520 }} />
            <div className="an-rise d6"><NowPlaying titleField="introTitle" artistField="introArtist" titlePH="Yes Sir, I Can Boogie" artistPH="Baccara" /></div>
          </div>
        </div>
      </div>
    );
  }

  // Variant A — Spotlight (default)
  return (
    <div className="screen grain vignette center-all" style={{ padding: 70 }}>
      <Sunburst size={1700} style={{ top: "44%", left: "50%", transform: "translate(-50%,-50%)" }} />
      <div style={{ position: "absolute", left: 90, top: 70, zIndex: 3 }}><VenueLogo brand={brand} /></div>
      <div className="col center-all" style={{ position: "relative", zIndex: 2, gap: 30 }}>
        <div className="kicker an-rise d1"><Editable field="venuePresents" placeholder={`${brand.name} Presents`} /></div>
        <h1 className="display display--gold an-rise d2" style={{ fontSize: 222, marginTop: -6 }}>
          <Editable as="div" field="welcomeTitle" placeholder="Music" /><Editable as="div" field="welcomeTitle2" placeholder="Bingo" />
        </h1>
        <p className="lede an-rise d3" style={{ maxWidth: 1120 }}>
          <Editable field="welcomeLedeA" placeholder="Grab a drink, settle in —" />{" "}
          <b style={{ color: "var(--brand-accent-light)" }}><Editable field="hostName" placeholder="Nikki" /></b>{" "}
          is about to take the mic.
        </p>
        <div className="an-rise d4" style={{ marginTop: 18 }}>
          <NowPlaying titleField="introTitle" artistField="introArtist" titlePH="Yes Sir, I Can Boogie" artistPH="Baccara" />
        </div>
      </div>
      <Chrome left="Welcome" right={<Editable field="welcomeDate" placeholder="Friday · 8:00 PM" />} />
    </div>
  );
}

/* ============================================================
   2 · TONIGHT'S RUNNING ORDER
   ============================================================ */
const RUN_ORDER = [
  { n: "01", t: "Quiz · Round One", s: "Grab your phones — KaraFun mobile quiz", k: "ro1" },
  { n: "02", t: "Bingo · Game 1", s: "Warm up, then 50 songs to dab", k: "ro2" },
  { n: "03", t: "The Interval", s: "Refill at the bar — back in 10", k: "ro3" },
  { n: "04", t: "Quiz · Round Two", s: "Round two of the mobile quiz", k: "ro4" },
  { n: "05", t: "Bingo · Game 2", s: "Sing-along warm up, then Game 2", k: "ro5" },
  { n: "06", t: "Prizes & Winners", s: "Top table & wooden-spoon prizes", k: "ro6" },
];
function RunningOrder({ brand }) {
  return (
    <div className="screen grain vignette" style={{ padding: "82px 120px 110px" }}>
      <div className="col" style={{ alignItems: "center", gap: 14 }}>
        <div className="kicker an-rise d1">Here&apos;s The Plan</div>
        <h1 className="display display--gold an-rise d2" style={{ fontSize: 128 }}>Running Order</h1>
      </div>
      <div className="fill" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "26px 56px", alignContent: "center", marginTop: 30 }}>
        {RUN_ORDER.map((r, i) => (
          <div key={r.k} className={`an-slideL d${Math.min(i + 1, 6)}`} style={{
            display: "flex", alignItems: "center", gap: 30, padding: "24px 30px", borderRadius: 18,
            background: "rgba(0,0,0,.26)", border: "1px solid rgb(var(--brand-accent-rgb) / .4)",
          }}>
            <Ball n={r.n} size={88} />
            <div className="col" style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--brand-display)", fontSize: 44, lineHeight: 1, textTransform: "uppercase", color: "var(--cream)", whiteSpace: "nowrap" }}>
                <Editable field={`${r.k}t`} placeholder={r.t} />
              </div>
              <div className="muted" style={{ fontSize: 23, marginTop: 8 }}><Editable field={`${r.k}s`} placeholder={r.s} /></div>
            </div>
          </div>
        ))}
      </div>
      <Chrome left={<><Editable field="venueName" placeholder={brand.name} /></>} right="Let's Play" />
    </div>
  );
}

/* ============================================================
   3 / 9 · SWITCH OUT TO MOBILE MUSIC QUIZ
   ============================================================ */
function QuizSwitch({ brand, round = "One", screenKey = "q1" }) {
  return (
    <div className="screen grain vignette center-all" style={{ padding: 80 }}>
      <Sunburst size={1500} style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)", opacity: .35 }} />
      <div className="col center-all" style={{ position: "relative", zIndex: 2, gap: 30 }}>
        <div className="pill an-rise d1">📱 &nbsp; Phones Out</div>
        <h1 className="display display--gold an-rise d2" style={{ fontSize: 210 }}>
          <Editable as="div" field={`${screenKey}_l1`} placeholder="Music Quiz" />
        </h1>
        <div className="an-pop d3" style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <span style={{ fontFamily: "var(--brand-display)", fontSize: 64, color: "var(--brand-accent-light)" }}>ROUND</span>
          <Ball n={round === "One" ? "1" : "2"} size={130} />
        </div>
        <p className="lede an-rise d4" style={{ maxWidth: 1100 }}>
          <Editable field={`${screenKey}_lede`} placeholder="Open the KaraFun app on your phone and get ready — we'll switch the big screen over to the quiz now." />
        </p>
      </div>
      <Chrome left={`Quiz · Round ${round}`} right={<Editable field="venueName" placeholder={brand.name} />} />
    </div>
  );
}

/* ============================================================
   4 · MUSIC BINGO TITLE / LOGO HERO  (variants A / B / C)
   ============================================================ */
function Title({ brand, variant = "A" }) {
  const hasLogo = Boolean(brand.eventLogoGold);

  const Hero = ({ max }) => hasLogo
    ? <img src={brand.eventLogoGold} alt="Music Bingo" style={{ width: max, maxWidth: "92%", filter: "drop-shadow(0 24px 60px rgba(0,0,0,.55))" }} className="an-pop d2" />
    : (
      <div className="an-pop d2" style={{ textAlign: "center" }}>
        <div className="display display--gold" style={{ fontSize: 90 }}>Monthly</div>
        <div className="display display--gold" style={{ fontSize: 300, lineHeight: .82 }}>Music<br />Bingo</div>
      </div>
    );

  if (variant === "B") {
    // Marquee-framed
    return (
      <div className="screen grain vignette center-all" style={{ padding: 60 }}>
        <Sunburst size={1700} style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
        <div className="an-pop d1" style={{
          position: "relative", zIndex: 2, padding: "60px 80px", borderRadius: 30,
          border: "3px solid var(--brand-accent)", background: "rgba(0,0,0,.3)",
          boxShadow: "0 0 0 12px rgb(var(--brand-primary-rgb) / .6), 0 40px 120px rgba(0,0,0,.6)",
        }}>
          <div aria-hidden style={{ position: "absolute", inset: 13, borderRadius: 20, pointerEvents: "none",
            background: "radial-gradient(circle, var(--brand-accent-light) 0 2.6px, transparent 3.2px) 0 0/42px 42px",
            WebkitMaskImage: "linear-gradient(#000 0 0)", opacity: .85,
            maskComposite: "exclude" }} />
          <Hero max={1100} />
        </div>
        <Chrome left={<Editable field="venueName" placeholder={brand.name} />} right="Game On" />
      </div>
    );
  }

  if (variant === "C") {
    // Logo + flanking vinyls, ground line
    return (
      <div className="screen grain vignette center-all" style={{ padding: 40, overflow: "hidden" }}>
        <Vinyl size={680} spin style={{ position: "absolute", left: -230, bottom: -200, opacity: .55 }} />
        <Vinyl size={520} spin style={{ position: "absolute", right: -150, top: -160, opacity: .5 }} />
        <div className="col center-all" style={{ position: "relative", zIndex: 2, gap: 8 }}>
          <div className="kicker an-rise d1">It&apos;s Time For</div>
          <Hero max={1080} />
          <div className="pill an-rise d4" style={{ marginTop: 6 }}><Editable field="titleTagline" placeholder="Five Lines · One Full House · Two Games" /></div>
        </div>
        <Chrome left={<Editable field="venueName" placeholder={brand.name} />} right="Game On" />
      </div>
    );
  }

  // Variant A — clean spotlight
  return (
    <div className="screen grain vignette center-all" style={{ padding: 60 }}>
      <Sunburst size={1800} style={{ top: "48%", left: "50%", transform: "translate(-50%,-50%)" }} />
      <div className="col center-all" style={{ position: "relative", zIndex: 2, gap: 18 }}>
        <Hero max={1180} />
        <div className="pill an-rise d4" style={{ marginTop: 4 }}>
          <Editable field="titleTagline" placeholder="Five Lines · One Full House · Two Games" />
        </div>
      </div>
      <Chrome left={<Editable field="venueName" placeholder={brand.name} />} right="Game On" />
    </div>
  );
}

/* ============================================================
   5 · HOUSE RULES
   ============================================================ */
const RULES = [
  { n: "01", t: "Listen for the song", s: "We play a clip of each track. Know it? Find it on your card.", k: "hr1" },
  { n: "02", t: "Dab your matches", s: "Mark off every song you hear. One card per team, no sneaky extras.", k: "hr2" },
  { n: "03", t: "Shout to win", s: "A full line or full house? Yell “BINGO!” loud and proud.", k: "hr3" },
  { n: "04", t: "Host has final say", s: "Nikki checks every claim. Her word is law — be nice about it!", k: "hr4" },
];
function HouseRules({ brand }) {
  return (
    <div className="screen grain vignette" style={{ padding: "78px 120px 110px" }}>
      <div className="col" style={{ alignItems: "center", gap: 12 }}>
        <div className="kicker an-rise d1">How It Works</div>
        <h1 className="display display--gold an-rise d2" style={{ fontSize: 138 }}>House Rules</h1>
      </div>
      <div className="fill" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "30px 60px", alignContent: "center", marginTop: 26 }}>
        {RULES.map((r, i) => (
          <div key={r.k} className={`an-rise d${i + 2}`} style={{
            display: "flex", gap: 28, padding: "30px 34px", borderRadius: 20,
            background: "rgba(0,0,0,.26)", borderLeft: "6px solid var(--brand-accent)",
          }}>
            <div style={{ fontFamily: "var(--brand-display)", fontSize: 92, lineHeight: .8,
              color: "transparent", WebkitTextStroke: "2px var(--brand-accent-light)" }}>{r.n}</div>
            <div className="col" style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--brand-display)", fontSize: 48, lineHeight: 1, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                <Editable field={`${r.k}t`} placeholder={r.t} />
              </div>
              <div className="muted" style={{ fontSize: 25, marginTop: 10, lineHeight: 1.35 }}>
                <Editable field={`${r.k}s`} placeholder={r.s} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <Chrome left={<Editable field="venueName" placeholder={brand.name} />} right="Good Luck!" />
    </div>
  );
}

Object.assign(window, { Welcome, RunningOrder, QuizSwitch, Title, HouseRules, NowPlaying });
