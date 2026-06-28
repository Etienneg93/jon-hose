# Aseprite Workflow: Character Animation for Jon Hose

Focused on your actual pipeline: existing idle sprite → walk cycle + states → exported spritesheet.

---

## 1. Opening & Canvas Setup

**Import your existing sprite:**
- File → Open → select your Ass Man PNG
- If it opens too small: View → Zoom → pick 4× or 8× (or hit `+` key repeatedly)
- Edit → Preferences → Editor → check **Pixel Grid** on so you can see the grid

**Canvas size check:**
- Edit → Canvas Size — note your current W×H
- For Ass Man (~48–56px tall) keep the canvas at that height; width should be just the character bounding box
- Don't resize yet — get the idle frame right first

---

## 2. Palette Lock-In (Do This First)

Before animating, extract and lock the palette so every frame uses exactly the same colors.

1. Open the **Palette panel** (tab on right, or `F4`)
2. Click the palette menu (three lines) → **"Get palette from current sprite"**
3. Click menu again → **Save palette** → save as `assman-palette.aseprite-pal`
4. From now on: when drawing, only pick from this palette. Never use the color picker on the canvas.

**Why:** A stray off-palette pixel (1 value off from your navy blue) will show up as a different color once the game engine renders it at small scale.

---

## 3. Frame-Based Animation — the Core Concept

Aseprite treats each animation frame as a column in the timeline.

```
Timeline bottom panel:
[ Layer 1 ] [ F1 ][ F2 ][ F3 ][ F4 ][ F5 ]...
                ↑ idle  ↑ walk frames
```

- **Add a frame:** click the `+` in the timeline, or right-click a frame → Duplicate Frame
- **Delete a frame:** right-click → Remove Frame
- **Frame duration:** right-click a frame → Frame Properties → set ms (100ms = 10fps, 150ms = ~6fps)
- **Preview:** hit **Space** to play/stop the animation in the canvas

---

## 4. Walk Cycle: Step-by-Step

A 4-frame walk at 64px scale. Each frame = one phase of the stride.

### Frame Layout
```
F1: Contact    — lead foot hits ground, arms opposite
F2: Down       — body lowest, weight on front foot
F3: Passing    — feet together, body rises
F4: Up/Contact — opposite foot leads, body highest
```

For Ass Man at 48–56px you can get away with 4 frames. The cape adds complexity — treat it as a separate layer.

### Method: Duplicate and Modify

1. Right-click Frame 1 (your idle) → **Duplicate Frame** → now you have F1, F2
2. On F2: use the **Selection tool** (`M`) to select just the legs region → nudge pixels to shift weight
3. Repeat → Duplicate F2 → modify → Duplicate F3 → modify
4. On F4: duplicate F1, mirror the leg positions (if F1 lead leg is right, F4 leads left)

### What to Actually Move Per Frame (at this pixel scale)
- **Legs:** 2–4px shift per leg, one up/one down. At 48px height, leg travel is small.
- **Arms:** opposite to legs. 2–3px swing.
- **Body (torso):** subtle 1px up/down bob — F2 lowest, F4 highest.
- **Cape:** lags behind body motion by 1 frame. Copy the body position from the previous frame for the cape.
- **Head:** stays nearly still. Maybe 1px vertical bob.
- **"ASS MAN" text:** moves with the torso — easiest if it's on its own layer (see below).

---

## 5. Layers: How to Organize

Split the character into layers so you can edit parts independently.

**Recommended layer stack (top to bottom):**
```
[ Text — "ASS MAN" ]     ← separate so it auto-follows torso
[ Face / Head ]
[ Cape ]                  ← behind body, animates with lag
[ Body / Costume ]
[ Belt + Accessories ]
[ Legs ]
[ Background (locked) ]   ← grey bg, locked, never touched
```

To **create a layer:** bottom of Layers panel → click `+`
To **lock a layer:** click the lock icon next to it
To **move between layers:** click the layer name in the panel before drawing

**Tip:** You can merge layers down (`Ctrl+E`) before export. Keep them separate while animating.

---

