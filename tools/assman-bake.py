# Bakes sprites/assman masters to game-scale runtime PNGs (4x logical).
# Masters are hi-res with binary alpha already; this is downscale + re-harden.
#   python tools/assman-bake.py
from PIL import Image
import os
SRC = "sprites/assman"
OUT = "sprites/assman/baked"
TARGET_H = 232        # 58 logical * 4
POSES = { "idle": "ass-man.png" }
for k in ["flight","slam","kneel","clapwind","clap","hipcheck","toss","airclap","exhaust"]:
    POSES[k] = f"pose_{k}.png"
os.makedirs(OUT, exist_ok=True)
for name, f in POSES.items():
    im = Image.open(os.path.join(SRC, f)).convert("RGBA")
    w = max(1, round(im.width * TARGET_H / im.height))
    out = im.resize((w, TARGET_H), Image.LANCZOS)
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255 if a >= 128 else 0)
    out.save(os.path.join(OUT, f"{name}.png"))
    print(name, out.size)


# ---- Left-facing variants: mirror the sprite, then flip the chest-text ----
# box back so "ASS MAN" stays readable at facing -1. Boxes measured on the
# RIGHT-facing bakes (x0, y0, x1, y1 inclusive-exclusive-ish; padded).
TEXT_BOXES = {
    "idle":     (44, 48, 94, 88),
    "flight":   (86, 50, 136, 92),
    "slam":     (76, 106, 136, 160),
    "kneel":    (116, 54, 176, 114),
    "clapwind": (88, 44, 132, 85),
    "clap":     (49, 62, 89, 99),
    "hipcheck": (160, 44, 221, 100),
    "toss":     (61, 62, 101, 99),
    "airclap":  (70, 50, 110, 92),
    "exhaust":  (54, 40, 105, 88),
}
from PIL import Image as _I
for name in POSES:
    src = _I.open(os.path.join(OUT, f"{name}.png")).convert("RGBA")
    w = src.width
    left = src.transpose(_I.FLIP_LEFT_RIGHT)
    box = TEXT_BOXES.get(name)
    if box:
        x0, y0, x1, y1 = box
        # box coords in the mirrored image
        mx0, mx1 = w - x1, w - x0
        patch = left.crop((mx0, y0, mx1, y1)).transpose(_I.FLIP_LEFT_RIGHT)
        left.paste(patch, (mx0, y0))
    left.save(os.path.join(OUT, f"{name}_l.png"))
    print(name + "_l", left.size)
