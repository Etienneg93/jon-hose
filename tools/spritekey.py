# Shared background-keying passes for generated sprite art.
#
# These live here because tools/airentry-bake.py and tools/walk-bake.py both
# need them and DIVERGED once already: walk-bake.py was written without
# enclosed_ground_kill and shipped a walk frame with 219px of background
# trapped between the legs — the same defect airentry-bake.py had already been
# fixed for. Import from here rather than copying a pass into a third tool.
from collections import deque

SAT_TOL = 26      # max channel spread still counted as "neutral"
LUM_MIN = 200     # min brightness for a neutral pixel to be ground


def key_ground(im):
    """Flood the background in from the borders, 4-connected.

    Handles both flat grounds and the checkerboard gpt-image-2 paints when
    asked for transparency. 4-connected (not global colour matching) so white
    fur, white shirts and pale skin enclosed by outline are never eaten.
    """
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


def enclosed_ground_kill(im, min_frac=0.002, label=""):
    """Kill background pockets the border flood cannot reach.

    A 4-connected flood cannot enter a region the subject encloses — between
    the legs, between an arm and the torso. Background and light artwork
    separate on NEUTRALITY, not brightness: this generator's ground is
    perfectly grey (channel spread 0-1) while painted whites are warm
    (251,247,237 / 231,222,209 — spread 8-22). Only strictly neutral
    components above min_frac of the canvas die, so small pure-white
    highlights survive.
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
        print(f"    {label}enclosed ground killed: {killed}px")
    return im


def cull_strays(im, frac=0.03, label=""):
    """Drop disconnected fragments — a neighbouring figure's boot tip left at a
    split edge, or specks from the key. Keeps only bodies >= frac of the largest."""
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
        print(f"    {label}culled {killed}px of fragments")
    return im