## 6. Tags: Organizing Animation States

Tags label regions of your timeline by state name. This maps directly to how `assets.js` references frames.

**Create a tag:**
1. In the timeline, click+drag to select the frames for a state (e.g. F1–F4)
2. Right-click selection → **New Tag**
3. Name it to match the game's frame keys: `walk0`, `walk1`, `walk2`, `walk3`, or a tag named `walk`

**Recommended tags for Ass Man (minimum viable):**
```
idle        → 1–2 frames (idle breathing bob optional)
walk        → 4 frames (F1–F4)
attack-wind → 1–2 frames (wind-up pose, TBD)
attack-hit  → 1–2 frames (release pose, TBD)
hurt        → 1 frame (recoil)
```

Extend tags by right-clicking → Edit Tag.

---

## 7. Useful Tools for This Work

| Tool | Key | Use |
|------|-----|-----|
| Pencil | `B` | Main drawing tool — 1px hard edge |
| Eraser | `E` | Erase pixels |
| Selection (rect) | `M` | Select region to move/copy |
| Move selection | arrows | Nudge selected pixels 1px at a time |
| Bucket fill | `G` | Flood-fill a region (use with care on anti-aliased edges) |
| Eyedropper | `Alt`+click | Sample a color from canvas into active swatch |
| Symmetry | View → Symmetry Options | Mirror drawing horizontally — useful for symmetric costume parts |
| Onion Skin | `F3` | Shows previous/next frames ghosted — essential for animation |

**Onion Skin is the most important one.** Turn it on while animating walk frames — you'll see the ghost of the previous frame so you know exactly how much to move limbs.

---

## 8. Exporting the Spritesheet

When a state (or all states) is ready:

**File → Export Sprite Sheet**

Settings to use:
```
Sheet type:    By Rows  (or Packed — by rows is easier to debug)
Columns:       number of frames in walk cycle (e.g. 4)
Padding:       0 (the game doesn't use padding)
Trim:          OFF — keep consistent canvas size per frame
Output file:   sprites/assman/walk.png  (or assman-sheet.png)
```

Check **"Open generated sprite sheet"** to verify before saving.

**For individual frames** (if the game loads them separately like `walk0.png`):
- File → Export → check "Use tags" if you want per-tag files
- Or: manually select each frame, File → Export As → `walk0.png`, repeat

The existing game loads Quake Walker frames as individual PNGs (`walk0.png`, `walk1.png`, etc.) from `sprites/quake-frames.png` — match that pattern for Ass Man.

---

## 9. Quick Reference: Walk Cycle Checklist

```
[ ] Import idle frame, confirm palette
[ ] Save palette as assman-palette.aseprite-pal
[ ] Set up layers (cape, body, legs, text)
[ ] Turn on Onion Skin (F3)
[ ] Duplicate idle → F2, modify legs/arms
[ ] Duplicate F2 → F3, body at lowest/passing
[ ] Duplicate F3 → F4, opposite leg forward
[ ] Preview loop (Space) — check cape lag
[ ] Tag frames as "walk" (or walk0–walk3)
[ ] Add idle tag (1–2 frames)
[ ] Export sprite sheet → sprites/assman/
[ ] Add frame data to js/assets.js painter
```

---

## 10. Pixel Art Tips Specific to This Character

- **Cape physics:** The cape should trail by 1 frame — take the cape pixels from the *previous frame* when drawing the current one. Gives natural lag.
- **Gold regions (belt/boots/gloves):** These have high contrast. Keep the highlight pixel at the same relative position across all frames or it will shimmer distractingly.
- **Text stays put:** If "ASS MAN" is on its own layer, you only need to move it by the same ±1px as the torso bob. Don't redraw the text per frame.
- **Test at game resolution:** After export, open the PNG at 1× zoom in Aseprite (View → Zoom → 100%). This is how it looks in-game. Artifacts that are invisible at 8× become obvious at 1×.
- **4-frame walk is enough:** At game speed (60fps, switching frames every ~8–10 frames), 4 frames reads as smooth. Don't over-animate before the core loop is fun.
