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
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from spritekey import key_ground, enclosed_ground_kill, cull_strays


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
    # BOTH passes: cull_strays drops a neighbour's fragment left by a span
    # split; enclosed_ground_kill drops background trapped BETWEEN his legs,
    # which the border flood can never reach. Omitting the latter is exactly
    # how a walk frame shipped with 219px of grey stuck between the boots.
    sub = cull_strays(sub, label=f"walk{i}: ")
    sub = enclosed_ground_kill(sub, label=f"walk{i}: ")
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    canvas.paste(sub, ((cw - sw) // 2, ch - sh), sub)   # bottom = the shared ground row
    canvas.save(os.path.join(out_dir, f"walk{i}.png"))
    head = ch - sh
    print(f"  walk{i}: {cw}x{ch}  subject {sw}x{sh}  head at row {head}")
