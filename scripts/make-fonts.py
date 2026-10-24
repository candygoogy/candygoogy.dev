"""Builds the site's two web fonts from their upstream sources.

A maintainer tool: the build never runs it. Its output is committed to
src/fonts/, and astro.config.mjs serves those files from our domain.

    python scripts/make-fonts.py                # writes src/fonts/
    python scripts/make-fonts.py --opsz 60 --out .shots/fonts/opsz-60

Needs Python 3 with fontTools and brotli (pip install fonttools brotli).

Both families are under the SIL Open Font License 1.1, which allows
modifying and redistributing them; neither declares a Reserved Font Name,
so the subsets keep their names. The script stops if that ever changes.

Steps:
1. Download the variable TTFs and each family's OFL.txt from google/fonts
   at one pinned commit, and check every file against its pinned SHA-256.
2. Newsreader (headings): pin the optical size to one value (--opsz,
   default 36), limit the weight to 500..700. Upright only: the italics
   are a separate upstream file, never downloaded.
   Schibsted Grotesk (body and wordmark): limit the weight to 400 up to
   the wordmark's weight (--fw-heavy in src/styles/tokens.css).
3. Trim tnum to the digits 0-9 (upstream it also covers punctuation),
   subset both to Google Fonts' "latin" range plus EXTRA (codepoints this
   site and the experiments use beyond it), keep the default layout features plus
   tnum, pnum and lnum, and write WOFF2 next to a copy of the OFL text.

To move to a newer upstream build, change COMMIT and the hashes, rebuild,
and check the layout with the new files before committing them.
"""

import argparse
import hashlib
import io
import re
import sys
import urllib.request
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
COMMIT = "47d54ca1ebb14fd864695f1d39dc734f39017c33"  # google/fonts, 2026-10-16
RAW = f"https://raw.githubusercontent.com/google/fonts/{COMMIT}/"

# Google Fonts' "latin" subset.
LATIN = (
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC,"
    " U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193,"
    " U+2212, U+2215, U+FEFF, U+FFFD"
)
# Codepoints beyond LATIN, kept by whichever font has them. The same two
# files also serve the experiments (../experiments, a sibling repo),
# whose keyboard tester and compose map draw the arrows; LATIN has only
# the up and down ones. Schibsted Grotesk has all four, Newsreader none.
# This site's own text needs nothing more: the receipt marks (U+2713,
# U+26A0, U+2717) are in neither font. Each run scans both repos and warns
# about anything new.
EXTRA = "U+2190-2193"

FEATURES = Options._layout_features_default + ["tnum", "pnum", "lnum"]

FAMILIES = [
    {
        "name": "Newsreader",
        "src": "ofl/newsreader/Newsreader[opsz,wght].ttf",
        "sha256": "8a08d13f8a6c0d51be379a60af84f945f65369a67e509ee3c3bdcc421254d7c1",
        "license": "ofl/newsreader/OFL.txt",
        "license_sha256": "fdfad38143ec470553cae82a1e45320bdd1b9ec70415d37bd0171051d8a4ded8",
        "axes": lambda opsz: {"opsz": opsz, "wght": (500, 700)},
        "out": "Newsreader-Display.woff2",
        "out_license": "OFL-Newsreader.txt",
    },
    {
        "name": "Schibsted Grotesk",
        "src": "ofl/schibstedgrotesk/SchibstedGrotesk[wght].ttf",
        "sha256": "6ceeadf6be8e1fd7687011c7fa38ed0edd1abe967a0b73d97caec183552e823d",
        "license": "ofl/schibstedgrotesk/OFL.txt",
        "license_sha256": "3b4f3063b6ac7c1e403e2c4a5e8ef3a58190ff83ed7b15af66511858699139ce",
        "axes": lambda _opsz: {"wght": (400, 800)},
        "out": "SchibstedGrotesk.woff2",
        "out_license": "OFL-SchibstedGrotesk.txt",
    },
]


def parse_ranges(text):
    codepoints = set()
    for part in filter(None, (p.strip() for p in text.split(","))):
        lo, _, hi = part.removeprefix("U+").partition("-")
        codepoints.update(range(int(lo, 16), int(hi or lo, 16) + 1))
    return codepoints


def fetch(path, expected):
    url = RAW + path.replace("[", "%5B").replace("]", "%5D")
    error = None
    for _ in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as res:
                data = res.read()
            break
        except OSError as e:
            error = e
    else:
        sys.exit(f"make-fonts: could not download {path}: {error}")
    actual = hashlib.sha256(data).hexdigest()
    if actual != expected:
        sys.exit(f"make-fonts: {path} is not the pinned file (sha256 {actual})")
    return data


