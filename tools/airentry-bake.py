# Normalizes a generated frame SET to a shared game canvas.
#
# Pipeline (matches the project's documented art path):
#   1. border flood key   — kills flat-white AND drawn-checkerboard grounds
#                           (4-connected from the edges, so enclosed white fur
#                           / white costume never gets eaten)
#   2. slab-kill          — neutral-light pixels left touching transparency
#   3. colour bleed       — push opaque RGB into transparent neighbours so the
#                           LANCZOS pass cannot pull halos out of dead pixels
#   4. ONE scale for the whole set, derived from the anchor frame's bbox, so
#      poses keep their relative size (a raised leg must not rescale the dog)
#   5. common canvas, feet on the bottom row, horizontally centred
#   6. LANCZOS downscale + binary alpha at >= 128
#
#   python tmp/normalize-set.py <target_h> <anchor.png> <out_dir> <in1.png> [in2.png ...]
from PIL import Image
from collections import deque
import sys, os

SAT_TOL = 26      # max channel spread still counted as "neutral"
LUM_MIN = 200     # min brightness for a neutral pixel to be ground
BLEED_PASSES = 3


def key_ground(im):
    """4-connected flood from the border over neutral-light pixels."""
    w, h = im.size
    px = im.load()
    if sum(1 for i in range(0, w * h, 997) if px[i % w, i // w][3] < 16) > (w * h // 997) * 0.05:
        return im  # already has real alpha — leave it alone

    seen = bytearray(w * h)
    q = deque()

    def is_ground(x, y):
        r, g, b, a = px[x, y]
        if a < 16:
            return True
        return (max(r, g, b) - min(r, g, b) <= SAT_TOL) and min(r, g, b) >= LUM_MIN

    for x in range(w):
        for y in (0, h - 1):
            if not seen[y * w + x] and is_ground(x, y):
                seen[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y * w + x] and is_ground(x, y):
                seen[y * w + x] = 1; q.append((x, y))

    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and is_ground(nx, ny):
                seen[ny * w + nx] = 1; q.append((nx, ny))

    for i in range(w * h):
        if seen[i]:
            px[i % w, i // w] = (0, 0, 0, 0)
    return im


def enclosed_ground_kill(im, min_frac=0.002):
    """Kill background pockets the border flood cannot reach.

    A 4-connected flood from the edges cannot enter a region enclosed by the
    subject (between the legs and belly, or between an arm and the torso), so
    generated-checkerboard ground survives there as an opaque slab.

    Background and white fur separate on NEUTRALITY, not brightness: this
    generator's ground is perfectly grey (channel spread 0-1) while the art's
    white fur is warm (251,247,237 / 231,222,209 — spread 8-22). Only strictly
    neutral components larger than min_frac of the canvas die, so small pure
    white fur highlights survive.
    """
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    floor = int(w * h * min_frac)
    killed = 0

    def neutral_light(x, y):
        r, g, b, a = px[x, y]
        return a >= 16 and (max(r, g, b) - min(r, g, b)) <= 3 and min(r, g, b) >= 200

    for sy in range(h):
        for sx in range(w):
            if seen[sy * w + sx] or not neutral_light(sx, sy):
                continue
            comp, q = [], deque([(sx, sy)])
            seen[sy * w + sx] = 1
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and neutral_light(nx, ny):
                        seen[ny * w + nx] = 1
                        q.append((nx, ny))
            if len(comp) >= floor:
                for x, y in comp:
                    px[x, y] = (0, 0, 0, 0)
                killed += len(comp)
    if killed:
        print(f"    enclosed ground killed: {killed}px")
    return im


def slab_kill(im):
    """Neutral-light pixels adjacent to transparency are leftover ground."""
    w, h = im.size
    px = im.load()
    doomed = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 16:
                continue
            if (max(r, g, b) - min(r, g, b) <= SAT_TOL) and min(r, g, b) >= LUM_MIN:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < w and 0 <= ny < h) or px[nx, ny][3] < 16:
                        doomed.append((x, y)); break
    for x, y in doomed:
        px[x, y] = (0, 0, 0, 0)
    return im


def bleed(im, passes=BLEED_PASSES):
    w, h = im.size
    px = im.load()
    for _ in range(passes):
        add = []
        for y in range(h):
            for x in range(w):
                if px[x, y][3] >= 16:
                    continue
                acc = [0, 0, 0]; n = 0
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        r, g, b, a = px[nx, ny]
                        if a >= 16:
                            acc[0] += r; acc[1] += g; acc[2] += b; n += 1
                if n:
                    add.append((x, y, acc[0] // n, acc[1] // n, acc[2] // n))
        if not add:
            break
        for x, y, r, g, b in add:
            px[x, y] = (r, g, b, 8)   # near-zero alpha: colour only, invisible
    return im


def bbox(im):
    b = im.getchannel("A").point(lambda a: 255 if a >= 16 else 0).getbbox()
    return b or (0, 0, im.size[0], im.size[1])


target_h = int(sys.argv[1])
anchor = sys.argv[2]
out_dir = sys.argv[3]
inputs = sys.argv[4:]
os.makedirs(out_dir, exist_ok=True)

prepped = {}
for f in inputs:
    im = Image.open(f).convert("RGBA")
    print(f"  {os.path.basename(f)}")
    # enclosed_ground_kill runs AFTER the border flood (it only has to consider
    # what the flood could not reach) and BEFORE bleed (which would smear the
    # slab's colour outward and hide it).
    im = bleed(slab_kill(enclosed_ground_kill(key_ground(im))))
    prepped[f] = (im, bbox(im))

# ONE scale for the whole set, from the anchor frame's subject height.
ab = prepped[anchor][1]
scale = target_h / (ab[3] - ab[1])

# Common canvas: widest scaled subject, tallest scaled subject.
cw = max(int(round((b[2] - b[0]) * scale)) for _, b in prepped.values())
ch = max(int(round((b[3] - b[1]) * scale)) for _, b in prepped.values())
cw += 4  # breathing room so no frame clips at the edge

for f in inputs:
    im, b = prepped[f]
    sub = im.crop(b)
    sw = max(1, int(round(sub.width * scale)))
    sh = max(1, int(round(sub.height * scale)))
    sub = sub.resize((sw, sh), Image.LANCZOS)
    px = sub.load()
    for y in range(sh):
        for x in range(sw):
            r, g, b2, a = px[x, y]
            px[x, y] = (r, g, b2, 255) if a >= 128 else (0, 0, 0, 0)
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    canvas.paste(sub, ((cw - sw) // 2, ch - sh), sub)   # feet on the bottom row
    name = os.path.basename(f).replace("-raw", "")
    canvas.save(os.path.join(out_dir, name))
    print(f"{name}  {cw}x{ch}  (subject {sw}x{sh})")
