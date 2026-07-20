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
