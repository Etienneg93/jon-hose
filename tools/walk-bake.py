# Bakes a WALK-CYCLE strip, preserving the body bob.
#
# tools/airentry-bake.py trims every frame to its own bounding box and pastes it
# bottom-aligned. That is right for unrelated poses, but it FLATTENS a walk:
# the passing frames are drawn with the body raised, and bottom-aligning each
# one re-plants it on the baseline, throwing the bob away. (Measured on the
# first attempt: head row varied 2px out of 256 — half a logical pixel.)
#
# So this keeps ONE shared vertical window across every frame, taken from the
# strip's own common ground line. Frames differ in height only where the artist
# drew them differing, and ay is the shared ground row rather than each frame's
# own lowest pixel.
#
#   python tools/walk-bake.py <strip.png> <out_dir> <target_standing_h>
from PIL import Image
from collections import deque
import sys, os

SAT_TOL, LUM_MIN = 26, 200


def key_ground(im):
    """4-connected flood from the border over neutral-light pixels."""
    w, h = im.size
    px = im.load()
    if sum(1 for i in range(0, w * h, 997) if px[i % w, i // w][3] < 16) > (w * h // 997) * 0.05:
        return im                                   # already has real alpha
    seen = bytearray(w * h)
    q = deque()

    def ground(x, y):
        r, g, b, a = px[x, y]
        if a < 16:
            return True
        return (max(r, g, b) - min(r, g, b)) <= SAT_TOL and min(r, g, b) >= LUM_MIN

    for x in range(w):
        for y in (0, h - 1):
            if not seen[y * w + x] and ground(x, y):
                seen[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y * w + x] and ground(x, y):
                seen[y * w + x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and ground(nx, ny):
                seen[ny * w + nx] = 1; q.append((nx, ny))
    for i in range(w * h):
        if seen[i]:
            px[i % w, i // w] = (0, 0, 0, 0)
    return im


strip = key_ground(Image.open(sys.argv[1]).convert("RGBA"))
out_dir, target = sys.argv[2], int(sys.argv[3])
os.makedirs(out_dir, exist_ok=True)
w, h = strip.size
alpha = strip.getchannel("A").point(lambda v: 255 if v >= 128 else 0)

# Column spans -> one figure each.
cols = [any(alpha.getpixel((x, y)) for y in range(h)) for x in range(w)]
spans, run = [], None
for x, on in enumerate(cols):
    if on and run is None:
        run = x
    elif not on and run is not None:
        spans.append((run, x)); run = None
if run is not None:
    spans.append((run, w))
spans = [s for s in spans if s[1] - s[0] > w * 0.02]

boxes = [alpha.crop((a, 0, b, h)).getbbox() for a, b in spans]
ground = max(bb[3] for bb in boxes)          # the shared baseline the feet rest on
tallest = min(bb[1] for bb in boxes)         # highest head across the cycle = passing pose
scale = target / (ground - tallest)          # size the STANDING pose, so the bob survives as-is

print(f"{len(spans)} frames; ground row {ground}, tallest head {tallest}, scale {scale:.4f}")

win_h = ground - tallest
cw = max(int(round((b - a) * scale)) for a, b in spans) + 4
ch = int(round(win_h * scale))

for i, ((a, b), bb) in enumerate(zip(spans, boxes)):
    # SHARED vertical window: same top and bottom for every frame, so a raised
    # body stays raised instead of being re-planted on the baseline.
    sub = strip.crop((a + bb[0], tallest, a + bb[2], ground))
    sw = max(1, int(round(sub.width * scale)))
    sh = max(1, int(round(sub.height * scale)))
    sub = sub.resize((sw, sh), Image.LANCZOS)
    px = sub.load()
    for y in range(sh):
        for x in range(sw):
            r, g, b2, al = px[x, y]
            px[x, y] = (r, g, b2, 255) if al >= 128 else (0, 0, 0, 0)
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    canvas.paste(sub, ((cw - sw) // 2, ch - sh), sub)   # bottom = the shared ground row
    canvas.save(os.path.join(out_dir, f"walk{i}.png"))
    head = ch - sh
    print(f"  walk{i}: {cw}x{ch}  subject {sw}x{sh}  head at row {head}")
