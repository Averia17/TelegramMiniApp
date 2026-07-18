from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "assets" / "heroes"
SOURCE = ASSETS / "hero-atlas.png"
NAMES = [
    "blaze",
    "frost",
    "viper",
    "titan",
    "shadow",
    "spark",
    "nova",
    "rex",
    "pixel",
    "boulder",
]


def main():
    atlas = Image.open(SOURCE).convert("RGBA")
    cell_width = atlas.width / 5
    cell_height = atlas.height / 2
    for index, name in enumerate(NAMES):
        column = index % 5
        row = index // 5
        pad = 8
        box = (
            round(column * cell_width) + pad,
            round(row * cell_height) + pad,
            round((column + 1) * cell_width) - pad,
            round((row + 1) * cell_height) - pad,
        )
        sprite = atlas.crop(box)
        alpha_box = sprite.getchannel("A").getbbox()
        if alpha_box:
            sprite = sprite.crop(alpha_box)
        sprite.thumbnail((360, 460), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (384, 480))
        canvas.alpha_composite(sprite, ((384 - sprite.width) // 2, 470 - sprite.height))
        canvas.save(ASSETS / f"{name}.png", optimize=True)


if __name__ == "__main__":
    main()
