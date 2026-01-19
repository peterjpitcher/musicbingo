from pathlib import Path

from music_bingo.core.generator import generate_cards
from music_bingo.core.pdf import RenderOptions, render_cards_pdf


def test_render_cards_pdf_produces_pdf_bytes(tmp_path: Path):
    artists = [f"Artist {i}" for i in range(30)]
    titles = [f"Song {i}" for i in range(30)]
    cards = generate_cards(unique_artists=artists, unique_titles=titles, count=2, seed=1)

    opts = RenderOptions(
        event_date="May 1st 2026",
        logo_path=None,
        qr_event_1=None,
        qr_event_2=None,
        qr_menu="https://vip-club.uk/vvjkz0",
        show_card_id=True,
    )
    pdf = render_cards_pdf(cards, opts)
    assert pdf.startswith(b"%PDF-")

