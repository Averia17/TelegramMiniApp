"""Build reviewable contact sheets from the full-frame Kaze sweep."""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "output" / "kaze-full-frame-qa"
TARGET = ROOT / "output" / "kaze-full-frame-qa-contact-sheets"
THUMB = 150
LABEL = 20
COLUMNS = 8


for clip_dir in sorted(path for path in SOURCE.iterdir() if path.is_dir()):
    images = sorted(clip_dir.glob("frame-*.png"))
    rows = (len(images) + COLUMNS - 1) // COLUMNS
    sheet = Image.new("RGB", (COLUMNS * THUMB, rows * (THUMB + LABEL)), (25, 32, 45))
    draw = ImageDraw.Draw(sheet)
    for index, image_path in enumerate(images):
        image = Image.open(image_path).convert("RGB")
        image.thumbnail((THUMB, THUMB))
        x = (index % COLUMNS) * THUMB + (THUMB - image.width) // 2
        y = (index // COLUMNS) * (THUMB + LABEL)
        sheet.paste(image, (x, y))
        draw.text(
            ((index % COLUMNS) * THUMB + 4, y + THUMB),
            image_path.stem.replace("frame-", "f"),
            fill="white",
        )
    TARGET.mkdir(parents=True, exist_ok=True)
    sheet.save(TARGET / f"{clip_dir.name}.png")
    print(clip_dir.name, len(images))
