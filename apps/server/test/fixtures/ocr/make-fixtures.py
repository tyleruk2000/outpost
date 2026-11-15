"""
Draws the pictures of text that the OCR tests read. Run once; the results are committed.

    python3 make-fixtures.py        (needs Pillow 10.1 or newer)

The typeface is Aileron, which Pillow carries and which is in the public domain (CC0).
The tests assert on what the OCR engine really returns for these exact files, so if
they are regenerated the expectations in ocr.test.ts must be checked again.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
FONT = ImageFont.load_default(size=44)


def page(lines: list[str]) -> Image.Image:
    """A 900 by 300 greyscale picture: about a third of a page at 150 dots per inch."""
    image = Image.new("L", (900, 300), 255)
    draw = ImageDraw.Draw(image)
    for index, line in enumerate(lines):
        draw.text((50, 40 + index * 76), line, fill=0, font=FONT)
    return image


first = page(["Boil water for one minute", "Store ten litres per person", "Keep matches in a dry tin"])
second = page(["Signal the bridge at dawn", "Carry rope and a lantern"])

# One bit per pixel, as a fax or a black-and-white scan would be.
first.convert("1").save(HERE / "scan-first.png", optimize=True)
second.convert("1").save(HERE / "scan-second.png", optimize=True)
# Greyscale JPEG, as a photograph of a page would be.
first.save(HERE / "scan-first.jpg", quality=60)
first.save(HERE / "scan-first.gif")
first.save(HERE / "scan-first.webp", quality=60)
