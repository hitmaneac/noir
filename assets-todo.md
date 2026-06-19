# ART / ASSET PRODUCTION LIST — *The Green Book*  ·  *updated 2026-06-18*

The game is **fully built and walkable** (all 16 scenes, both endings). This is
the **art punch-list** for what's still rough. Story bible: `story.md`. Scene
wiring + overall status: `roadmap.md`.

**Where art stands:** **all 16 scene backgrounds are real artwork** ✅. Remaining
art: hero + Vera have full sprites but the other 5 cast are **side-walk only**;
clue props are **tiny placeholders**.

> **Collision maps:** every scene's `area.png` (walkable floor + exit zones) is
> already authored and verified — keep it. Re-trace a floor (in-game editor, `E`)
> only if a repaint shifts the walkable layout. The scene11–16 floors were
> authored from the provided art's perspective and may want light fine-tuning.

---

## 1 — LOCATIONS (scene backgrounds `rooms/sceneN/back.png`) — ✅ DONE

**All 16 scene backgrounds are real artwork** and wired in (collision floors
authored per scene + verified). Nothing to draw here. If a scene is ever
**repainted with a shifted composition**, re-trace just that floor in the editor
(`E`). Per-scene character lighting (tint/brightness) is set via `charTint` in
`settings.js` — see `roadmap.md`.

---

## 2 — CHARACTERS & POSES (`characters/`)

### Hero & femme — DONE (rigged from real footage, full 8-way walk)
- **hatguy** = Elias Mores ✓  ·  **woman** = Vera ✓

### Cast NPCs — rigged from `*.mp4` but **side-walk only**
Each has a `_walk_sheet.png` where the **right** facing is just the left mirrored
and **front/back are placeholders copied from the side**. No diagonal `_sides`.

| Character | Role | Needs |
|---|---|---|
| **secretary** | Dot | real front + back frames; diagonal `_sides` sheet |
| **attorney** | Quist | real front + back frames; diagonal `_sides` sheet |
| **bartender** | Mickey | real front + back frames; diagonal `_sides` sheet |
| **cop** | Brandt | real front + back frames; diagonal `_sides` sheet |
| **thug** | Toranno | real front + back frames; diagonal `_sides` sheet |

> NPCs that just **stand and talk** only strictly need one clean idle frame
> facing the player. Full 8-way is only required if they walk on-screen.

- **sidekick** — rigged but **UNUSED** (Dot fills the confidant role). Drop or repurpose.

### Static "staged" poses (optional `pose:{src,w,h}` on a cast entry)
Make rooms feel lived-in instead of everyone standing mid-stride.

| Pose | Where | Status |
|---|---|---|
| **Dot sitting at her desk** | scene4 | `secretary_sit.png` EXISTS but is a 2.5 KB placeholder → repaint |
| Mickey behind the bar (polishing a glass) | scene5 | new |
| Brandt at his desk (seated / leaning back) | scene6 | new |
| Toranno seated at the card table | scene7 | new |
| Quist behind his desk | scene3 | new |
| Vera standing / smoking | scene4, scene8 | new |
| Dot standing at the cell | scene9 | optional (uses walk-idle now) |

---

## 3 — OBJECTS / PROPS (`objects/`)

### Pickups & clues — placeholders (tiny PNGs) → repaint
| File | What | Size |
|---|---|---|
| `greenbook.png` | the MacGuffin (the green book) | 496 B |
| `photo.png` | Vera's photo (Act I clue) | 763 B |
| `ticket.png` | pawn ticket (→ locker puzzle) | 996 B |
| `matchbook.png` | Pier 7 matchbook (locker clue) | 336 B |
| `body.png` | Finch's corpse (the docks) | 1.3 KB |

### Already real art — but currently **unreferenced**
- `gun.png`, `rose.png` — finished; wire into a scene or drop.

### Scenery objBlocks — ✅ cleaned up
The stale demo `objBlocks` (`fence.png` in scene3; `obj_chair.png` / `obj_locker.png`
in scene4) referenced missing files and have been **removed**. Furniture now lives
in the painted backgrounds. *(Nothing to do here.)*

---

## Priority order (suggested)
1. ~~Backgrounds~~ — ✅ all 16 real.
2. **NPC idle frames** + the **staged poses** (Dot/Mickey/Brandt/Toranno/Quist/Vera) — the biggest remaining gap (cast are side-walk only).
3. **The five clue pickups** (greenbook, photo, ticket, matchbook, body) — tiny placeholders.
4. **Per-scene character tint** (`charTint` in `settings.js`) so the hero/NPCs sit in each scene's light — quick once the values are dialed per room.
5. Full 8-way NPC walks only if/when an NPC needs to move on-screen.
