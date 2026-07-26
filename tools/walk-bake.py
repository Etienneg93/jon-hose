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


def cull_strays(im, frac=0.03):
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    comps = []
    for sy in range(h):
        for sx in range(w):
            if seen[sy * w + sx] or px[sx, sy][3] < 128:
                continue
            q = deque([(sx, sy)]); seen[sy * w + sx] = 1; cells = []
            while q:
                x, y = q.popleft(); cells.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny][3] >= 128:
                        seen[ny * w + nx] = 1; q.append((nx, ny))
            comps.append(cells)
    if len(comps) < 2:
        return im
    comps.sort(key=len, reverse=True)
    floor = len(comps[0]) * frac
    killed = 0
    for c in comps[1:]:
        if len(c) < floor:
            for x, y in c:
                px[x, y] = (0, 0, 0, 0)
            killed += len(c)
    if killed:
        print(f"    culled {killed}px of neighbouring-figure fragments")
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

# Poses that reach sideways (a boot thrown forward) can TOUCH the next figure,
# merging two into one span. If we are short, split the widest span at its
# thinnest column — the waist between two figures always carries far fewer
# opaque pixels than either body.
want = int(sys.argv[4]) if len(sys.argv) > 4 else len(spans)
def density(x):
    return sum(1 for y in range(h) if alpha.getpixel((x, y)))
while len(spans) < want:
    i = max(range(len(spans)), key=lambda k: spans[k][1] - spans[k][0])
    a, b = spans[i]
    inset = int((b - a) * 0.25)          # never split at the very edge of a body
    lo, hi = a + inset, b - inset
    if hi <= lo:
        break
    cut = min(range(lo, hi), key=density)
    print(f"  merged span {a}-{b} split at {cut} (density {density(cut)})")
    spans[i:i + 1] = [(a, cut), (cut, b)]
    spans.sort()

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
    # Splitting a merged span can leave a sliver of the NEIGHBOURING figure at
    # the cut edge (a boot tip, typically). Keep only the largest connected
    # body; anything under 3% of it is a fragment, not this pose.
    sub = cull_strays(sub)
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    canvas.paste(sub, ((cw - sw) // 2, ch - sh), sub)   # bottom = the shared ground row
    canvas.save(os.path.join(out_dir, f"walk{i}.png"))
    head = ch - sh
    print(f"  walk{i}: {cw}x{ch}  subject {sw}x{sh}  head at row {head}")