def check_license(name, text):
    # The OFL's own text defines the term; a family that reserves a name
    # declares it in the copyright lines above the license.
    head = text.split("This Font Software is licensed", 1)[0]
    if re.search(r"reserved\s+font\s+name", head, re.IGNORECASE):
        sys.exit(
            f"make-fonts: {name} declares a Reserved Font Name; a subset "
            "would have to be renamed. Stopping."
        )


def read_codepoints(found, base, patterns):
    for pattern in patterns:
        for file in base.glob(pattern):
            if "node_modules" in file.relative_to(base).parts or not file.is_file():
                continue
            found.update(map(ord, file.read_text(encoding="utf8", errors="replace")))


def site_codepoints():
    """Codepoints in this site's build and in the experiments repo."""
    found = set()
    built = ("**/*.html", "**/*.css", "**/*.js", "**/*.xml", "**/*.txt")
    if (ROOT / "dist").is_dir():
        read_codepoints(found, ROOT / "dist", built)
    else:
        print("make-fonts: note: no dist/ here (run npm run build); not scanned")
    experiments = (ROOT / ".." / "experiments").resolve()
    if experiments.is_dir():
        sources = ("*/src/**/*.ts", "*/src/**/*.html", "*/src/**/*.css")
        read_codepoints(found, experiments, sources)
        read_codepoints(found, experiments, tuple("*/dist/" + p for p in built))
    else:
        print(
            f"make-fonts: note: {experiments} is missing, so the experiments' "
            "codepoints were not scanned; check them before committing"
        )
    return found


def tnum_mappings(font):
    """Each single-substitution mapping reached from the tnum feature."""
    if "GSUB" not in font:
        return
    gsub = font["GSUB"].table
    for record in gsub.FeatureList.FeatureRecord:
        if record.FeatureTag != "tnum":
            continue
        for index in record.Feature.LookupListIndex:
            lookup = gsub.LookupList.Lookup[index]
            for sub in lookup.SubTable:
                if lookup.LookupType == 7:
                    sub = sub.ExtSubTable
                if getattr(sub, "LookupType", lookup.LookupType) != 1:
                    sys.exit(f"make-fonts: tnum uses lookup type {lookup.LookupType}")
                yield sub.mapping


def digits(font):
    cmap = font.getBestCmap()
    return {cmap[c] for c in range(0x30, 0x3A) if c in cmap}


def tnum_digits_only(font):
    # Schibsted Grotesk's tnum also swaps , . : ; # % for tabular forms, and
    # the site sets tabular-nums on lines of words ("Full-time, Feb 2026"),
    # where a tabular comma stands apart. Keep 0-9 only. Done before the
    # subset, so the tabular punctuation it no longer reaches is dropped.
    keep = digits(font)
    for mapping in tnum_mappings(font):
        for glyph in [g for g in mapping if g not in keep]:
            del mapping[glyph]


def check_tnum(font, name):
    keep = digits(font)
    extra = sorted({g for m in tnum_mappings(font) for g in m} - keep)
    if extra:
        sys.exit(f"make-fonts: {name} tnum still maps non-digits: {extra}")


def build(family, opsz, out_dir, wanted, used):
    font = TTFont(
        io.BytesIO(fetch(family["src"], family["sha256"])), recalcTimestamp=False
    )
    license_text = fetch(family["license"], family["license_sha256"])
    check_license(family["name"], license_text.decode("utf8"))

    font = instancer.instantiateVariableFont(font, family["axes"](opsz))

    cmap = font.getBestCmap()
    missed = sorted(c for c in used - wanted if c in cmap)
    if missed:
        print(
            f"make-fonts: warning: {family['name']} has site codepoints outside "
            "the subset: " + ", ".join(f"U+{c:04X}" for c in missed)
        )

    options = Options()
    options.layout_features = FEATURES
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    subsetter = Subsetter(options)
    tnum_digits_only(font)
    subsetter.populate(unicodes=wanted)
    subsetter.subset(font)
    check_tnum(font, family["name"])

    out = out_dir / family["out"]
    # fontTools' stubs type flavor as None; "woff2" is its documented value.
    font.flavor = "woff2"  # pyright: ignore[reportAttributeAccessIssue]
    font.save(out)
    (out_dir / family["out_license"]).write_bytes(license_text)
    print(f"make-fonts: {out} {out.stat().st_size} B")


def main():
    parser = argparse.ArgumentParser(description=(__doc__ or "").split("\n", 1)[0])
    parser.add_argument("--opsz", type=float, default=36, help="Newsreader optical size")
    parser.add_argument("--out", type=Path, default=ROOT / "src" / "fonts")
    args = parser.parse_args()

    out_dir = args.out if args.out.is_absolute() else ROOT / args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    wanted = parse_ranges(LATIN) | parse_ranges(EXTRA)
    used = site_codepoints()
    for family in FAMILIES:
        build(family, args.opsz, out_dir, wanted, used)


main()
