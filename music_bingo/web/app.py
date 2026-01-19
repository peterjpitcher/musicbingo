from __future__ import annotations

from dataclasses import asdict
from datetime import date
from io import BytesIO
import os
from pathlib import Path

from flask import Flask, Response, flash, redirect, render_template_string, request

from music_bingo.core.generator import generate_cards
from music_bingo.core.parser import parse_song_list_text
from music_bingo.core.pdf import RenderOptions, render_cards_pdf


APP_DIR = Path(__file__).resolve().parent.parent.parent
ASSETS_DIR = APP_DIR / "assets"
DEFAULT_LOGO_PATHS = [ASSETS_DIR / "logo.png"]
MENU_URL = "https://vip-club.uk/vvjkz0"


def _find_logo() -> Path | None:
    for path in DEFAULT_LOGO_PATHS:
        if path.exists():
            return path
    return None


HTML = """
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Music Bingo</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; max-width: 920px; }
      h1 { margin: 0 0 8px; }
      .hint { color: #333; margin: 0 0 16px; }
      label { display: block; font-weight: 600; margin: 12px 0 6px; }
      input[type="text"], input[type="number"], textarea { width: 100%; padding: 10px; border: 1px solid #111; border-radius: 6px; }
      textarea { min-height: 260px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
      .btn { margin-top: 14px; padding: 10px 14px; border: 2px solid #111; border-radius: 10px; background: #fff; font-weight: 700; cursor: pointer; }
      .box { border: 2px solid #111; border-radius: 12px; padding: 14px; }
      .flash { margin: 10px 0; padding: 10px 12px; border: 1px solid #111; border-radius: 8px; }
      .small { font-size: 12px; color: #333; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    </style>
  </head>
  <body>
    <h1>Music Bingo</h1>
    <p class="hint">Paste/upload your song list, enter the event date, and generate a single PDF (black &amp; white) with 200 unique cards.</p>

    {% with messages = get_flashed_messages() %}
      {% if messages %}
        {% for msg in messages %}
          <div class="flash">{{ msg }}</div>
        {% endfor %}
      {% endif %}
    {% endwith %}

    <form class="box" method="post" action="/generate" enctype="multipart/form-data">
      <div class="row">
        <div>
          <label>Event date (printed on cards)</label>
          <input type="text" name="event_date" value="{{ default_event_date }}" placeholder="May 1st 2026" required>
        </div>
        <div>
          <label>Number of cards</label>
          <input type="number" name="count" value="200" min="1" max="1000" step="1" required>
          <div class="small">200 recommended. Each page is one A4 card.</div>
        </div>
      </div>

      <div class="row">
        <div>
          <label>Seed (optional, for reproducible PDFs)</label>
          <input type="number" name="seed" placeholder="e.g. 12345">
        </div>
        <div>
          <label>Song list file (optional)</label>
          <input type="file" name="file" accept=".txt,text/plain">
          <div class="small">If provided, this overrides the pasted text.</div>
        </div>
      </div>

      <label>Song list (plain text)</label>
      <textarea name="songs" placeholder="Elvis Presley – Jailhouse Rock"></textarea>

      <div class="row">
        <div>
          <label>Event QR 1 URL (optional)</label>
          <input type="text" name="qr_event_1" placeholder="https://...">
        </div>
        <div>
          <label>Event QR 2 URL (optional)</label>
          <input type="text" name="qr_event_2" placeholder="https://...">
        </div>
      </div>

      <button class="btn" type="submit">Generate PDF</button>
      <p class="small">Menu QR is always included: <span class="mono">{{ menu_url }}</span></p>
    </form>

  </body>
</html>
"""


app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-key")


@app.get("/")
def index() -> str:
    return render_template_string(
        HTML,
        default_event_date=date.today().strftime("%B %-d, %Y")
        if os.name != "nt"
        else date.today().strftime("%B %d, %Y"),
        menu_url=MENU_URL,
    )


@app.post("/generate")
def generate() -> Response:
    event_date = (request.form.get("event_date") or "").strip()
    if not event_date:
        flash("Event date is required.")
        return redirect("/")

    count_raw = (request.form.get("count") or "200").strip()
    seed_raw = (request.form.get("seed") or "").strip()

    try:
        count = int(count_raw)
    except ValueError:
        flash("Number of cards must be a whole number.")
        return redirect("/")

    seed = None
    if seed_raw:
        try:
            seed = int(seed_raw)
        except ValueError:
            flash("Seed must be a whole number.")
            return redirect("/")

    qr_event_1 = (request.form.get("qr_event_1") or "").strip() or None
    qr_event_2 = (request.form.get("qr_event_2") or "").strip() or None

    text = (request.form.get("songs") or "").strip()
    uploaded = request.files.get("file")
    if uploaded and uploaded.filename:
        try:
            text = uploaded.read().decode("utf-8")
        except Exception:
            flash("Unable to read uploaded file as UTF-8 text.")
            return redirect("/")

    if not text.strip():
        flash("Provide a song list (paste text or upload a .txt file).")
        return redirect("/")

    parsed = parse_song_list_text(text)
    try:
        cards = generate_cards(
            unique_artists=parsed.unique_artists,
            unique_titles=parsed.unique_titles,
            count=count,
            seed=seed,
        )
    except Exception as e:
        flash(str(e))
        return redirect("/")

    logo_path = _find_logo()
    opts = RenderOptions(
        event_date=event_date,
        logo_path=logo_path,
        qr_event_1=qr_event_1,
        qr_event_2=qr_event_2,
        qr_menu=MENU_URL,
        show_card_id=True,
    )
    pdf_bytes = render_cards_pdf(cards, opts)

    filename_safe_date = "".join(c for c in event_date if c.isalnum() or c in (" ", "-", "_")).strip()
    filename_safe_date = filename_safe_date.replace(" ", "-") or "event"
    filename = f"music-bingo-{filename_safe_date}.pdf"

    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
