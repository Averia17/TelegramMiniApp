"""Build labeled full-frame Mandy QA contact sheets from rendered PNGs."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("expected frames-dir contact-sheet-dir")
    frames_dir = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default()
    for clip_dir in sorted(path for path in frames_dir.iterdir() if path.is_dir()):
        files = sorted(clip_dir.glob("frame-*.png"))
        if not files:
            continue
        tile_w, tile_h, label_h = 160, 160, 20
        columns = 10
        rows = (len(files) + columns - 1) // columns
        sheet = Image.new(
            "RGB", (columns * tile_w, rows * (tile_h + label_h)), (18, 24, 36)
        )
        draw = ImageDraw.Draw(sheet)
        for index, path in enumerate(files):
            image = Image.open(path).convert("RGB")
            image.thumbnail((tile_w - 4, tile_h - 4), Image.Resampling.LANCZOS)
            x = (index % columns) * tile_w + (tile_w - image.width) // 2
            y = (index // columns) * (tile_h + label_h) + (tile_h - image.height) // 2
            sheet.paste(image, (x, y))
            label_x = (index % columns) * tile_w + 4
            label_y = (index // columns) * (tile_h + label_h) + tile_h
            draw.text(
                (label_x, label_y),
                path.stem.replace("frame-", "f"),
                fill="white",
                font=font,
            )
        output = output_dir / f"{clip_dir.name}-full-contact-sheet.jpg"
        sheet.save(output, quality=92, optimize=True)
        print(output)


if __name__ == "__main__":
    main()
