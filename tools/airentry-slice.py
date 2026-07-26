# Slices a generated sprite STRIP into individual frames.
# Keys the ground first (flat or drawn-checkerboard), then splits on columns
# that carry no opaque pixels — component gaps, never fixed column widths,
# because the poses differ in width.
#   python tmp/slice-strip.py <strip.png> <out_prefix> <expected_count>
from PIL import Image
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib import import_module
ns = import_module("normalize_set") if False else None

from collections import deque
SAT_TOL, LUM_MIN = 26, 200


def key_ground(im):
    w, h = im.size
    px = im.load()
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


strip = key_ground(Image.open(sys.argv[1]).convert("RGBA"))
prefix, want = sys.argv[2], int(sys.argv[3])
w, h = strip.size
px = strip.load()

cols = [any(px[x, y][3] >= 16 for y in range(h)) for x in range(w)]
spans, run = [], None
for x, on in enumerate(cols):
    if on and run is None:
        run = x
    elif not on and run is not None:
        spans.append((run, x)); run = None
if run is not None:
    spans.append((run, w))

# Merge slivers (a stray paw pixel island) into the nearest real span.
spans = [s for s in spans if s[1] - s[0] > w * 0.02]
print(f"found {len(spans)} spans (want {want}): " + ", ".join(f"{a}-{b}" for a, b in spans))

os.makedirs(os.path.dirname(prefix) or ".", exist_ok=True)
for i, (a, b) in enumerate(spans[:want]):
    sub = strip.crop((a, 0, b, h))
    bb = sub.getchannel("A").point(lambda v: 255 if v >= 16 else 0).getbbox()
    sub.crop(bb).save(f"{prefix}{i}-raw.png")
    print(f"  {prefix}{i}-raw.png  {bb[2]-bb[0]}x{bb[3]-bb[1]}")
