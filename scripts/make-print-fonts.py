#!/usr/bin/env python3
"""
Rebuilds the print kit's Noto Sans Arabic and Noto Sans Hebrew files, regular and bold,
from Google's variable fonts. Run by hand only: nothing in the tests or the build runs it,
and it fetches nothing. Give it the variable files, downloaded by you from
https://github.com/google/fonts (ofl/notosansarabic/NotoSansArabic[wdth,wght].ttf and
ofl/notosanshebrew/NotoSansHebrew[wdth,wght].ttf), and the folder to write to:

    pip install fonttools==4.60.1
    python3 -I scripts/make-print-fonts.py \
        --arabic 'NotoSansArabic[wdth,wght].ttf' --hebrew 'NotoSansHebrew[wdth,wght].ttf' \
        --out apps/web/src/features/print-kit/fonts/noto

Each font is instanced at wdth 100 and wght 400 (Regular) or 700 (Bold), then subset to
the code points the shipped regular already has (so a rebuild never adds or drops a
letter), every layout feature kept, no hinting. The bold's names, style bits and weight
say Bold. The regulars it writes match the shipped ones in size; they differ in a few
bytes (the head table's dates and checksums), so they are written only with --regulars.
"""
import argparse
import os
import sys

FONTTOOLS = "4.60.1"

try:
    import fontTools
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
except ImportError:
    sys.exit(f"fontTools is needed: pip install fonttools=={FONTTOOLS}")

if fontTools.version != FONTTOOLS:
    sys.exit(f"This was written against fontTools {FONTTOOLS}; found {fontTools.version}. Install that version to rebuild.")

FAMILIES = {"arabic": ("Noto Sans Arabic", "NotoSansArabic"), "hebrew": ("Noto Sans Hebrew", "NotoSansHebrew")}
WEIGHTS = {"Regular": 400, "Bold": 700}


def name_as(font: TTFont, family: str, postscript: str, style: str) -> None:
    """The names, style bits and weight class for the style: Mac-platform names, which still say the variable font's, are dropped."""
    names = font["name"]
    version = names.getDebugName(5) or ""
    # The family and style names are set afresh, in English only: the variable font's own may name a default instance (Thin).
    names.names = [record for record in names.names if record.platformID == 3 and record.nameID not in (1, 2, 3, 4, 6, 16, 17)]
    names.setName(family, 1, 3, 1, 0x409)
    names.setName(style, 2, 3, 1, 0x409)
    names.setName(f"{version.replace('Version ', '')};GOOG;{postscript}-{style}", 3, 3, 1, 0x409)
    names.setName(f"{family} {style}", 4, 3, 1, 0x409)
    names.setName(f"{postscript}-{style}", 6, 3, 1, 0x409)
    os2 = font["OS/2"]
    os2.usWeightClass = WEIGHTS[style]
    bold = style == "Bold"
    # fsSelection: bit 5 bold, bit 6 regular. head.macStyle: bit 0 bold.
    os2.fsSelection = (os2.fsSelection & ~((1 << 5) | (1 << 6))) | ((1 << 5) if bold else (1 << 6))
    font["head"].macStyle = (font["head"].macStyle & ~1) | (1 if bold else 0)


def build(source: str, shipped_regular: str, family: str, postscript: str, style: str, out: str) -> None:
    codes = sorted(TTFont(shipped_regular).getBestCmap().keys())
    variable = TTFont(source)
    location = {"wght": WEIGHTS[style]}
    if any(axis.axisTag == "wdth" for axis in variable["fvar"].axes):
        location["wdth"] = 100
    font = instancer.instantiateVariableFont(variable, location, updateFontNames=False)
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.glyph_names = False
    options.hinting = False
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=codes)
    subsetter.subset(font)
    name_as(font, family, postscript, style)
    font.save(out)
    print(f"{out}: {len(font.getGlyphOrder())} glyphs, {len(font.getBestCmap())} code points")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--arabic", required=True, help="NotoSansArabic[wdth,wght].ttf from google/fonts")
    parser.add_argument("--hebrew", required=True, help="NotoSansHebrew[wdth,wght].ttf from google/fonts")
    parser.add_argument("--out", required=True, help="the print kit's fonts/noto folder")
    parser.add_argument("--regulars", action="store_true", help="write the regulars too (they are already shipped)")
    args = parser.parse_args()
    for key, source in (("arabic", args.arabic), ("hebrew", args.hebrew)):
        family, postscript = FAMILIES[key]
        regular = os.path.join(args.out, f"{postscript}-Regular.ttf")
        if not os.path.exists(regular):
            sys.exit(f"{regular} is not there: --out must be the folder holding the shipped regulars, whose letters the subset keeps.")
        styles = ["Regular", "Bold"] if args.regulars else ["Bold"]
        # The bold first: it is subset to the shipped regular's letters, which a rebuilt regular keeps the same.
        for style in reversed(styles):
            build(source, regular, family, postscript, style, os.path.join(args.out, f"{postscript}-{style}.ttf"))


if __name__ == "__main__":
    main()
