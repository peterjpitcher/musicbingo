from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Iterable

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas

from PIL import Image

from .generator import Card
from .qr import make_qr_png_bytes


@dataclass(frozen=True)
class RenderOptions:
    event_date: str
    logo_path: Path | None
    qr_event_1: str | None
    qr_event_2: str | None
    qr_menu: str
    show_card_id: bool = True


def _load_logo_bw(path: Path) -> Image.Image:
    img = Image.open(path).convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    bg.alpha_composite(img)
    gray = bg.convert("L")
    bw = gray.point(lambda p: 0 if p < 200 else 255, mode="1")
    return bw.convert("RGB")


def _draw_wrapped_text(
    canvas: Canvas,
    text: str,
    *,
    x: float,
    y: float,
    w: float,
    h: float,
    font_name: str = "Helvetica",
    font_size: float = 9,
    min_font_size: float = 6,
    leading_ratio: float = 1.15,
) -> None:
    # Very small, reliable wrapper/shrinker for cell text.
    words = text.split()
    if not words:
        return

    def wrap_lines(size: float) -> list[str]:
        lines: list[str] = []
        current: list[str] = []
        for word in words:
            trial = (" ".join(current + [word])).strip()
            if canvas.stringWidth(trial, font_name, size) <= w:
                current.append(word)
                continue
            if current:
                lines.append(" ".join(current))
                current = [word]
            else:
                # Single very long token; hard cut.
                cut = word
                while cut and canvas.stringWidth(cut + "…", font_name, size) > w:
                    cut = cut[:-1]
                lines.append((cut + "…") if cut else "…")
                current = []
        if current:
            lines.append(" ".join(current))
        return lines

    size = font_size
    lines = wrap_lines(size)
    while size > min_font_size:
        line_height = size * leading_ratio
        if len(lines) * line_height <= h:
            break
        size -= 0.5
        lines = wrap_lines(size)

    line_height = size * leading_ratio
    if len(lines) * line_height > h:
        # Truncate to fit available lines.
        max_lines = max(1, int(h // line_height))
        lines = lines[:max_lines]
        if lines:
            last = lines[-1]
            while last and canvas.stringWidth(last + "…", font_name, size) > w:
                last = last[:-1]
            lines[-1] = (last + "…") if last else "…"

    canvas.setFont(font_name, size)
    total_h = len(lines) * line_height
    start_y = y + (h - total_h) / 2 + (total_h - line_height)  # top line baseline
    for i, line in enumerate(lines):
        canvas.drawCentredString(x + w / 2, start_y - i * line_height, line)


def _draw_grid(
    canvas: Canvas,
    items: Iterable[str],
    *,
    x: float,
    y: float,
    size: float,
    title: str,
) -> None:
    canvas.setStrokeColorRGB(0, 0, 0)
    canvas.setLineWidth(1)

    canvas.setFont("Helvetica-Bold", 11)
    canvas.drawString(x, y + size + 6, title)

    cell = size / 5.0
    canvas.rect(x, y, size, size, stroke=1, fill=0)
    for i in range(1, 5):
        canvas.line(x + i * cell, y, x + i * cell, y + size)
        canvas.line(x, y + i * cell, x + size, y + i * cell)

    items_list = list(items)
    for idx, text in enumerate(items_list[:25]):
        row = idx // 5
        col = idx % 5
        cx = x + col * cell
        cy = y + (4 - row) * cell  # top row first
        padding = 2
        _draw_wrapped_text(
            canvas,
            text,
            x=cx + padding,
            y=cy + padding,
            w=cell - 2 * padding,
            h=cell - 2 * padding,
            font_size=9,
        )


def render_cards_pdf(cards: list[Card], opts: RenderOptions) -> bytes:
    buf = BytesIO()
    canvas = Canvas(buf, pagesize=A4)
    page_w, page_h = A4

    margin_x = 14 * mm
    margin_y = 12 * mm
    gap = 6 * mm
    header_h = 34 * mm
    footer_h = 38 * mm

    square_size = (page_h - 2 * margin_y - header_h - footer_h - gap) / 2
    square_size = min(square_size, page_w - 2 * margin_x)

    content_x = (page_w - square_size) / 2
    top_grid_y = page_h - margin_y - header_h - square_size
    bottom_grid_y = top_grid_y - gap - square_size

    def draw_logo_and_header() -> None:
        header_top = page_h - margin_y
        y0 = header_top - header_h

        if opts.logo_path and opts.logo_path.exists():
            try:
                logo = _load_logo_bw(opts.logo_path)
                img = ImageReader(logo)
                # Fit into header height while keeping aspect ratio.
                max_h = header_h * 0.65
                max_w = page_w - 2 * margin_x
                iw, ih = img.getSize()
                scale = min(max_w / iw, max_h / ih)
                draw_w = iw * scale
                draw_h = ih * scale
                canvas.drawImage(
                    img,
                    (page_w - draw_w) / 2,
                    y0 + header_h - draw_h,
                    width=draw_w,
                    height=draw_h,
                    preserveAspectRatio=True,
                )
            except Exception:
                canvas.setFont("Helvetica-Bold", 18)
                canvas.drawCentredString(page_w / 2, y0 + header_h * 0.65, "MUSIC BINGO")
        else:
            canvas.setFont("Helvetica-Bold", 18)
            canvas.drawCentredString(page_w / 2, y0 + header_h * 0.65, "MUSIC BINGO")

        canvas.setFont("Helvetica-Bold", 12)
        canvas.drawCentredString(page_w / 2, y0 + header_h * 0.22, opts.event_date)

    def draw_footer() -> None:
        footer_y0 = margin_y
        qr_size = 26 * mm
        block_w = (page_w - 2 * margin_x) / 3

        def draw_qr_block(ix: int, label: str, url: str | None) -> None:
            cx0 = margin_x + ix * block_w
            cx = cx0 + (block_w - qr_size) / 2
            cy = footer_y0 + (footer_h - qr_size - 10) / 2 + 10

            canvas.setFont("Helvetica", 9)
            canvas.drawCentredString(cx0 + block_w / 2, footer_y0 + 10, label)

            if not url:
                canvas.rect(cx, cy, qr_size, qr_size, stroke=1, fill=0)
                canvas.setFont("Helvetica", 7)
                canvas.drawCentredString(cx0 + block_w / 2, cy + qr_size / 2, "QR unavailable")
                return

            png = make_qr_png_bytes(url)
            img = ImageReader(BytesIO(png))
            canvas.drawImage(img, cx, cy, width=qr_size, height=qr_size, mask="auto")

        draw_qr_block(0, "Event QR 1", opts.qr_event_1)
        draw_qr_block(1, "Event QR 2", opts.qr_event_2)
        draw_qr_block(2, "Menu", opts.qr_menu)

    for i, card in enumerate(cards, start=1):
        draw_logo_and_header()

        _draw_grid(canvas, card.artists, x=content_x, y=top_grid_y, size=square_size, title="Artists")
        _draw_grid(canvas, card.titles, x=content_x, y=bottom_grid_y, size=square_size, title="Song Titles")

        draw_footer()

        if opts.show_card_id:
            canvas.setFont("Helvetica", 8)
            canvas.drawRightString(page_w - margin_x, margin_y - 2, f"Card {i:03d} • {card.card_id}")

        canvas.showPage()

    canvas.save()
    return buf.getvalue()
