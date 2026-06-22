# ROADMAP — *The Green Book*

A noir point-and-click. Story bible: **`story.md`**. Engine: **`js/engine.js`** (vanilla JS, zero build step). Rooms are **scenes** (`rooms/sceneN/`).

---

## Status (where we are)  ·  *last updated 2026-06-18*

**TL;DR** — The full **3-act story is playable end-to-end across all 16 scenes**,
walkable scene-to-scene via the exit system, with both endings. **All 16 scene
backgrounds are now real artwork.** What remains is **character art** (NPC sprites
are side-walk only; clue props are placeholder) and the **production/packaging
pass** before shipping. See `assets-todo.md` for the art punch-list. Session state
(scene / character / rain / clouds / sky) persists across reloads.

**Engine — done**
- 8-direction walk engine, A* click-to-walk, run, per-character sprite metadata.
- **Non-linear scene transitions** — `exitTo`/`backTo` + **multi-door `exits` component map** (see below); depth-sorted `objBlocks` scenery.
- **Dialog system** with per-line staging, display names (`label`, `heroName`), **branching `{choice}`** + **persisted story flags** (`Nooir.story`/`setFlag`/`getFlag`), and the **`theEnd` ending card**.
- **Cutscene system** — declarative step scripts (see below) mixing full-screen stills/animations with in-scene staged beats; `onEnter` (once) or `Nooir.playCutscene`; skippable.
- **NPCs** (click / Enter-near to talk, optional static `pose`); **inventory**; **action zones** (painted + settings points); world **objects** (click / Enter).
- In-context **collision editor** (paint, line/polygon, objBlock add/move, light pools, NPC paths, **perspective tool**, **door-target panel** `G`, **always-prompt save** to PNG + settings).
- **Place / perspective tool** (`E` then `H`) — one tool to set the scene's depth and place its figures:
  - drag the dashed **far/near ghost handles** → `farHeight` / `nearHeight`;
  - drag the **hero body** → its start position (`startingPoint` x + new optional `startingY`);
  - drag an **NPC body** → its position; drag an **NPC's top handle** → its `scale`.
  `S` saves: heights + `startingPoint`/`startingY` as scalars, and NPC positions/scales as a top-level `npcPlacements = [{npc,x,y,scale?}]` (applied onto the cast by label, like `npcPaths`, since they can't be written into the nested `cast` objects).
- Weather (rain, lightning, bright/dark), toolbar (scene picker, cycle tests).

**Story — playable end-to-end**
- `story.md` locked: hero **Elias Mores**, **Vera the schemer**, **both endings** (branching).
- **Act I** — office hire (scene4) → Vesper St locker puzzle (scene1) → docks (scene2 → Pier 7 body + green book, scene10).
- **Act II** — Mickey (5), Quist bribe `tookBribe` (3), Brandt + case file (6), Toranno (7), with exterior approaches (11/12/13) and the club floor (14).
- **Act III** — the frame + Dot's rescue `protectedDot` (cell, 9), Vera reveal + Hard/Bleak finale fork (rooftop, 8), via the cell hallway (15) and rooftop stairway (16).

**Characters** *(detail + art gaps in `assets-todo.md` §2)*
- Full 8-way walk: **hatguy** (Elias), **woman** (Vera).
- Rigged from `*.mp4`, **side-walk only** (right mirrored, front/back placeholder, no diagonals): **secretary** (Dot, + sit pose), **attorney** (Quist), **bartender** (Mickey), **cop** (Brandt), **thug** (Toranno).
- **sidekick** rigged but unused. **Finch** never a sprite (appears as the body prop).

---

## Scenes

**Story chain** — all 16 scenes built & walkable via green/blue exit zones (the Scene picker still jumps anywhere). Verified end-to-end in headless Chrome.

`4 → 1 → 2 → 10 → 11 → 5 → 3 → 12 → 6 → 13 → 14 → 7 → 15 → 9 → 16 → 8`

All 16 backgrounds are **real artwork**. "Gameplay" = scripted beats wired in.

| # | Story location | Gameplay |
|---|---|---|
| scene4 | **Elias's office** (Act I open) | Vera hire + Dot; photo + pawn-ticket clues |
| scene1 | **Vesper Street** (Finch's tenement, rain) | Finch's door, pawn-ticket → locker → matchbook |
| scene2 | **Waterfront approach** (transitional) | pass-through, ambient |
| scene10 | **Pier 7 — the body** (deep-perspective dock) | examine body → recover green book |
| scene11 | **Street outside Mickey's bar** (exterior) | pass-through |
| scene5 | **Mickey's bar** (interior) | Mickey board-setting dialogue |
| scene3 | **Quist's law office** | bribe — `tookBribe` choice |
| scene12 | **Outside the precinct** (exterior) | pass-through |
| scene6 | **The precinct** (interior) | Brandt warning; case-file zone (`sawFile`) |
| scene13 | **Outside Toranno's club** (exterior) | pass-through |
| scene14 | **Inside the club** (main floor) | doorman gates Toranno's back room (`pastDoorman`) |
| scene7 | **Toranno's club, back room** | Toranno; reservation-book zone (`sawClubBook`) |
| scene15 | **Hallway to the holding cell** (interior) | pass-through |
| scene9 | **The cell** (the frame) | Brandt frame + Dot rescue (`protectedDot`) |
| scene16 | **Stairway to the rooftop** (interior) | pass-through |
| scene8 | **The Reckoning** (rooftop, rain) | Vera reveal + Hard/Bleak finale fork |

> `area.png` collision floors are authored per scene and verified; if a future
> repaint shifts a composition, re-trace that floor in the editor (`E`).

---

## Build plan

### Milestone 1 — Act I playable end-to-end ✅
- [x] Office: Vera hire + Dot line.
- [x] **photo** + **pawn ticket** clues on the office desk → inventory (scene4 actions).
- [x] **Vesper Street** (scene1): examine Finch's door, pawn-ticket → locker 0413 → matchbook (Pier 7 clue).
- [x] **The docks**: transitional approach (scene2) → **Pier 7** (scene10), examine the body → recover the **green book** (cover blown).

### Milestone 2 — Act II rooms + cast ✅
- [x] Placeholder scenes: **bar, precinct, club**.
- [x] **Whole cast rigged** from `characters/*.mp4` (side walk; left + mirrored right; front/back placeholdered).
- [x] Mickey's bar scene (board-setting dialogue).
- [x] Quist's bribe — **choice flag `tookBribe`** (scene3, demonstrates the choice system).
- [x] Precinct (Brandt's warning, the penciled-warrant threat).
- [x] Club back room (Toranno).

### Milestone 3 — Act III + branching ✅
- [x] The frame + Dot's rescue (flag `protectedDot`) — **scene9 (the cell)**: Brandt springs the frame, Dot offers to run the book; the choice sets `protectedDot`, which colors Dot's closing beat in **both** endings.
- [x] The Vera reveal (schemer) — scene8 rooftop, conditional on holding the book.
- [x] Finale fork — `vera:"turn_in"/"let_go"` → **Hard / Bleak** endings via `Nooir.theEnd` card.
- [x] Story-state object — `Nooir.story` + `setFlag/getFlag`, persisted to localStorage.

> **Scene8 = The Reckoning** (rooftop). Opening dialog is conditional on
> `hasItem("greenbook")`; the finale `{choice}` sets the `vera` flag and fires
> the matching ending. Choice options support a `do:` callback (used to trigger
> the ending). `Nooir.theEnd(title, text)` shows the end card.

### Milestone 4 — full world built & walkable ✅
- [x] **Non-linear exits** (`exitTo`/`backTo`) + **multi-door `exits` component map**; game opens in the office.
- [x] **Every `area.png` re-painted** with working green/blue exit zones (fixed the "no exits / nothing to interact with" pass).
- [x] **Docks split**: scene2 = transitional approach; **scene10 = Pier 7** (real `docks.png`) holds the body + green book.
- [x] **Six connective scenes (11–16)** wired from provided art — outside-bar, outside-precinct, outside-club, club floor, cell hallway, rooftop stairway.
- [x] Broken/legacy `objBlocks` (fence/chair/locker) stripped.
- Verified: full 16-scene chain walks end-to-end in headless Chrome (all doors resolve + transition).

### Milestone 5 — content & art polish *(in progress)*
- [x] **All 16 scene backgrounds = real artwork.**
- [ ] **NPC sprites**: real front/back frames + diagonals (currently side-walk only); staged poses (Mickey behind the bar, Brandt at the desk, …).
- [ ] **Repaint clue props** (greenbook, photo, ticket, matchbook, body) — tiny placeholders.
- [x] **Club doorman** (scene14) — gates the back-room door until you talk past him (3-way choice: name-drop Finch / flash the matchbook / lean on him), via the new `window.exitGate` hook.
- [ ] Optional **further beats in the connective scenes** (desk sergeant; a Vera+Toranno sighting on the club floor).

### Milestone 6 — production / packaging *(not started — see below)*

---

## Engine ↔ story: capabilities & remaining limitations

**Addressed**
- **Branching dialog choices** — a line `{ choice:[ {text, set, then} … ] }` shows pickable options; `set` writes story flags, `then` plays the branch. (Needed for the bribe + both endings.)
- **Story flags / persistence** — `Nooir.story` / `setFlag` / `getFlag`, saved to `localStorage`.
- **NPC default poses** — optional `pose:{src,w,h}` on a cast entry (e.g. Dot sitting). Omit = standing walk-idle.
- **NPC scale** — optional `scale` (number) on a cast entry multiplies the perspective-derived size, with feet + horizontal centre staying anchored. Works for walk-sheet and `pose` NPCs. Dial live with `Nooir.scaleNpc(label|index, scale)` (returns the value), then paste into the scene's `cast`.
- **NPC patrol paths** — optional `path: [{x,y}, …]` (≥2 points) on a walk-sheet cast entry: the NPC ambles the loop, facing the way it walks, walk-cycle animating, speed + size perspective-correct as it changes depth. Paused during dialog / transitions / editing. **Draw it in the editor:** press `E` then `N` (crosshair + bright preview with a dashed loop-back), click waypoints, **Enter** assigns to the nearest NPC (walks live), then **`S` saves** it. Live API: `Nooir.setNpcPath(label|index, pts, speed?)`.
  - **Walk speed** — `pathSpeed` scales the pace (1 = the hero's; default 0.7). In the path tool, `[` / `]` adjust it live (HUD shows the value, retunes the last-drawn NPC); saved as the `speed` field in `npcPaths`. Live: `Nooir.setNpcSpeed(label|index, speed)`.
- **Animated objBlocks** — an objBlock can cycle frames instead of a static `src`:
  ```js
  { id:"smoke", animate:{ frames:["smoke1.png", …], speed:0.2, pause:0.6, fadeIn:0.4, fadeOut:0.4, posX:880, posY:280, bottomY:300 } }
  ```
  `speed` = seconds/frame, `pause` = extra seconds the last frame lingers before looping, `fadeIn`/`fadeOut` = seconds to fade opacity 0→1 at the cycle start / 1→0 at the end, `bottomY` = z-depth (works inside `animate` **or** at the objBlock level, like static blocks). `mode` = `"forward"` (default) / `"reverse"` / `"pingpong"` (or `reverse:true` / `pingpong:true`). **With `posX`/`posY`** it's a positioned sprite (top-left, natural or `w`/`h` size); **without them** it's a full-scene overlay scaled to the world (for full-frame smoke/fog). One cycle clock drives frames + fade in sync; frames are preloaded (no flicker); survives the editor's `S` save (kept in `objBlocks`).
  - **Saved as `npcPaths`** — editor save writes a top-level `npcPaths = [{npc, path, speed?}]` in `settings.js` (paths can't be injected into the nested `cast` objects), matched back onto the cast by label/name on load. Hand-authoring via the per-cast `path` still works.
  - **`sideFlip`** — the five mp4-rigged cast (bartender/cop/thug/attorney/secretary) were rigged with their side art mirrored opposite the hero, so `CHAR_META.sideFlip` swaps left/right **at render** — `facing:"l"` faces left for everyone, static *and* walking (fixes both the "moonwalk" and reversed static facings).
  - **Set facing in the editor** — in the place/perspective tool (`H`), grab the hero or an NPC, then press **`F`** to cycle its facing (`l→r→f→b`). Saved as `startingFacing` (hero) and the `facing` field in `npcPlacements` (NPCs). The hero spawns facing `startingFacing` (default `"r"`).
- **Dedicated scenes** — story locations get their own art; **no reusing old backgrounds** (Vesper St + docks redressed).

**Addressed (cont.)**
- **Non-linear scene exits** — each `settings.js` declares `exitTo` (green zone) and `backTo` (blue zone); the engine redirects there instead of scene ±1. The full story chain is **4→1→2→10→11→5→3→12→6→13→14→7→15→9→16→8** (16 scenes; see the Scenes table). Each `area.png` paints a green exit + blue back zone over the walkable floor. The game opens in scene4 (`config.js` `mainlevel = 4`).
- **Multi-door exits (exit component ids)** — every painted green/blue region is a connected **component** with a stable id and its own redirect target (`Nooir.exitZones` lists them). A scene with more than one forward/back door declares:
  ```js
  exits = [
    { to: 7, cx: 1240, cy: 700, id: "alleyDoor" }, // this region → scene 7
    { to: 3, cx: 60,   cy: 700, id: "frontDoor" }, // that region → scene 3
  ],
  ```
  Each region is matched to the nearest `exits[]` def by centroid (≤90px) and inherits its `to`; unmatched regions fall back to the green=`exitTo` / blue=`backTo` colour rule. So single-door scenes need no `exits` at all.
  - **Door-target panel (editor `G`)** — in the editor, press **`G`** to open a panel listing every painted exit/back door with a **scene dropdown**. Pick a target per door (or *dead end*); the change takes effect live (test it immediately) and **`S` saves** it as the `exits` map — no hand-editing needed for the targets. Doors carrying a `with:` override are flagged with a ✱.
  - **Scene reuse with overrides (`with:`)** — a door can reuse a scene with tweaked settings: add a `with` object and it's shallow-merged (per top-level key) over the target scene's own `settings.js` **only when entered through that door**:
    ```js
    exits = [
      { to: 6, cx: 200, cy: 600 },                                  // scene 6 as authored
      { to: 6, cx: 900, cy: 600, with: { rain: 0, cast: ['cop'] } } // same art, different settings
    ],
    ```
    Reaching scene 6 any other way (a different door, the level picker) ignores the override. The panel edits targets; the `with` object stays hand-written in `settings.js` (preserved across editor saves, even multi-line).
  - **Locked doors (`window.exitGate`)** — a scene's `actions.js` can set `window.exitGate = function (dest, zone) { … return false }` to veto a door until a story beat clears it (reset per scene on load). Used by the **scene14 doorman**, who blocks the green exit to Toranno's back room (→7) until a dialog choice calls `Nooir.passDoorman()` (sets `pastDoorman`); a throttled nudge fires if you try the door first.
- **Cutscenes** — a cutscene is an ordered list of typed steps run by a promise-based sequencer that reuses the dialog staging (`moveTo` glides), the fade overlay, and `shake`, plus a full-screen still/caption layer. Register with `Nooir.cutscene(id, steps)`; play via a scene's settings **`onEnter:"id"`** (once, gated by the `cs_<id>` flag) or **`Nooir.playCutscene("id")`** (from a dialog choice's `do:`, an action zone, anywhere). Skippable (skip button / `Esc`; a skipped cutscene still honors its trailing `goto`). Input + exits are suspended while it runs.
  ```js
  Nooir.cutscene("flashback", [
    { do: "fade",  to: 1, ms: 600 },                          // → black
    { do: "still", img: "cutscenes/alley.png", fadeIn: 800 }, // full-frame image (ms omitted = wait for a tap)
    { do: "say",   who: "vera", text: "He said he'd be careful." },
    { do: "anim",  frames: ["cutscenes/rain1.png","rain2.png"], speed: 0.12, hold: 1500 },
    { do: "clear", ms: 600 },                                 // fade the still → back to the live room
    { do: "move",  who: "hero", x: 520, y: 600, facing: "l" },// in-scene staged glide
    { do: "shake", ms: 500 }, { do: "goto", scene: 10 },      // hand off to a scene
  ]);
  ```
  Steps: `fade {to,ms}` · `still {img,frames?,speed?,fadeIn?,ms?}` · `anim {frames,speed?,hold?}` · `clear {ms?}` · `say {who,text}` · `move {who,x,y,facing?,wait?}` · `face {who,facing}` · `shake {ms?}` · `flash {text,ms?}` · `wait {ms}` · `call {fn}` · `goto {scene,with?}`. Image paths are root-relative (e.g. a `cutscenes/` folder), not scene-prefixed. *(Demo: scene17's `apartment_intro` plays on first entry; full examples in `rooms/scene17/js/actions.js`.)*
- **Session resume** — manual scene / character / rain / clouds / sky-bright are persisted to `localStorage` (`nooir.env`) and restored on reload. Scene settings still set their own defaults; a stored value is overlaid on top. The ending card's "begin again" clears `nooir.env` (+ `nooir.story`). *(Inventory still in-memory — folds into the production persistence pass.)*
- **Per-scene character lighting** — `settings.js` `charTint` tints/brightens/darkens the hero **and** NPCs (CSS filter) so they sit in the room's light instead of looking pasted on. Forms: `charTint = 0.7` (brightness), a raw filter string `"brightness(.6) saturate(.8)"`, or an object `{ brightness, contrast, saturate, sepia, hue, blur }`. Dial it live with `Nooir.charTint(...)` (returns the computed filter) then paste into the scene. Examples wired: scene5 warm bar, scene10 cold dock.
- **Light pools** — a new collision terrain (**orange**, editor brush **`8` = LIGHT**) painted over the floor. Whoever stands in it gets a brightness boost on top of the scene's `charTint` — the hero updates live as he walks in/out; NPCs standing in a pool are lit too. Pools are walkable floor. Strength defaults to ×1.6, per-scene override `lightBoost`. *(Paint pools under lamps/windows in the editor `E`, then `S` to save.)*

**Still limited (not yet blocking, but the story will want them)**
- **Conditional opening dialog** — an NPC saying different things by flag/item *on first line*. Workaround today: build the `cast` dynamically in `actions.js` (read `Nooir.getFlag`/`hasItem`). A first-class `when:` condition would be cleaner.
- **Multi-NPC conversations** — two NPCs talking *to each other* with the player watching (e.g. Vera + Toranno). Dialog is always hero ↔ one NPC. Needs a scene-dialogue runner.
- **Inventory persistence** — items are in-memory (reset on reload); flags persist. Fold into the production `localStorage` pass.
- **Item-use UI** — "use item X on target Y". Covered today by `hasItem` gating; no explicit select-and-use UI.

---

## Production / packaging pass

The game is a **pure static web app**, so every target wraps the same `noir/` folder.

| Target | Tech | Notes |
|---|---|---|
| **Web** | static site | ✅ **LIVE at https://skalamax.si/noir/** — `nginx:alpine` container on `127.0.0.1:8096`; host nginx routes `/noir/` (apex `skalamax.si` block). Redeploy: `./deploy.sh root@skalamax.si`. Source on GitHub (`hitmaneac/noir`). |
| **Desktop** | **Tauri** | system webview, ~3–10 MB binaries. |
| **Mobile** | **Capacitor** | reuse the **S-Labs Suite** shell; static site in `www/`. |

**Engine changes needed before shipping (one focused pass):**
1. ~~Dev-mode flag~~ — ✅ `config.js` `dev` auto-detects localhost (on) vs deployed (off); engine hides the toolbar + editor + E-key in production.
2. **Input abstraction** — pointer/touch parity (tap already = click; editor is dev-only; talk works by tapping NPCs).
3. ~~Fit-to-screen scaling~~ — ✅ `fitToScreen()` scales the 1300×800 world (CSS transform on `.game`) to any viewport, letterboxed; floor clicks divide out the scale.
4. ~~Persistence~~ — ✅ inventory persists (`nooir.inv`) alongside story flags + session env; "begin again" clears all three.
5. **Drop `?t=` cache-buster** in packaged builds (assets are bundled).

**Order:** Web → skalamax.si → Capacitor mobile → Tauri desktop.

---

## Asset & character pipeline (reference)
- **Source frames** live in `characters/<name>/sheets/<dir>/frame_*.png` (one folder per facing, any size, solid bg).
- The **rigger** keys out the bg, anchors on torso-centroid + feet baseline, packs into a uniform grid → derived `characters/<name>_walk_sheet.png` / `_sides.png` (+ run/pickup/grab).
- Engine loads the **derived** sheets only; metadata lives in `CHAR_META`.
- To add a character: drop frame folders → ask for a rig → it produces the sheet + the `CHAR_META` line.

---

## Backlog / nice-to-have
- Music / ambient rain SFX hook.
- Save-slots / chapter select.
- First-class `when:` conditional opening dialog (today: build `cast` dynamically in `actions.js`).
- Scene-dialogue runner for **multi-NPC conversations** (NPC↔NPC with the player watching).
- Item-use UI ("use X on Y") beyond the current `hasItem` gating.

*(Done & moved out of backlog: levels→scenes rename · branching choice UI · story-order exit zones replacing picker nav · per-character walk cadence.)*
