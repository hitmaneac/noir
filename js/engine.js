/* Nooir engine
 * - single requestAnimationFrame loop, delta-time movement
 * - collision map (area.png) decoded ONCE per level into a cached pixel buffer
 * - A* path-finding on click, with line-of-sight smoothing
 * - walk-cycle animation driven by the hatguy sprite sheet (background-position)
 * - real level transitions (settings + stylesheet + collision map swapped live)
 *
 * Per-room data comes from rooms/sceneN/js/settings.js, loaded by loadLevel().
 */
(function () {
  "use strict";

  // ---- constants -----------------------------------------------------------
  var GRID = 12; // A* cell size, world px
  var BASE_SPEED = 260; // walk speed (px/s) at nearest/largest size
  var FRAME_MS = 130; // default ms per walk-cycle frame (higher = slower walk)
  var walkMs = FRAME_MS; // active character's walk-frame duration (set per character)
  var MAX_LEVEL = 16; // highest scene that exists
  // dev tools (top toolbar + collision/placement editor) gate. config.js sets
  // `dev` (auto: on for localhost, off when deployed). Unset = on (back-compat).
  var DEV = window.dev !== false;

  // 8-way walk: cardinals (f/b/r/l) from the 4-direction walk sheet, diagonals
  // (fr/fl/br/bl) from the sides sheet. Each is one row of its sheet.
  var WALK_META = {
    rows: 4,
    frames: 8,
    cellW: 116,
    cellH: 225,
    figureH: 225,
    feetY: 225,
  };
  var SIDES_META = {
    rows: 4,
    frames: 7,
    cellW: 116,
    cellH: 201,
    figureH: 201,
    feetY: 201,
  };
  var WALK_ROW = { f: 0, b: 1, r: 3, l: 2 }; // r/l swapped to match the art
  var SIDES_ROW = { fr: 0, fl: 1, br: 2, bl: 3 }; // sheet rows: front, front, back, back
  var WALK_SHEET = "",
    SIDES_SHEET = "";
  function walkDef(facing) {
    if (SIDES_ROW[facing] != null)
      return { sheet: SIDES_SHEET, m: SIDES_META, row: SIDES_ROW[facing] };
    return {
      sheet: WALK_SHEET,
      m: WALK_META,
      row: WALK_ROW[facing] != null ? WALK_ROW[facing] : 0,
    };
  }

  // ---- per-room state (set by applyRoomConfig) -----------------------------
  var level, character, bgWidth, spawnX, FAR_H, NEAR_H, fenceY;
  var cloudSpeed,
    cloudDir,
    cloudOffset = 0; // sky drift (px/s, +1/-1)

  // ---- DOM -----------------------------------------------------------------
  var elGame = document.querySelector(".game");
  var elClouds = document.querySelector(".clouds");
  var elBg = document.querySelector(".background");
  var elChar = document.querySelector(".character");
  var elFence = document.querySelector(".fence");
  var elMsg = document.querySelector(".msg");
  var roomCss, fade;

  // static stacking: scenery behind everything, message on top. The character
  // and fence are y-sorted each level/frame so the character can pass behind
  // and in front of foreground objects.
  elClouds.style.zIndex = 0;
  elBg.style.zIndex = 0;
  elMsg.style.zIndex = 100000;

  elChar.style.top = "0";
  elChar.style.left = "0";
  elChar.style.willChange = "transform";
  window.addEventListener("resize", fitToScreen);
  // Scale the fixed 1300×800 world to fit any viewport, centred (letterboxed on
  // the black body). Uniform scale preserves aspect; everything inside .game
  // (layers, character, objBlocks, rain) scales with it. Floor clicks divide by
  // the scale (via the rect) so they still map to world pixels.
  function fitToScreen() {
    var W = bgWidth || 1300,
      H = col.h || 800; // world box = the collision map (1300×800)
    var vw = window.innerWidth,
      vh = window.innerHeight;
    var s = Math.min(vw / W, vh / H);
    elGame.style.position = "fixed";
    elGame.style.left = "0";
    elGame.style.top = "0";
    elGame.style.margin = "0";
    elGame.style.width = W + "px";
    elGame.style.height = H + "px";
    elGame.style.transformOrigin = "top left";
    elGame.style.transform =
      "translate(" +
      (vw - W * s) / 2 +
      "px," +
      (vh - H * s) / 2 +
      "px) scale(" +
      s +
      ")";
  }

  // ---- collision map -------------------------------------------------------
  var col = { w: 0, h: 0, data: null, top: 0, bottom: 0 };

  function loadCollision() {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        var ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        col.w = img.width;
        col.h = img.height;
        col.data = ctx.getImageData(0, 0, img.width, img.height).data;
        calibrate();
        computeActionZones();
        computeExitZones();
        resolve();
      };
      img.src = "rooms/scene" + level + "/area.png";
    });
  }

  // Terrain legend (painted into the collision map by colour):
  //   magenta = floor   green = exit (next level)   blue = back (prev level)
  //   cyan = slow/mud   yellow = action   red = obstruction   orange = light
  //   else = blocked
  var T_BLOCK = 0,
    T_FLOOR = 1,
    T_EXIT = 2,
    T_SLOW = 3,
    T_OBSTRUCT = 4,
    T_ACTION = 5,
    T_BACK = 6,
    T_LIGHT = 7; // a light pool — walkable floor that brightens the character
  function classify(R, G, B) {
    if (R > 200 && G > 110 && G < 200 && B < 90) return T_LIGHT; // orange
    if (R > 200 && G > 200 && B < 90) return T_ACTION; // yellow
    if (R > 200 && G < 90 && B > 200) return T_FLOOR; // magenta
    if (R > 200 && G < 90 && B < 90) return T_OBSTRUCT; // red
    if (R < 120 && G > 150 && B < 120) return T_EXIT; // green
    if (R < 120 && G > 150 && B > 150) return T_SLOW; // cyan
    if (R < 120 && G < 120 && B > 180) return T_BACK; // blue
    return T_BLOCK;
  }
  function terrainAt(x, y) {
    x = x | 0;
    y = y | 0;
    if (x < 0 || y < 0 || x >= col.w || y >= col.h) return T_BLOCK;
    var p = (y * col.w + x) * 4,
      d = col.data;
    return classify(d[p], d[p + 1], d[p + 2]);
  }
  // floor / exit / slow / action are walkable; block and obstruction are solid,
  // and a cast member's footprint blocks the hero (so he can't walk through NPCs)
  function isWalkable(x, y) {
    var t = terrainAt(x, y);
    if (t === T_BLOCK || t === T_OBSTRUCT) return false;
    return !npcBlocks(x, y);
  }
  function npcBlocks(x, y) {
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i],
        dx = x - n.x,
        dy = y - n.y;
      if (dx * dx + dy * dy < n.r * n.r) return true;
    }
    return false;
  }

  // terrain under the character's feet (its on-screen bottom = player.y)
  function feetTerrain() {
    return terrainAt(player.x, player.y);
  }

  // record the vertical band that contains floor, to auto-tune perspective
  function calibrate() {
    var top = col.h,
      bottom = 0;
    for (var y = 0; y < col.h; y += 2) {
      for (var x = 0; x < col.w; x += 8) {
        if (isWalkable(x, y)) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          break;
        }
      }
    }
    col.top = top;
    col.bottom = bottom;
  }

  // Find separate yellow action regions (connected components) so each can drive
  // its own behaviour. Each gets a stable id (reading order: top→bottom, left→right)
  // plus a centroid and bounds; actionLabels maps every action pixel to its id.
  var actionZones = [],
    actionLabels = null,
    zoneDefs = []; // zoneDefs: [{id,cx,cy}] from settings/editor
  var zoneActive = {}; // id -> false to switch a zone off (default on)
  function isZoneActive(id) {
    return zoneActive[id] !== false;
  }
  function setZoneActive(id, on) {
    zoneActive[id] = !!on;
  }
  function resolveZoneId(z) {
    var best = null,
      bd = 60 * 60; // match a painted region to a named def by centroid
    for (var i = 0; i < zoneDefs.length; i++) {
      var dx = zoneDefs[i].cx - z.cx,
        dy = zoneDefs[i].cy - z.cy,
        dd = dx * dx + dy * dy;
      if (dd < bd) {
        bd = dd;
        best = zoneDefs[i];
      }
    }
    return best ? best.id : z.index; // fall back to numeric index
  }
  function computeActionZones() {
    var w = col.w,
      h = col.h,
      d = col.data,
      total = w * h;
    var labels = new Int32Array(total); // 0 = none, else id+1
    var zones = [],
      stack = [];
    for (var sy = 0; sy < h; sy++)
      for (var sx = 0; sx < w; sx++) {
        var s = sy * w + sx;
        if (labels[s]) continue;
        if (classify(d[s * 4], d[s * 4 + 1], d[s * 4 + 2]) !== T_ACTION)
          continue;
        var id = zones.length,
          lbl = id + 1;
        var minX = sx,
          maxX = sx,
          minY = sy,
          maxY = sy,
          sumX = 0,
          sumY = 0,
          cnt = 0;
        stack.length = 0;
        stack.push(s);
        labels[s] = lbl;
        while (stack.length) {
          var ci = stack.pop(),
            cx = ci % w,
            cy = (ci / w) | 0;
          sumX += cx;
          sumY += cy;
          cnt++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          var nb = [
            cx > 0 ? ci - 1 : -1,
            cx < w - 1 ? ci + 1 : -1,
            cy > 0 ? ci - w : -1,
            cy < h - 1 ? ci + w : -1,
          ];
          for (var n = 0; n < 4; n++) {
            var ni = nb[n];
            if (ni < 0 || labels[ni]) continue;
            if (
              classify(d[ni * 4], d[ni * 4 + 1], d[ni * 4 + 2]) === T_ACTION
            ) {
              labels[ni] = lbl;
              stack.push(ni);
            }
          }
        }
        zones.push({
          id: id,
          cx: Math.round(sumX / cnt),
          cy: Math.round(sumY / cnt),
          bounds: { minX: minX, minY: minY, maxX: maxX, maxY: maxY },
          count: cnt,
          _lbl: lbl,
        });
      }
    zones.sort(function (a, b) {
      return a.cy - b.cy || a.cx - b.cx;
    });
    var remap = {};
    for (var i = 0; i < zones.length; i++) {
      remap[zones[i]._lbl] = i + 1;
      delete zones[i]._lbl;
      zones[i].index = i;
      zones[i].id = resolveZoneId(zones[i]); // stable named id, or numeric
    }
    for (var k = 0; k < total; k++) if (labels[k]) labels[k] = remap[labels[k]];
    actionZones = zones;
    actionLabels = labels;
    if (window.Nooir) window.Nooir.actionZones = zones;
    if (editor && editor.on) updateZoneLabels();
  }

  // ---- exit zones (multi-door) --------------------------------------------
  // Each connected green (T_EXIT) / blue (T_BACK) region is its own "door" with
  // a stable component id and a redirect target. A scene with several doors
  // declares `exits = [{ to, cx, cy, id? }, …]` in settings; each painted region
  // is matched to the nearest def by centroid and inherits its `to`. Scenes with
  // a single forward + single back door need no `exits` — green falls back to
  // `exitTo` (default scene+1) and blue to `backTo` (default scene-1).
  var exitZones = [],
    exitLabels = null,
    exitDefs = []; // exitDefs: [{to, cx, cy, id?}] from settings
  function isExitTerrain(t) {
    return t === T_EXIT || t === T_BACK;
  }
  function resolveExitTarget(z) {
    // 1) a settings `exits` def whose centroid sits inside this region wins
    var best = null,
      bd = 90 * 90;
    for (var i = 0; i < exitDefs.length; i++) {
      var e = exitDefs[i];
      if (typeof e.cx !== "number" || typeof e.cy !== "number") continue;
      var dx = e.cx - z.cx,
        dy = e.cy - z.cy,
        dd = dx * dx + dy * dy;
      if (dd < bd) {
        bd = dd;
        best = e;
      }
    }
    if (best)
      return { to: best.to | 0, id: best.id != null ? best.id : z.index };
    // 2) colour fallback — green = forward (exitTo), blue = back (backTo)
    var to =
      z.color === "fwd"
        ? window.exitTo != null
          ? window.exitTo
          : level + 1
        : window.backTo != null
          ? window.backTo
          : level - 1;
    return { to: to | 0, id: z.color };
  }
  function computeExitZones() {
    var w = col.w,
      h = col.h,
      d = col.data,
      total = w * h;
    var labels = new Int32Array(total),
      zones = [],
      stack = [];
    for (var sy = 0; sy < h; sy++)
      for (var sx = 0; sx < w; sx++) {
        var s = sy * w + sx;
        if (labels[s]) continue;
        var t0 = classify(d[s * 4], d[s * 4 + 1], d[s * 4 + 2]);
        if (!isExitTerrain(t0)) continue;
        // flood only within the SAME colour, so an adjacent green + blue strip
        // never merge into one door
        var id = zones.length,
          lbl = id + 1;
        var minX = sx,
          maxX = sx,
          minY = sy,
          maxY = sy,
          sumX = 0,
          sumY = 0,
          cnt = 0;
        stack.length = 0;
        stack.push(s);
        labels[s] = lbl;
        while (stack.length) {
          var ci = stack.pop(),
            cx = ci % w,
            cy = (ci / w) | 0;
          sumX += cx;
          sumY += cy;
          cnt++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          var nb = [
            cx > 0 ? ci - 1 : -1,
            cx < w - 1 ? ci + 1 : -1,
            cy > 0 ? ci - w : -1,
            cy < h - 1 ? ci + w : -1,
          ];
          for (var n = 0; n < 4; n++) {
            var ni = nb[n];
            if (ni < 0 || labels[ni]) continue;
            if (classify(d[ni * 4], d[ni * 4 + 1], d[ni * 4 + 2]) === t0) {
              labels[ni] = lbl;
              stack.push(ni);
            }
          }
        }
        zones.push({
          index: id,
          cx: Math.round(sumX / cnt),
          cy: Math.round(sumY / cnt),
          bounds: { minX: minX, minY: minY, maxX: maxX, maxY: maxY },
          count: cnt,
          color: t0 === T_EXIT ? "fwd" : "back",
          _lbl: lbl,
        });
      }
    zones.sort(function (a, b) {
      return a.cy - b.cy || a.cx - b.cx;
    });
    var remap = {};
    for (var i = 0; i < zones.length; i++) {
      remap[zones[i]._lbl] = i + 1;
      delete zones[i]._lbl;
      zones[i].index = i;
      var r = resolveExitTarget(zones[i]);
      zones[i].to = r.to;
      zones[i].id = r.id;
    }
    for (var k = 0; k < total; k++) if (labels[k]) labels[k] = remap[labels[k]];
    exitZones = zones;
    exitLabels = labels;
    if (window.Nooir) window.Nooir.exitZones = zones;
  }

  function nearestWalkable(x, y, maxR) {
    if (isWalkable(x, y)) return { x: x | 0, y: y | 0 };
    maxR = maxR || 400;
    for (var r = GRID; r <= maxR; r += GRID) {
      for (var a = 0; a < 360; a += 12) {
        var rx = x + Math.cos((a * Math.PI) / 180) * r;
        var ry = y + Math.sin((a * Math.PI) / 180) * r;
        if (isWalkable(rx, ry)) return { x: rx | 0, y: ry | 0 };
      }
    }
    return null;
  }

  // ---- perspective ---------------------------------------------------------
  function heightAt(y) {
    var span = Math.max(1, col.bottom - col.top);
    var t = (y - col.top) / span;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return FAR_H + (NEAR_H - FAR_H) * t;
  }
  function speedAt(y) {
    return BASE_SPEED * (heightAt(y) / NEAR_H);
  }
  // speed where the character currently stands (cyan "slow" terrain halves it)
  var RUN_FACTOR = 1.9,
    RUN_DIST = 320; // run speed multiplier; far-click distance that triggers running
  function currentSpeed(running) {
    var s = speedAt(player.y);
    if (feetTerrain() === T_SLOW) s *= 0.45;
    return running ? s * RUN_FACTOR : s;
  }

  // ---- player --------------------------------------------------------------
  var player = {
    x: 0,
    y: 0,
    facing: "r",
    frame: 1,
    animAcc: 0,
    moving: false,
    path: null,
    pathIndex: 0,
    runPath: false,
    anim: null, // active special cycle (run/kneel/reach…) or null = default walk
  };

  // ---- character animation cycles (side-view sheets in characters/test) -----
  // Default walk uses the 4-direction hatguy_sheet; these are extra cycles, each
  // a horizontal strip with a left-mirror. Uniform cell + figure metrics so the
  // engine scales any cycle to the same on-screen size with feet at player.y.
  var TEST = "characters/test/";
  function sideAnim(file, frames, fps, loop) {
    return {
      sheets: { r: TEST + file + ".png", l: TEST + file + "_left.png" },
      frames: frames,
      fps: fps,
      loop: loop,
      cellW: 180,
      cellH: 260,
      figureH: 178,
      feetY: 246,
    };
  }
  // all character cycles are 4-direction sheets (rows: 0 front, 1 back, 2 right,
  // 3 left), one row per facing — same layout as the default walk.
  var DIR4 = { f: { row: 0 }, b: { row: 1 }, r: { row: 2 }, l: { row: 3 } };
  var DIR4R = { f: { row: 0 }, b: { row: 1 }, r: { row: 3 }, l: { row: 2 } }; // r/l swapped

  // ---- characters ----------------------------------------------------------
  // Per-character sprite metrics, measured by the rigger from each character's
  // source sheets. rows are always 4; figureH/feetY == cellH (figures packed
  // feet-to-cell-bottom). The row map, fps and loop of each cycle are shared
  // across characters — only the sheet path and cell sizes differ. Derived
  // sheets live at characters/<name>_{walk_sheet,sides,run,pickup,grab}.png.
  var CHAR_META = {
    hatguy: {
      walkMs: 88, // 10-frame walk cadence (avoids gliding)
      walk: { frames: 10, cellW: 272, cellH: 406 },
      sides: { frames: 10, cellW: 254, cellH: 407 },
      run: { frames: 8, cellW: 162, cellH: 216 },
      pickup: { frames: 6, cellW: 174, cellH: 219 },
      grab: { frames: 6, cellW: 186, cellH: 235 },
    },
    woman: {
      walkMs: 88, // faster walk cadence (10 frames would glide at the default 130)
      walk: { frames: 10, cellW: 162, cellH: 246 },
      sides: { frames: 10, cellW: 224, cellH: 442 },
      run: { frames: 7, cellW: 188, cellH: 238 },
      pickup: { frames: 6, cellW: 138, cellH: 248 },
      grab: { frames: 6, cellW: 218, cellH: 267 },
    },
    // ---- cast NPCs, rigged from characters/<name>.mp4 (side walk only) ----
    // The video gives the LEFT walk; the sheet mirrors it for RIGHT and reuses
    // the side for front/back (placeholder). NPCs only use the walk sheet, so
    // sides/run/pickup/grab share the walk dims (no separate sheets exist yet).
    secretary: { sideFlip: true, walkMs: 88, walk: { frames: 10, cellW: 152, cellH: 224 }, sides: { frames: 10, cellW: 152, cellH: 224 }, run: { frames: 10, cellW: 152, cellH: 224 }, pickup: { frames: 10, cellW: 152, cellH: 224 }, grab: { frames: 10, cellW: 152, cellH: 224 } },
    attorney:  { sideFlip: true, walkMs: 88, walk: { frames: 10, cellW: 158, cellH: 229 }, sides: { frames: 10, cellW: 158, cellH: 229 }, run: { frames: 10, cellW: 158, cellH: 229 }, pickup: { frames: 10, cellW: 158, cellH: 229 }, grab: { frames: 10, cellW: 158, cellH: 229 } },
    bartender: { sideFlip: true, walkMs: 88, walk: { frames: 10, cellW: 164, cellH: 218 }, sides: { frames: 10, cellW: 164, cellH: 218 }, run: { frames: 10, cellW: 164, cellH: 218 }, pickup: { frames: 10, cellW: 164, cellH: 218 }, grab: { frames: 10, cellW: 164, cellH: 218 } },
    cop:       { sideFlip: true, walkMs: 88, walk: { frames: 10, cellW: 174, cellH: 226 }, sides: { frames: 10, cellW: 174, cellH: 226 }, run: { frames: 10, cellW: 174, cellH: 226 }, pickup: { frames: 10, cellW: 174, cellH: 226 }, grab: { frames: 10, cellW: 174, cellH: 226 } },
    sidekick:  { sideFlip: true, walkMs: 88, walk: { frames: 10, cellW: 150, cellH: 218 }, sides: { frames: 10, cellW: 150, cellH: 218 }, run: { frames: 10, cellW: 150, cellH: 218 }, pickup: { frames: 10, cellW: 150, cellH: 218 }, grab: { frames: 10, cellW: 150, cellH: 218 } },
    thug:      { sideFlip: true, walkMs: 88, walk: { frames: 10, cellW: 174, cellH: 226 }, sides: { frames: 10, cellW: 174, cellH: 226 }, run: { frames: 10, cellW: 174, cellH: 226 }, pickup: { frames: 10, cellW: 174, cellH: 226 }, grab: { frames: 10, cellW: 174, cellH: 226 } },
  };
  var ANIM_SPEC = {
    run: { dir: DIR4R, fps: 14, loop: true }, // r/l swapped to match the walk
    pickup: { dir: DIR4, fps: 5, loop: false }, // one-shot: bend down, pick up
    grab: { dir: DIR4, fps: 8, loop: false }, // one-shot: reach and grab
  };
  var CHAR_ANIMS = {}; // run/pickup/grab for the active character (built below)
  var charOverride = null; // test switch persists across levels when set

  function mkMeta(c) {
    return {
      rows: 4,
      frames: c.frames,
      cellW: c.cellW,
      cellH: c.cellH,
      figureH: c.cellH,
      feetY: c.cellH,
    };
  }
  function applyCharacter(name) {
    if (!CHAR_META[name]) name = "hatguy";
    character = name;
    var cm = CHAR_META[name];
    WALK_META = mkMeta(cm.walk);
    SIDES_META = mkMeta(cm.sides);
    walkMs = cm.walkMs || FRAME_MS; // per-character walk cadence
    // the RIGGED/derived sheets (figures re-packed into uniform cells). The raw
    // sources under characters/<name>/sheets/ have irregular figure spacing and
    // CANNOT be sampled as a uniform grid — they're only the rigger's input.
    WALK_SHEET = "characters/" + name + "_walk_sheet.png";
    SIDES_SHEET = "characters/" + name + "_sides.png";
    for (var k in CHAR_ANIMS) delete CHAR_ANIMS[k]; // rebuild in place (keep ref)
    for (var n in ANIM_SPEC) {
      var s = ANIM_SPEC[n],
        c = cm[n];
      CHAR_ANIMS[n] = {
        sheet: "characters/" + name + "_" + n + ".png",
        dir: s.dir,
        frames: c.frames,
        rows: 4,
        fps: s.fps,
        loop: s.loop,
        cellW: c.cellW,
        cellH: c.cellH,
        figureH: c.cellH,
        feetY: c.cellH,
      };
    }
    player.anim = null; // back to the walk cycle for the new character
    curBg = ""; // force the sprite sheet to reload next render
    if (charSelect) charSelect.value = name; // keep the toolbar in sync
    var srcs = [
      WALK_SHEET,
      SIDES_SHEET,
      CHAR_ANIMS.run.sheet,
      CHAR_ANIMS.pickup.sheet,
      CHAR_ANIMS.grab.sheet,
    ];
    srcs.forEach(function (src) {
      new Image().src = src;
    }); // preload
  }

  // ---- cast: extra characters present in the level -------------------------
  // settings.js may set `cast` to a list of characters standing in the room
  // alongside the hero (`character`). Entries are a name string (auto-placed
  // across the floor) or { name, x, y, facing }. Each must be a rigged
  // character (present in CHAR_META). NPCs are static idle figures (front-
  // facing by default), depth-sorted with the hero; rebuilt on every level.
  var npcs = [];
  function clearCast() {
    for (var i = 0; i < npcs.length; i++)
      if (npcs[i].el && npcs[i].el.parentNode)
        npcs[i].el.parentNode.removeChild(npcs[i].el);
    npcs.length = 0;
    pendingNpc = null;
    if (editor) editor.lastPathNpc = null; // stale ref once the cast is rebuilt
    closeDialog();
  }
  // ---- per-scene character lighting ---------------------------------------
  // settings.js `charTint` tints/brightens/darkens the hero + NPCs so they sit in
  // the scene's light instead of looking pasted on. Accepts:
  //   number → brightness shorthand        charTint = 0.7
  //   string → raw CSS filter (full power)  charTint = "brightness(.6) saturate(.8)"
  //   object → named parts                  charTint = { brightness:.7, sepia:.25, hue:-8, saturate:.9, contrast:1.05, blur:.3 }
  var charFilter = ""; // active CSS filter applied to character sprites
  function buildCharFilter(t) {
    if (t == null || t === false || t === "") return "";
    if (typeof t === "number") return "brightness(" + t + ")";
    if (typeof t === "string") return t;
    if (typeof t === "object") {
      var f = [];
      if (t.brightness != null) f.push("brightness(" + t.brightness + ")");
      if (t.contrast != null) f.push("contrast(" + t.contrast + ")");
      if (t.saturate != null) f.push("saturate(" + t.saturate + ")");
      if (t.sepia != null) f.push("sepia(" + t.sepia + ")");
      if (t.hue != null) f.push("hue-rotate(" + t.hue + "deg)");
      if (t.blur != null) f.push("blur(" + t.blur + "px)");
      return f.join(" ");
    }
    return "";
  }
  function applyCharFilter() {
    inLight = false; // re-evaluated next frame so a light boost re-applies
    if (elChar) elChar.style.filter = charFilter;
    for (var i = 0; i < npcs.length; i++)
      if (npcs[i].el)
        npcs[i].el.style.filter = litFilter(terrainAt(npcs[i].x, npcs[i].y));
  }

  // light pools (orange T_LIGHT painted in the editor) brighten whoever stands in
  // them. litFilter() returns the scene's charFilter, with a brightness boost
  // appended when the given terrain is a light pool.
  var inLight = false,
    LIGHT_BOOST = 1.6; // multiplier; per-scene override via settings `lightBoost`
  function litFilter(terrain) {
    return terrain === T_LIGHT
      ? (charFilter ? charFilter + " " : "") + "brightness(" + LIGHT_BOOST + ")"
      : charFilter;
  }
  function updateCharLight() {
    var lit = feetTerrain() === T_LIGHT;
    if (lit !== inLight) {
      inLight = lit;
      elChar.style.filter = litFilter(lit ? T_LIGHT : 0);
    }
  }

  function buildCast() {
    clearCast();
    var list = Array.isArray(window.cast) ? window.cast : [];
    var specs = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i],
        s = typeof e === "string" ? { name: e } : e || {};
      // keep if rigged, OR if it carries a static pose image (no rig needed)
      if (s.pose || (s.name && CHAR_META[s.name])) specs.push(s);
    }
    var autoCount = 0;
    for (var k = 0; k < specs.length; k++) if (specs[k].x == null) autoCount++;
    var ai = 0,
      midY = col.top + (col.bottom - col.top) * 0.45;
    for (var j = 0; j < specs.length; j++) {
      var sp = specs[j],
        x = sp.x,
        y = sp.y == null ? midY : sp.y;
      if (x == null) {
        ai++;
        x = Math.round((bgWidth * ai) / (autoCount + 1));
        var w = nearestWalkable(x, y, 500);
        if (w) {
          x = w.x;
          y = w.y;
        }
      }
      var npc = {
        name: sp.name,
        x: x,
        y: y,
        facing: sp.facing || "f",
        // optional static default pose { src, w, h } (e.g. sitting) — overrides
        // the walk-idle frame. The image's bottom is the ground contact (= y).
        pose: sp.pose || null,
        // size multiplier on top of the perspective height (1 = normal). Lets a
        // cast member read bigger/smaller than depth alone — e.g. a looming heavy
        // or a figure set back behind a counter.
        scale: typeof sp.scale === "number" && sp.scale > 0 ? sp.scale : 1,
        // optional patrol path: [{x,y}, …] the NPC ambles in a loop (walk-sheet
        // cast only). pathSpeed scales the walk speed (1 = the hero's pace).
        path:
          Array.isArray(sp.path) && sp.path.length >= 2 && !sp.pose
            ? sp.path.map(function (p) {
                return { x: p.x, y: p.y };
              })
            : null,
        pathIndex: 1, // next waypoint to head for (0 is the start position)
        pathSpeed: typeof sp.pathSpeed === "number" ? sp.pathSpeed : 0.7,
        label:
          sp.label ||
          (sp.name ? sp.name.charAt(0).toUpperCase() + sp.name.slice(1) : "?"),
        dialog: normDialog(sp.dialog),
        r: 30,
        el: null,
      };
      // a patrolling NPC starts on the first waypoint
      if (npc.path) {
        npc.x = npc.path[0].x;
        npc.y = npc.path[0].y;
      }
      var el = document.createElement("div");
      el.className = "npc";
      el.style.cssText =
        "position:absolute;left:0;top:0;background-repeat:no-repeat;" +
        "pointer-events:auto;cursor:pointer;";
      el.style.filter = litFilter(terrainAt(npc.x, npc.y)); // scene light (+ pool)
      el.title = npc.label;
      el.addEventListener(
        "click",
        (function (n) {
          return function (ev) {
            ev.stopPropagation(); // don't also trigger a floor walk
            interactWithNpc(n);
          };
        })(npc),
      );
      elChar.parentNode.appendChild(el);
      npc.el = el;
      renderNpc(npc);
      npcs.push(npc);
    }
    applyNpcPlacements(); // overlay editor-saved positions/scales (settings `npcPlacements`)
    applyNpcPaths(); // overlay editor-saved patrol paths (settings `npcPaths`)
  }
  // Editor-saved NPC positions/scales (top-level `npcPlacements = [{npc,x,y,scale?}]`),
  // matched onto the cast by label/name — like npcPaths, since they can't be
  // written back into the nested `cast` objects.
  function applyNpcPlacements() {
    var defs = Array.isArray(window.npcPlacements) ? window.npcPlacements : [];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      if (!d) continue;
      for (var j = 0; j < npcs.length; j++) {
        var n = npcs[j];
        if (n.label !== d.npc && n.name !== d.npc) continue;
        if (typeof d.x === "number") n.x = d.x;
        if (typeof d.y === "number") n.y = d.y;
        if (typeof d.scale === "number" && d.scale > 0) n.scale = d.scale;
        if (typeof d.facing === "string") n.facing = d.facing;
        renderNpc(n);
        break;
      }
    }
  }
  // Editor-saved patrol paths live in a top-level `npcPaths = [{npc,path,speed?}]`
  // (paths can't be injected into the nested `cast` objects, so they're stored
  // beside them and matched back onto the cast by label/name here).
  function applyNpcPaths() {
    var defs = Array.isArray(window.npcPaths) ? window.npcPaths : [];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      if (!d || !Array.isArray(d.path) || d.path.length < 2) continue;
      for (var j = 0; j < npcs.length; j++) {
        var n = npcs[j];
        if (n.pose || (n.label !== d.npc && n.name !== d.npc)) continue;
        n.path = d.path.map(function (p) {
          return { x: p.x, y: p.y };
        });
        n.x = n.path[0].x;
        n.y = n.path[0].y;
        n.pathIndex = 1;
        if (typeof d.speed === "number") n.pathSpeed = d.speed;
        renderNpc(n);
        break;
      }
    }
  }
  // Some cast sheets were rigged with their side art mirrored opposite the hero
  // convention (CHAR_META.sideFlip). Swapping left/right at RENDER makes `facing`
  // intuitive for everyone — "l" faces left — both for static facings and walking.
  function sideFacing(name, facing) {
    var cm = CHAR_META[name];
    if (cm && cm.sideFlip)
      return facing === "l" ? "r" : facing === "r" ? "l" : facing;
    return facing;
  }
  function renderNpc(npc) {
    var el = npc.el;
    if (npc.pose) {
      // static pose image, drawn at its world size with feet at npc.y
      var ps = npc.scale || 1,
        pw = (npc.pose.w || 120) * ps,
        ph = (npc.pose.h || 200) * ps;
      el.style.backgroundImage = "url('" + npc.pose.src + "')";
      el.style.backgroundSize = "100% 100%";
      el.style.backgroundPosition = "0 0";
      el.style.width = pw + "px";
      el.style.height = ph + "px";
      el.style.transform =
        "translate3d(" + (npc.x - pw / 2) + "px," + (npc.y - ph) + "px,0)";
      el.style.zIndex = Math.round(npc.y);
      npc.r = Math.max(24, Math.min(60, pw * 0.32));
      return;
    }
    var rf = sideFacing(npc.name, npc.facing); // sideFlip cast read l/r mirrored
    var meta = mkMeta(CHAR_META[npc.name].walk),
      sheet = "characters/" + npc.name + "_walk_sheet.png",
      row = WALK_ROW[rf] != null ? WALK_ROW[rf] : 0,
      h = heightAt(npc.y) * (npc.scale || 1), // perspective height × per-NPC scale
      scale = h / meta.figureH,
      ew = meta.cellW * scale,
      eh = meta.cellH * scale;
    var fr = Math.floor(npc.frame || 0) % meta.frames; // 0 = idle; advances while gliding
    el.style.backgroundImage = "url('" + sheet + "')";
    el.style.backgroundSize = meta.frames * 100 + "% " + meta.rows * 100 + "%";
    el.style.backgroundPositionX =
      (meta.frames > 1 ? (fr / (meta.frames - 1)) * 100 : 0) + "%";
    el.style.backgroundPositionY =
      (meta.rows > 1 ? (row / (meta.rows - 1)) * 100 : 0) + "%";
    el.style.width = ew + "px";
    el.style.height = eh + "px";
    el.style.transform =
      "translate3d(" +
      (npc.x - ew / 2) +
      "px," +
      (npc.y - meta.feetY * scale) +
      "px,0)";
    el.style.zIndex = Math.round(npc.y);
    npc.r = Math.max(24, Math.min(60, ew * 0.3)); // collision footprint radius
  }


  // Patrolling cast: walk each path-NPC toward its next waypoint, looping. Paused
  // during dialog / transitions / editing so nobody wanders mid-scene. Movement
  // is perspective-correct (speed + size scale with depth as y changes).
  function updateNpcPaths(dt) {
    if (dialogOpen || transitioning || editor.on) return;
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      if (!n.path || n.path.length < 2 || n.moveTo) continue; // moveTo = dialog staging
      var tgt = n.path[n.pathIndex],
        dx = tgt.x - n.x,
        dy = tgt.y - n.y,
        d = Math.hypot(dx, dy);
      var step = speedAt(n.y) * (n.pathSpeed || 0.7) * dt;
      if (d <= step || d < 0.5) {
        n.x = tgt.x;
        n.y = tgt.y;
        n.pathIndex = (n.pathIndex + 1) % n.path.length; // loop back at the end
      } else {
        n.x += (dx / d) * step;
        n.y += (dy / d) * step;
        n.facing = faceCardinal(dx, dy); // face the way it's walking
      }
      n.frame = (n.frame || 0) + dt * 8; // advance the walk cycle
      renderNpc(n);
    }
  }

  // ---- talking to cast members --------------------------------------------
  // Click an NPC (walk over, then talk) or press Enter when standing near one.
  // A dialog is an array on the cast entry; entries are ["hero"|"npc", text],
  // { who, text }, or a plain string (speakers then alternate hero/npc).
  var pendingNpc = null; // NPC the hero is walking over to talk to
  var pendingZone = null; // action zone the hero is walking over to trigger (click)
  function normDialog(spec) {
    if (!Array.isArray(spec)) return null;
    var out = [];
    for (var i = 0; i < spec.length; i++) {
      var l = spec[i];
      if (Array.isArray(l)) out.push({ who: l[0], text: l[1] });
      else if (l && l.choice) out.push({ choice: l.choice }); // branching options
      else if (l && typeof l === "object")
        out.push({
          who: l.who || "npc",
          text: l.text || "",
          hero: l.hero,
          npc: l.npc,
        });
      else out.push({ who: i % 2 === 0 ? "hero" : "npc", text: String(l) });
    }
    return out;
  }
  function interactWithNpc(npc) {
    if (transitioning || editor.on || dialogOpen) return;
    var dest = nearestWalkable(npc.x, npc.y, 400);
    if (!dest) {
      startDialog(npc);
      return;
    }
    var path = findPath(player, dest);
    if (path && path.length) {
      pendingInteract = null;
      player.path = path;
      player.pathIndex = 0;
      player.runPath = false;
      pendingNpc = npc; // startDialog() fires when followPath finishes
    } else {
      startDialog(npc); // already adjacent
    }
  }
  function talkToNearest() {
    if (dialogOpen || transitioning || editor.on) return false;
    var best = null,
      bd = 0,
      RANGE = 130; // world px from the hero's feet
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i],
        d = Math.hypot(n.x - player.x, n.y - player.y);
      if (d < RANGE && (best === null || d < bd)) {
        best = n;
        bd = d;
      }
    }
    if (best) {
      startDialog(best);
      return true;
    }
    return false;
  }
  // Enter-key interaction: trigger whatever the hero is nearest to — an NPC
  // (talk), a world object (walk over + its action), or an action zone (run it).
  function interactNearest() {
    if (dialogOpen || transitioning || editor.on) return false;
    var RANGE = 140,
      best = null,
      bestD = Infinity,
      kind = null;
    function consider(d, obj, k) {
      if (d < bestD) {
        bestD = d;
        best = obj;
        kind = k;
      }
    }
    for (var i = 0; i < npcs.length; i++)
      consider(
        Math.hypot(npcs[i].x - player.x, npcs[i].y - player.y),
        npcs[i],
        "npc",
      );
    for (var j = 0; j < objects.length; j++)
      consider(
        Math.hypot(objects[j].x - player.x, objects[j].y - player.y),
        objects[j],
        "obj",
      );
    var zn = zoneNear(player.x, player.y, RANGE); // nearest settings zone point
    if (zn)
      consider(Math.hypot(zn.cx - player.x, zn.cy - player.y), zn, "zone");
    var zf = zoneAt(player.x, player.y); // standing on a painted zone always counts
    if (zf) consider(0, zf, "zone");
    if (!best || bestD > RANGE) return false;
    if (kind === "npc") startDialog(best);
    else if (kind === "obj") interactWith(best);
    else runZone(best);
    return true;
  }
  function startDialog(npc) {
    faceFrom(npc.x - player.x, npc.y - player.y || 0.001); // hero turns to the NPC
    player.path = null;
    player.runPath = false;
    openDialog(npc);
  }

  // ---- dialog box ----------------------------------------------------------
  var dialogOpen = false,
    dialogState = null,
    dialogEl = null,
    dialogWho = null,
    dialogText = null,
    dialogChoices = null,
    dialogHint = null;
  // ---- story flags (persisted) — drive branching choices/endings (story.md) --
  var story = {};
  try {
    story = JSON.parse(localStorage.getItem("nooir.story") || "{}") || {};
  } catch (e) {}
  function setFlag(k, v) {
    story[k] = v;
    try {
      localStorage.setItem("nooir.story", JSON.stringify(story));
    } catch (e) {}
  }
  function getFlag(k) {
    return story[k];
  }

  // ---- session env (persisted) — resume scene + character + weather on reload --
  // Holds only the player's MANUAL overrides (toolbar/API). Scene settings.js
  // still set their own defaults on load; a persisted value is overlaid on top so
  // your last rain / clouds / character / scene "sticks" across reloads. Cleared
  // by the ending card ("begin again").
  var env = {};
  try {
    env = JSON.parse(localStorage.getItem("nooir.env") || "{}") || {};
  } catch (e) {}
  function saveEnv(k, v) {
    if (v === undefined || v === null) delete env[k];
    else env[k] = v;
    try {
      localStorage.setItem("nooir.env", JSON.stringify(env));
    } catch (e) {}
  }
  function ensureDialogUI() {
    if (dialogEl) return;
    dialogEl = document.createElement("div");
    dialogEl.className = "dialog";
    dialogEl.style.cssText =
      "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);" +
      "width:min(680px,86%);background:rgba(8,8,10,.92);border:1px solid #555;" +
      "border-radius:8px;padding:14px 18px;z-index:100070;display:none;" +
      "cursor:pointer;font:15px/1.5 Georgia,serif;color:#e8e8e8;";
    dialogWho = document.createElement("div");
    dialogWho.style.cssText =
      "font:bold 12px system-ui;letter-spacing:.07em;text-transform:uppercase;" +
      "color:#9fb4c8;margin-bottom:5px;";
    dialogText = document.createElement("div");
    dialogChoices = document.createElement("div"); // branching options
    dialogChoices.style.cssText =
      "margin-top:10px;display:none;flex-direction:column;gap:6px;";
    dialogHint = document.createElement("div");
    dialogHint.textContent = "▶ click / Enter";
    dialogHint.style.cssText =
      "margin-top:8px;font:11px system-ui;color:#777;text-align:right;";
    dialogEl.appendChild(dialogWho);
    dialogEl.appendChild(dialogText);
    dialogEl.appendChild(dialogChoices);
    dialogEl.appendChild(dialogHint);
    // (advancing is handled by the document-level tap handler so it works
    // anywhere — the dialog box, the scene, or the letterbox bars on touch)
    document.body.appendChild(dialogEl);
  }
  function openDialog(npc) {
    ensureDialogUI();
    var lines =
      npc.dialog && npc.dialog.length
        ? npc.dialog
        : [{ who: "npc", text: "(" + npc.label + " has nothing to say.)" }];
    dialogState = { npc: npc, lines: lines, i: 0 };
    dialogOpen = true;
    dialogEl.style.display = "block";
    showDialogLine();
  }
  function heroLabel() {
    return window.heroName || character.charAt(0).toUpperCase() + character.slice(1);
  }
  function showDialogLine() {
    var ln = dialogState.lines[dialogState.i];
    if (ln.choice) {
      showChoice(ln.choice);
      return;
    }
    dialogChoices.style.display = "none";
    dialogText.style.display = "block";
    dialogHint.style.display = "block";
    dialogWho.textContent = ln.who === "hero" ? heroLabel() : dialogState.npc.label;
    dialogText.textContent = ln.text;
    setStageMove(player, ln.hero); // this turn may reposition the hero…
    setStageMove(dialogState.npc, ln.npc); // …and/or the NPC
  }
  // a choice line { choice:[ {text, set?, then?}, … ] } — the hero picks one;
  // `set` writes story flags, `then` is the branch that plays next.
  function showChoice(opts) {
    dialogWho.textContent = heroLabel();
    dialogText.style.display = "none";
    dialogHint.style.display = "none";
    dialogChoices.style.display = "flex";
    dialogChoices.innerHTML = "";
    opts.forEach(function (opt, idx) {
      var b = document.createElement("button");
      b.textContent = idx + 1 + ".  " + opt.text;
      b.style.cssText =
        "text-align:left;font:14px Georgia,serif;color:#e8e8e8;cursor:pointer;" +
        "background:rgba(255,255,255,.06);border:1px solid #555;border-radius:5px;padding:7px 11px;";
      b.onmouseenter = function () { b.style.background = "rgba(159,180,200,.2)"; };
      b.onmouseleave = function () { b.style.background = "rgba(255,255,255,.06)"; };
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        chooseOption(opt);
      });
      dialogChoices.appendChild(b);
    });
  }
  function chooseOption(opt) {
    if (opt.set) for (var k in opt.set) setFlag(k, opt.set[k]); // write flags
    var fn = opt.do; // optional callback (e.g. trigger an ending)
    if (Array.isArray(opt.then) && opt.then.length) {
      dialogState.lines = normDialog(opt.then);
      dialogState.i = -1;
      advanceDialog(); // play the branch
    } else {
      closeDialog(); // no follow-up lines
    }
    if (typeof fn === "function") try { fn(); } catch (e) {}
  }
  // full-screen ending card; click to begin again (clears story flags)
  function theEnd(title, text) {
    var ov = document.createElement("div");
    ov.style.cssText =
      "position:fixed;inset:0;z-index:200000;background:rgba(0,0,0,0);" +
      "transition:background 1.4s;display:flex;flex-direction:column;align-items:center;" +
      "justify-content:center;color:#e8e8e8;font:18px/1.7 Georgia,serif;text-align:center;" +
      "padding:0 12%;cursor:pointer;";
    function part(txt, css, delay) {
      var d = document.createElement("div");
      d.textContent = txt;
      d.style.cssText = css + "opacity:0;transition:opacity 1.8s " + delay + "s;";
      ov.appendChild(d);
      return d;
    }
    part(title || "", "font:bold 13px system-ui;letter-spacing:.3em;text-transform:uppercase;color:#9fb4c8;margin-bottom:22px;", 0.8);
    part(text || "", "max-width:660px;", 1.6);
    part("THE END", "margin-top:30px;font:bold 22px Georgia,serif;letter-spacing:.2em;", 3);
    part("click to begin again", "margin-top:40px;font:11px system-ui;color:#666;", 4.6);
    document.body.appendChild(ov);
    requestAnimationFrame(function () {
      ov.style.background = "rgba(4,4,6,.98)";
      for (var i = 0; i < ov.children.length; i++) ov.children[i].style.opacity = 1;
    });
    ov.addEventListener("click", function () {
      try {
        localStorage.removeItem("nooir.story"); // reset flags…
        localStorage.removeItem("nooir.env"); // …resume-state (scene/weather/character)…
        localStorage.removeItem("nooir.inv"); // …and the carried inventory
      } catch (e) {}
      location.reload();
    });
  }
  function advanceDialog() {
    if (!dialogOpen) return;
    var cur = dialogState.lines[dialogState.i];
    if (cur && cur.choice) return; // waiting on a choice — must click an option
    dialogState.i++;
    if (dialogState.i >= dialogState.lines.length) closeDialog();
    else showDialogLine();
  }
  function closeDialog() {
    // snap any unfinished staging move to its target so nobody is left mid-step
    if (player.moveTo) {
      player.x = player.moveTo.x;
      player.y = player.moveTo.y;
      if (player.moveTo.facing) player.facing = player.moveTo.facing;
      player.moveTo = null;
    }
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      if (!n.moveTo) continue;
      n.x = n.moveTo.x;
      n.y = n.moveTo.y;
      if (n.moveTo.facing) n.facing = n.moveTo.facing;
      n.moveTo = null;
      n.frame = 0;
      renderNpc(n);
    }
    dialogOpen = false;
    dialogState = null;
    if (dialogEl) dialogEl.style.display = "none";
  }

  // per-line staging: a dialog turn can reposition the hero and/or the NPC,
  // who then glide (walk-animated) to the target while the line is shown.
  // spec is { x, y, facing } — any field optional; facing-only turns in place.
  var NPC_GLIDE = 170; // px/s for NPC staging glides
  function faceCardinal(dx, dy) {
    return Math.abs(dx) > Math.abs(dy)
      ? dx > 0
        ? "r"
        : "l"
      : dy >= 0
        ? "f"
        : "b";
  }
  function setStageMove(obj, spec) {
    if (!spec) return;
    if (spec.x == null && spec.y == null) {
      if (spec.facing) obj.facing = spec.facing; // turn in place
      obj.moveTo = null;
      return;
    }
    obj.moveTo = {
      x: spec.x == null ? obj.x : spec.x,
      y: spec.y == null ? obj.y : spec.y,
      facing: spec.facing || null,
    };
  }
  function updateDialogMoves(dt) {
    if (player.moveTo) {
      var m = player.moveTo,
        dx = m.x - player.x,
        dy = m.y - player.y,
        d = Math.hypot(dx, dy),
        step = currentSpeed(false) * dt;
      if (d <= step || d < 0.5) {
        player.x = m.x;
        player.y = m.y;
        if (m.facing) player.facing = m.facing;
        player.moveTo = null;
        animate(dt, false);
      } else {
        player.x += (dx / d) * step;
        player.y += (dy / d) * step;
        faceFrom(dx, dy);
        animate(dt, true); // hero walk cycle plays while gliding
      }
    }
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      if (!n.moveTo) continue;
      var nx = n.moveTo.x - n.x,
        ny = n.moveTo.y - n.y,
        nd = Math.hypot(nx, ny),
        nstep = NPC_GLIDE * dt;
      if (nd <= nstep || nd < 0.5) {
        n.x = n.moveTo.x;
        n.y = n.moveTo.y;
        if (n.moveTo.facing) n.facing = n.moveTo.facing;
        n.frame = 0;
        n.moveTo = null;
      } else {
        n.x += (nx / nd) * nstep;
        n.y += (ny / nd) * nstep;
        n.facing = faceCardinal(nx, ny);
        n.frame = (n.frame || 0) + dt * 8; // NPC walk cycle
      }
      renderNpc(n);
    }
  }

  function playCharAnim(name, onEnd) {
    // run/kneel/reach…; null reverts to walk
    var a = CHAR_ANIMS[name];
    player.anim = a
      ? { def: a, t: 0, frame: 0, loop: !!a.loop, onEnd: onEnd || null }
      : null;
    if (a && !a.loop) {
      // one-shots (grab/pickup) are "do it in place" — halt any travel
      player.path = null;
      player.runPath = false;
    }
  }
  function updateCharAnim(dt) {
    var s = player.anim,
      a = s.def;
    s.t += dt;
    var f = Math.floor(s.t * a.fps);
    if (s.loop) {
      s.frame = f % a.frames;
    } else if (f >= a.frames) {
      var cb = s.onEnd;
      player.anim = null;
      if (cb) cb();
    } else {
      s.frame = f;
    }
  }

  // auto-engage the run cycle while running (Shift-move or far click), and clear
  // it when no longer running — without clobbering a one-shot or a manual setCharAnim.
  var autoRun = false;
  function manageRun(want) {
    if (player.anim && !player.anim.loop) {
      autoRun = false;
      return;
    } // one-shot is playing
    if (want) {
      if (!player.anim || player.anim.def !== CHAR_ANIMS.run) {
        playCharAnim("run");
        autoRun = true;
      }
    } else if (autoRun) {
      if (player.anim && player.anim.def === CHAR_ANIMS.run) player.anim = null;
      autoRun = false;
    }
  }

  // ---- input ---------------------------------------------------------------
  var keys = {};
  window.addEventListener("keydown", function (e) {
    keys[e.keyCode] = true;
  });
  window.addEventListener("keyup", function (e) {
    keys[e.keyCode] = false;
  });

  elGame.addEventListener("click", function (e) {
    // clicks on an NPC / object are handled by their own listeners — never let
    // them fall through to floor-walk (synthetic clicks can bubble past stopPropagation)
    var tc = e.target && e.target.classList;
    if (
      tc &&
      (tc.contains("npc") || tc.contains("object") || tc.contains("actionzone"))
    )
      return;
    if (dialogOpen) return; // don't walk during a conversation (a document-level
    // tap handler advances it — see below — so a tap anywhere, incl. the
    // letterbox bars, works on touch)
    if (transitioning || editor.on) return; // editor consumes clicks for painting
    var rect = elBg.getBoundingClientRect(); // .background spans the world (scaled)
    // map screen → world pixels, dividing out the fit-to-screen scale
    var wx = ((e.clientX - rect.left) * col.w) / rect.width,
      wy = ((e.clientY - rect.top) * col.h) / rect.height;
    // clicking an actionable scenery block (on its opaque pixels) runs its action
    var blk = blockActionAt(wx, wy);
    if (blk) {
      runZone({
        id: blk.action,
        index: -1,
        cx: Math.round(wx),
        cy: Math.round(blk.sortY),
      });
      return;
    }
    // clicking on/near an action zone (painted region or settings point) runs it
    var zone = zoneNear(wx, wy, 70) || zoneAt(wx, wy);
    var dest = nearestWalkable(wx, wy, 300);
    if (!dest) return;
    var path = findPath(player, dest);
    if (path && path.length) {
      pendingInteract = null; // a plain floor click cancels a pending grab…
      pendingNpc = null; // …and a pending talk
      pendingZone = zone; // …but a zone click queues that zone's action
      player.path = path;
      player.pathIndex = 0;
      player.runPath = !!keys[16]; // Shift+click runs; plain click walks
    } else if (zone) {
      runZone(zone); // already adjacent — just run it
    }
  });

  // ---- A* ------------------------------------------------------------------
  function findPath(start, goal) {
    var cols = Math.ceil(col.w / GRID),
      rows = Math.ceil(col.h / GRID);
    function cellWalkable(cx, cy) {
      return isWalkable(cx * GRID + GRID / 2, cy * GRID + GRID / 2);
    }
    var sx = Math.floor(start.x / GRID),
      sy = Math.floor(start.y / GRID);
    var gx = Math.floor(goal.x / GRID),
      gy = Math.floor(goal.y / GRID);
    if (!cellWalkable(gx, gy)) return null;

    var total = cols * rows;
    var gScore = new Float32Array(total).fill(Infinity);
    var fScore = new Float32Array(total).fill(Infinity);
    var came = new Int32Array(total).fill(-1);
    var closed = new Uint8Array(total);

    var startI = sy * cols + sx,
      goalI = gy * cols + gx;
    gScore[startI] = 0;
    fScore[startI] = heur(sx, sy, gx, gy);
    var open = new MinHeap();
    open.push(startI, fScore[startI]);

    var nb = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];

    while (open.size) {
      var cur = open.pop();
      if (cur === goalI) return reconstruct(cur);
      if (closed[cur]) continue;
      closed[cur] = 1;
      var cx = cur % cols,
        cy = (cur / cols) | 0;
      for (var n = 0; n < 8; n++) {
        var ox = nb[n][0],
          oy = nb[n][1];
        var nx = cx + ox,
          ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (!cellWalkable(nx, ny)) continue;
        // no cutting across a blocked corner on diagonals
        if (
          ox &&
          oy &&
          (!cellWalkable(cx + ox, cy) || !cellWalkable(cx, cy + oy))
        )
          continue;
        var ni = ny * cols + nx;
        if (closed[ni]) continue;
        var tentative = gScore[cur] + (ox && oy ? 1.41421356 : 1);
        if (tentative < gScore[ni]) {
          came[ni] = cur;
          gScore[ni] = tentative;
          fScore[ni] = tentative + heur(nx, ny, gx, gy);
          open.push(ni, fScore[ni]);
        }
      }
    }
    return null;

    function heur(ax, ay, bx, by) {
      var dx = ax - bx,
        dy = ay - by;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function reconstruct(cur) {
      var pts = [];
      while (cur !== -1) {
        pts.push({
          x: (cur % cols) * GRID + GRID / 2,
          y: ((cur / cols) | 0) * GRID + GRID / 2,
        });
        cur = came[cur];
      }
      pts.reverse();
      pts[0] = { x: start.x, y: start.y }; // exact start
      pts.push({ x: goal.x, y: goal.y }); // exact goal
      return smooth(pts);
    }
  }

  // collapse waypoints reachable in a straight walkable line
  function smooth(pts) {
    if (pts.length <= 2) return pts;
    var out = [pts[0]],
      anchor = 0;
    for (var i = 2; i < pts.length; i++) {
      if (!lineWalkable(pts[anchor], pts[i])) {
        out.push(pts[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function lineWalkable(a, b) {
    var dx = b.x - a.x,
      dy = b.y - a.y;
    var steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / 3)); // ~3px steps so paths don't graze obstacle edges
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      if (!isWalkable(a.x + dx * t, a.y + dy * t)) return false;
    }
    return true;
  }

  // binary min-heap keyed by priority
  function MinHeap() {
    this.items = [];
    this.prio = [];
    this.size = 0;
  }
  MinHeap.prototype.push = function (item, p) {
    this.items.push(item);
    this.prio.push(p);
    this.size++;
    var i = this.size - 1;
    while (i > 0) {
      var par = (i - 1) >> 1;
      if (this.prio[par] <= this.prio[i]) break;
      this._swap(i, par);
      i = par;
    }
  };
  MinHeap.prototype.pop = function () {
    var top = this.items[0],
      last = --this.size;
    this.items[0] = this.items[last];
    this.prio[0] = this.prio[last];
    this.items.pop();
    this.prio.pop();
    var i = 0;
    while (true) {
      var l = 2 * i + 1,
        r = 2 * i + 2,
        s = i;
      if (l < this.size && this.prio[l] < this.prio[s]) s = l;
      if (r < this.size && this.prio[r] < this.prio[s]) s = r;
      if (s === i) break;
      this._swap(i, s);
      i = s;
    }
    return top;
  };
  MinHeap.prototype._swap = function (a, b) {
    var ti = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = ti;
    var tp = this.prio[a];
    this.prio[a] = this.prio[b];
    this.prio[b] = tp;
  };

  // ---- movement ------------------------------------------------------------
  var KEY = { left: [37, 65], up: [38, 66], down: [40, 67], right: [39, 68] };
  function held(list) {
    for (var i = 0; i < list.length; i++) if (keys[list[i]]) return true;
    return false;
  }
  function anyMoveKey() {
    return held(KEY.left) || held(KEY.right) || held(KEY.up) || held(KEY.down);
  }

  function update(dt) {
    if (transitioning || dialogOpen) {
      animate(dt, false); // hero stands still during transitions / conversations
      return;
    }
    if (fx) {
      fx.t += dt;
      if (fx.t >= fx.dur) fx = null;
    } // advance any character effect
    clampToFloor(); // walkable area bounds where the feet can be
    var moved = false,
      running = false;

    if (anyMoveKey()) {
      player.path = null;
      pendingInteract = null; // keyboard cancels a pending grab…
      pendingNpc = null; // …and a pending talk…
      pendingZone = null; // …and a pending zone trigger
      player.runPath = false; // keyboard cancels click-to-walk
      running = !!keys[16]; // hold Shift to run
      var dx = (held(KEY.right) ? 1 : 0) - (held(KEY.left) ? 1 : 0);
      var dy = (held(KEY.down) ? 1 : 0) - (held(KEY.up) ? 1 : 0);
      if (dx || dy) {
        var len = Math.hypot(dx, dy),
          step = currentSpeed(running) * dt;
        moved = tryMove((dx / len) * step, (dy / len) * step);
        if (moved) faceFrom(dx, dy);
      }
    } else if (player.path) {
      running = player.runPath; // far click runs the whole path
      moved = followPath(dt, running);
    }

    manageRun(running && moved); // auto-engage/clear the run cycle
    if (player.anim)
      updateCharAnim(dt); // special cycle drives its own frames
    else animate(dt, moved); // default walk advances with movement
    updateCharLight(); // brighten the hero inside a light pool
    checkExit();
    checkAction();
  }

  // one-shot character effects (engine-owned, because render() controls the
  // sprite transform every frame). Start one with shake()/spin(); render() reads fx.
  var charFlip = false,
    fx = null;
  function shake(ms) {
    fx = { type: "shake", t: 0, dur: (ms || 400) / 1000 };
  }
  function spin(ms) {
    fx = { type: "spin", t: 0, dur: (ms || 600) / 1000 };
  }

  // Custom one-shot animations: spawn an element of {size} at world {from}, play
  // `frames` of a horizontal sprite strip at `fps` while it travels to {to}. When
  // done it's removed, onEnd() runs, and an (optionally inactive) zone is activated.
  //   Nooir.playAnimation({ image:'fx/spark.png', frames:6, fps:12, size:{w:64,h:64},
  //                         from:{x:300,y:700}, to:{x:500,y:600}, activates:'door' })
  var anims = [];
  function playAnimation(opts) {
    opts = opts || {};
    var from = opts.from || { x: 0, y: 0 },
      to = opts.to || from;
    var sz = opts.size || { w: 48, h: 48 };
    var frames = opts.frames || 1,
      fps = opts.fps || 12,
      loops = opts.loops || 1;
    var el = document.createElement("div");
    el.style.cssText =
      "position:absolute;left:0;top:0;pointer-events:none;will-change:transform;" +
      "width:" +
      sz.w +
      "px;height:" +
      sz.h +
      "px;z-index:" +
      (opts.z != null ? opts.z : 95000) +
      ";" +
      (opts.image
        ? "background-image:url('" +
          opts.image +
          "');background-repeat:no-repeat;" +
          "background-size:" +
          frames * 100 +
          "% 100%;"
        : "") +
      (opts.css || "");
    elGame.appendChild(el);
    anims.push({
      el: el,
      t: 0,
      dur: (frames * loops) / fps,
      from: from,
      to: to,
      sz: sz,
      frames: frames,
      fps: fps,
      onEnd: opts.onEnd,
      activates: opts.activates,
    });
    return el;
  }
  function updateAnims(dt) {
    for (var i = anims.length - 1; i >= 0; i--) {
      var a = anims[i];
      a.t += dt;
      var p = a.dur > 0 ? Math.min(1, a.t / a.dur) : 1;
      var x = a.from.x + (a.to.x - a.from.x) * p,
        y = a.from.y + (a.to.y - a.from.y) * p;
      a.el.style.transform =
        "translate3d(" + (x - a.sz.w / 2) + "px," + (y - a.sz.h / 2) + "px,0)";
      if (a.frames > 1)
        a.el.style.backgroundPositionX =
          ((Math.floor(a.t * a.fps) % a.frames) / (a.frames - 1)) * 100 + "%";
      if (a.t >= a.dur) {
        if (a.el.parentNode) a.el.parentNode.removeChild(a.el);
        anims.splice(i, 1);
        if (a.activates) setZoneActive(a.activates, true);
        if (typeof a.onEnd === "function") a.onEnd();
      }
    }
  }
  function clearAnims() {
    for (var i = 0; i < anims.length; i++)
      if (anims[i].el.parentNode)
        anims[i].el.parentNode.removeChild(anims[i].el);
    anims = [];
  }

  // ---- world objects + inventory ------------------------------------------
  // Placeable props/pickups: an image, a size, and a world position (x = the
  // figure's horizontal centre, y = its ground-contact/base). Click one and the
  // character walks to it, plays `anim` (default the grab cycle), then runs
  // onInteract; if `takeable`, it then vanishes into the inventory bar. Objects
  // are cleared on every level load (re-add them from the room's actions.js);
  // the inventory persists across levels, and a taken id won't respawn.
  var objects = [];
  // inventory persists across reloads (localStorage). Items carry {id, image};
  // hasItem(id) gates story logic and also stops a taken item respawning, so a
  // restored inventory resumes the run correctly. Cleared by "begin again".
  var inventory = [];
  try {
    inventory = JSON.parse(localStorage.getItem("nooir.inv") || "[]") || [];
  } catch (e) {}
  function saveInventory() {
    try {
      localStorage.setItem("nooir.inv", JSON.stringify(inventory));
    } catch (e) {}
  }
  var pendingInteract = null; // object the character is walking over to grab
  var invBar = null;

  function clearObjects() {
    for (var i = 0; i < objects.length; i++)
      if (objects[i].el && objects[i].el.parentNode)
        objects[i].el.parentNode.removeChild(objects[i].el);
    objects.length = 0;
    pendingInteract = null;
  }

  function hasItem(id) {
    for (var i = 0; i < inventory.length; i++)
      if (inventory[i].id === id) return true;
    return false;
  }

  function addObject(opts) {
    opts = opts || {};
    var id = opts.id || "obj" + objects.length;
    if (hasItem(id)) return null; // already in the inventory — don't respawn it
    var size = opts.size || {};
    var w = size.w || opts.w || 64,
      h = size.h || opts.h || 64;
    var o = {
      id: id,
      x: opts.x || 0,
      y: opts.y || 0,
      w: w,
      h: h,
      image: opts.image || "",
      takeable: !!opts.takeable,
      label: opts.label, // shown when the inventory item is tapped
      look: opts.look, // optional longer description on tap (falls back to label/id)
      anim: opts.anim === undefined ? "grab" : opts.anim, // null = no animation
      onInteract:
        typeof opts.onInteract === "function" ? opts.onInteract : null,
      el: null,
    };
    var el = document.createElement("div");
    el.className = "object";
    el.title = id;
    el.style.cssText =
      "position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;" +
      "width:" +
      w +
      "px;height:" +
      h +
      "px;" +
      "background-repeat:no-repeat;background-position:center bottom;" +
      "background-size:contain;" +
      (o.image ? "background-image:url('" + o.image + "');" : "") +
      "transform:translate3d(" +
      (o.x - w / 2) +
      "px," +
      (o.y - h) +
      "px,0);" +
      "z-index:" +
      Math.round(o.y) +
      ";";
    el.addEventListener("click", function (e) {
      e.stopPropagation(); // don't also trigger floor click-to-walk
      interactWith(o);
    });
    elChar.parentNode.appendChild(el);
    o.el = el;
    objects.push(o);
    return o;
  }

  function interactWith(o) {
    if (transitioning || editor.on) return;
    var dest = nearestWalkable(o.x, o.y, 400) || { x: o.x, y: o.y };
    var path = findPath(player, dest);
    if (path && path.length) {
      player.path = path;
      player.pathIndex = 0;
      player.runPath = false;
      pendingInteract = o; // arriveAt() fires when followPath finishes
    } else {
      arriveAt(o); // already adjacent (or unreachable) — just do it
    }
  }

  function arriveAt(o) {
    faceFrom(o.x - player.x, o.y - player.y || 0.001); // turn toward it
    var finish = function () {
      if (o.onInteract) o.onInteract(o);
      if (o.takeable) takeObject(o);
    };
    if (o.anim && CHAR_ANIMS[o.anim]) playCharAnim(o.anim, finish);
    else finish();
  }

  function takeObject(o) {
    if (o.el && o.el.parentNode) o.el.parentNode.removeChild(o.el);
    var i = objects.indexOf(o);
    if (i >= 0) objects.splice(i, 1);
    if (!hasItem(o.id))
      inventory.push({
        id: o.id,
        image: o.image,
        label: o.label,
        look: o.look,
      });
    saveInventory(); // persist across reloads
    renderInventory();
  }

  function ensureInvBar() {
    if (invBar) return;
    invBar = document.createElement("div");
    invBar.className = "inventory";
    invBar.style.cssText =
      "position:fixed;left:50%;top:8px;transform:translateX(-50%);" +
      "display:none;gap:6px;padding:5px 7px;border-radius:6px;" +
      "background:rgba(0,0,0,.45);z-index:100040;pointer-events:none;";
    document.body.appendChild(invBar);
  }

  function renderInventory() {
    ensureInvBar();
    invBar.innerHTML = "";
    invBar.style.display = inventory.length ? "flex" : "none";
    for (var i = 0; i < inventory.length; i++) {
      var item = inventory[i];
      var slot = document.createElement("div");
      slot.title = item.label || item.id;
      slot.style.cssText =
        "width:42px;height:42px;border:1px solid #555;border-radius:4px;" +
        "background-color:rgba(255,255,255,.06);background-repeat:no-repeat;" +
        "background-position:center;background-size:contain;" +
        "pointer-events:auto;cursor:pointer;" + // tappable on touch
        (item.image ? "background-image:url('" + item.image + "');" : "");
      slot.addEventListener(
        "click",
        (function (it) {
          return function (ev) {
            ev.stopPropagation(); // don't advance dialog / walk
            flashMsg(it.look || it.label || it.id, 1800);
          };
        })(item),
      );
      invBar.appendChild(slot);
    }
  }

  // built-in actions, keyed by zone id. Zones sharing an id share the behaviour.
  // Per-level rooms/sceneN/js/actions.js can add/override more (see resetActions).
  var BUILTIN_ACTIONS = {
    message: function (z) {
      flashMsg('Zone "' + z.id + '"', 1400);
    },
    clouds: function () {
      cloudDir = -cloudDir;
    }, // reverse the sky drift
    flip: function () {
      charFlip = !charFlip;
    }, // turn the guy on his head
    shake: function () {
      shake(400);
    }, // a quick stumble
    rock: function () {
      shake(450);
    }, // bumped a rock
  };
  var ACTIONS = {};
  function resetActions() {
    // built-ins only; level actions.js re-adds its own
    for (var k in ACTIONS) delete ACTIONS[k];
    for (var b in BUILTIN_ACTIONS) ACTIONS[b] = BUILTIN_ACTIONS[b];
    zoneActive = {}; // all zones active until actions.js says otherwise
    clearAnims();
    clearObjects(); // room actions.js re-adds its objects (taken ids stay gone)
  }
  resetActions();

  var curZone = -1;
  // the action zone covering a world point (or null); used by feet-enter,
  // click and Enter so a zone can be triggered any of those ways.
  function zoneAt(x, y) {
    if (terrainAt(x, y) !== T_ACTION) return null;
    var idx = actionLabels ? actionLabels[(y | 0) * col.w + (x | 0)] - 1 : 0;
    return actionZones[idx] || { id: idx, index: idx, cx: x | 0, cy: y | 0 };
  }
  // settings.js action zones double as interaction POINTS (id + cx/cy), so they
  // can be clicked / Entered even when not painted as walkable yellow regions.
  function zoneNear(x, y, radius) {
    var zs = Array.isArray(window.actionZones) ? window.actionZones : [];
    var best = null,
      bd = radius;
    for (var i = 0; i < zs.length; i++) {
      var z = zs[i];
      if (z.cx == null) continue;
      var d = Math.hypot(z.cx - x, z.cy - y);
      if (d < bd) {
        bd = d;
        best = { id: z.id, index: i, cx: z.cx, cy: z.cy };
      }
    }
    return best;
  }
  function runZone(z) {
    if (!z || !isZoneActive(z.id)) return; // zone switched off until activated
    var info = {
      id: z.id,
      index: z.index,
      cx: z.cx,
      cy: z.cy,
      x: Math.round(player.x),
      y: Math.round(player.y),
      level: level,
    };
    var act = ACTIONS[z.id];
    if (act) act(info); // run the built-in behaviour
    var cb = window.Nooir && window.Nooir.onAction;
    if (typeof cb === "function") cb(info); // and any custom hook
    if (!act && typeof cb !== "function")
      flashMsg('Action zone "' + z.id + '"', 900);
  }
  // tappable hit-areas over the (invisible) settings action zones, so a tap walks
  // the hero to the zone and triggers it (touch parity with Enter / a near-tap).
  var zoneEls = [];
  function clearZoneEls() {
    for (var i = 0; i < zoneEls.length; i++)
      if (zoneEls[i].parentNode) zoneEls[i].parentNode.removeChild(zoneEls[i]);
    zoneEls.length = 0;
  }
  function buildZoneHitAreas() {
    clearZoneEls();
    for (var i = 0; i < zoneDefs.length; i++) {
      var zd = zoneDefs[i];
      if (zd.cx == null || zd.cy == null) continue;
      var sz = zd.r ? zd.r * 2 : 120; // generous tap target
      var el = document.createElement("div");
      el.className = "actionzone";
      el.title = zd.id;
      el.style.cssText =
        "position:absolute;left:0;top:0;width:" +
        sz +
        "px;height:" +
        sz +
        "px;transform:translate3d(" +
        (zd.cx - sz / 2) +
        "px," +
        (zd.cy - sz / 2) +
        "px,0);pointer-events:auto;cursor:pointer;z-index:" +
        Math.round(zd.cy) +
        ";";
      el.addEventListener(
        "click",
        (function (z) {
          return function () {
            tapZone(z);
          };
        })(zd),
      );
      elChar.parentNode.appendChild(el);
      zoneEls.push(el);
    }
  }
  function tapZone(zd) {
    if (dialogOpen || transitioning || editor.on) return;
    var z = zd; // prefer the computed zone (carries an index) if one exists
    for (var i = 0; i < actionZones.length; i++)
      if (actionZones[i].id === zd.id) {
        z = actionZones[i];
        break;
      }
    var dest = nearestWalkable(zd.cx, zd.cy, 400) || { x: zd.cx, y: zd.cy };
    var path = findPath(player, dest);
    if (path && path.length) {
      pendingInteract = null;
      pendingNpc = null;
      pendingZone = z; // runs on arrival (followPath)
      player.path = path;
      player.pathIndex = 0;
    } else runZone(z);
  }
  function checkAction() {
    var z = zoneAt(player.x, player.y);
    if (!z) {
      curZone = -1;
      return;
    }
    if (z.index === curZone) return; // already standing in this zone
    curZone = z.index;
    runZone(z); // fires once when the feet enter the zone
  }

  // keep the character's feet on the walkable area; if it ends up off the floor
  // (e.g. the map was just edited), drop straight down onto it, else snap nearest.
  function clampToFloor() {
    if (isWalkable(player.x, player.y)) return;
    for (var y = player.y | 0; y < col.h; y++) {
      if (isWalkable(player.x, y)) {
        player.y = y;
        player.path = null;
        return;
      }
    }
    var s = nearestWalkable(player.x, player.y, 800);
    if (s) {
      player.x = s.x;
      player.y = s.y;
      player.path = null;
    }
  }

  function tryMove(mx, my) {
    var nx = player.x + mx,
      ny = player.y + my;
    if (isWalkable(nx, ny)) {
      player.x = nx;
      player.y = ny;
      return true;
    }
    if (isWalkable(nx, player.y)) {
      player.x = nx;
      return true;
    } // slide along a wall
    if (isWalkable(player.x, ny)) {
      player.y = ny;
      return true;
    }
    return false;
  }

  function followPath(dt, running) {
    var path = player.path,
      budget = currentSpeed(running) * dt,
      moved = false;
    while (budget > 0 && player.pathIndex < path.length) {
      var t = path[player.pathIndex];
      var dx = t.x - player.x,
        dy = t.y - player.y;
      var dist = Math.hypot(dx, dy);
      if (dist <= budget) {
        player.x = t.x;
        player.y = t.y;
        budget -= dist;
        player.pathIndex++;
        moved = true;
        if (dist > 0) faceFrom(dx, dy);
      } else {
        player.x += (dx / dist) * budget;
        player.y += (dy / dist) * budget;
        faceFrom(dx, dy);
        budget = 0;
        moved = true;
      }
    }
    if (player.pathIndex >= path.length) {
      player.path = null;
      if (pendingInteract) {
        var o = pendingInteract;
        pendingInteract = null;
        arriveAt(o); // reached the object — grab it
      } else if (pendingNpc) {
        var n = pendingNpc;
        pendingNpc = null;
        startDialog(n); // reached the NPC — talk
      } else if (pendingZone) {
        var z = pendingZone;
        pendingZone = null;
        curZone = z.index; // prevent checkAction double-firing on arrival
        runZone(z); // reached the clicked zone — run it
      }
    }
    return moved;
  }

  function faceFrom(dx, dy) {
    // 8-way: near-horizontal -> r/l, near-vertical -> f/b, else diagonal
    // (fr/fl/br/bl). f = toward camera/down, b = away/up.
    var ax = Math.abs(dx),
      ay = Math.abs(dy);
    if (ay < ax * 0.36) player.facing = dx > 0 ? "r" : "l";
    else if (ax < ay * 0.36) player.facing = dy >= 0 ? "f" : "b";
    else player.facing = (dy >= 0 ? "f" : "b") + (dx > 0 ? "r" : "l");
  }

  function animate(dt, moving) {
    if (moving) {
      player.animAcc += dt * 1000;
      while (player.animAcc >= walkMs) {
        player.animAcc -= walkMs;
        // cycle length follows the active character's walk frame count
        player.frame = (player.frame % WALK_META.frames) + 1;
      }
    } else {
      player.frame = 1;
      player.animAcc = 0;
    }
    player.moving = moving;
  }

  // ---- exit / level transition ---------------------------------------------
  var transitioning = false;
  function checkExit() {
    if (transitioning || !exitLabels) return;
    // The door the feet stand on decides where we go. Each painted green/blue
    // region is its own component with a resolved `to` (from the settings `exits`
    // map, or the exitTo/backTo colour fallback). The story order is NOT the
    // scene-number order, so the target is whatever that door declared. 0 /
    // out-of-range = a dead end (start has no back, finale no forward) = no-op.
    var px = player.x | 0,
      py = player.y | 0;
    if (px < 0 || py < 0 || px >= col.w || py >= col.h) return;
    var lbl = exitLabels[py * col.w + px];
    if (!lbl) return;
    var z = exitZones[lbl - 1];
    var dest = z ? z.to : 0;
    if (dest >= 1 && dest <= MAX_LEVEL && dest !== level) {
      transitioning = true;
      transitionTo(dest);
    }
  }

  function goToLevel(n) {
    // switch level with the fade transition (used by the toolbar level picker)
    if (!transitioning && n >= 1 && n <= MAX_LEVEL && n !== level) {
      transitioning = true;
      transitionTo(n);
    }
  }
  function transitionTo(n) {
    ensureFade();
    fade.style.opacity = 1;
    wait(450)
      .then(function () {
        return loadLevel(n);
      })
      .then(function () {
        fade.style.opacity = 0;
        transitioning = false;
      });
  }

  function ensureFade() {
    if (fade) return;
    fade = document.createElement("div");
    fade.style.cssText =
      "position:fixed;inset:0;background:#000;opacity:0;transition:opacity .45s;pointer-events:none;z-index:200;";
    document.body.appendChild(fade);
  }
  function wait(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  var msgTimer;
  function showMsg(text) {
    elMsg.textContent = text;
    elMsg.style.opacity = 1;
    elMsg.style.left = bgWidth / 2 + "px";
    elMsg.style.marginLeft = "-100px";
  }
  function flashMsg(text, ms) {
    showMsg(text);
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () {
      elMsg.style.opacity = 0;
    }, ms);
  }

  // ---- render --------------------------------------------------------------
  var curBg = "";
  function setBg(url) {
    if (curBg !== url) {
      elChar.style.backgroundImage = "url('" + url + "')";
      curBg = url;
    }
  }

  function render() {
    // one-shot effect offsets layered on top of the base transform
    var fxX = 0,
      fxRot = charFlip ? 180 : 0;
    if (fx) {
      var k = 1 - fx.t / fx.dur; // decay to zero
      if (fx.type === "shake") fxX = Math.sin(fx.t * 48) * 9 * k;
      else if (fx.type === "spin") fxRot += (fx.t / fx.dur) * 360;
    }
    var h = heightAt(player.y),
      left,
      top,
      flip = false;
    if (player.anim) {
      // special cycle: scale its cell so the figure is h tall, feet at player.y
      var a = player.anim.def,
        scale = h / a.figureH,
        ew = a.cellW * scale,
        eh = a.cellH * scale;
      elChar.style.backgroundPositionX =
        (a.frames > 1 ? (player.anim.frame / (a.frames - 1)) * 100 : 0) + "%";
      if (a.sheet) {
        // directional multi-row sheet: pick the row for the facing (diagonals
        // fall back to their horizontal side, since cycles are 4-direction)
        var pd = a.dir[player.facing] ||
          a.dir[
            player.facing.length > 1 ? player.facing.charAt(1) : player.facing
          ] ||
          a.dir.r || { row: 0 };
        flip = !!pd.flip;
        setBg(a.sheet);
        elChar.style.backgroundSize =
          a.frames * 100 + "% " + a.rows * 100 + "%";
        elChar.style.backgroundPositionY =
          (a.rows > 1 ? (pd.row / (a.rows - 1)) * 100 : 0) + "%";
      } else {
        // single-row strip mirrored for left/right
        setBg(a.sheets[player.facing === "l" ? "l" : "r"]);
        elChar.style.backgroundSize = a.frames * 100 + "% 100%";
        elChar.style.backgroundPositionY = "0%";
      }
      elChar.style.width = ew + "px";
      elChar.style.height = eh + "px";
      left = player.x - ew / 2 + fxX;
      top = player.y - a.feetY * scale;
    } else {
      // default walk: cardinals from the walk sheet, diagonals from the sides
      // sheet — one row per facing, scaled by its own figure metrics.
      var wd = walkDef(player.facing),
        m = wd.m,
        wsc = h / m.figureH,
        wew = m.cellW * wsc,
        weh = m.cellH * wsc;
      var wf = (player.frame - 1) % m.frames;
      setBg(wd.sheet);
      elChar.style.backgroundSize = m.frames * 100 + "% " + m.rows * 100 + "%";
      elChar.style.backgroundPositionX =
        (m.frames > 1 ? (wf / (m.frames - 1)) * 100 : 0) + "%";
      elChar.style.backgroundPositionY =
        (m.rows > 1 ? (wd.row / (m.rows - 1)) * 100 : 0) + "%";
      elChar.style.width = wew + "px";
      elChar.style.height = weh + "px";
      left = player.x - wew / 2 + fxX;
      top = player.y - m.feetY * wsc;
    }
    elChar.style.transform =
      "translate3d(" +
      left +
      "px," +
      top +
      "px,0)" +
      (flip ? " scaleX(-1)" : "") +
      (fxRot ? " rotate(" + fxRot + "deg)" : "");
    // depth sort: nearer (larger feet y) = higher z = drawn in front
    elChar.style.zIndex = Math.round(player.y);
  }

  // ---- level loading -------------------------------------------------------
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }
  function loadScriptOptional(src) {
    // resolves even if the file is missing
    return new Promise(function (resolve) {
      var s = document.createElement("script");
      s.src = src + "?t=" + Date.now(); // always fetch fresh (you edit it live)
      s.onload = resolve;
      s.onerror = function () {
        resolve();
      };
      document.body.appendChild(s);
    });
  }

  // ---- object blocks: depth-sorted scenery layers -------------------------
  // settings.js may set objBlocks = [{ src, bottomY, topY?, id?, action? }].
  // Each is a full-scene PNG (like fence.png, mostly transparent) drawn at its
  // ground-contact depth `bottomY`: the hero passes BEHIND it when his feet are
  // deeper (smaller y) and IN FRONT when nearer — so any number of props can
  // overlap him correctly. `action` (a string id) runs when its opaque pixels
  // are clicked. Replaces the single .fence layer; rebuilt on every level.
  var objBlocks = [];
  function clearObjBlocks() {
    for (var i = 0; i < objBlocks.length; i++)
      if (objBlocks[i].el && objBlocks[i].el.parentNode)
        objBlocks[i].el.parentNode.removeChild(objBlocks[i].el);
    objBlocks.length = 0;
  }
  function buildObjBlocks() {
    clearObjBlocks();
    var list = Array.isArray(window.objBlocks) ? window.objBlocks : [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      // an animated block cycles `animate.frames` (no static `src` needed)
      var anim =
        d && d.animate && Array.isArray(d.animate.frames) && d.animate.frames.length
          ? d.animate
          : null;
      if (!d || (!d.src && !anim)) continue;
      // positioned: { x (centre), y (base), w?, h? } placed as a sprite;
      // an animated block is a positioned sprite when it has posX/posY, else a
      // full-scene overlay scaled to the world (for full-frame smoke/fog/etc).
      var positioned = anim
        ? anim.posX != null || anim.posY != null
        : d.x != null || d.y != null;
      var sortY =
        anim != null
          ? anim.bottomY != null
            ? anim.bottomY
            : d.bottomY != null
              ? d.bottomY
              : anim.posY || 0
          : d.bottomY != null
            ? d.bottomY
            : positioned
              ? d.y != null
                ? d.y
                : 0
              : d.sortY != null
                ? d.sortY
                : d.topY || 0;
      var first = anim ? anim.frames[0] : d.src;
      var url = anim
        ? "rooms/scene" + level + "/" + first
        : d._url || "rooms/scene" + level + "/" + d.src; // _url = live preview
      var el = document.createElement("div");
      el.className = "objblock";
      el.style.cssText =
        "position:absolute;left:0;top:0;pointer-events:none;" +
        "background-repeat:no-repeat;background-image:url('" +
        url +
        "');" +
        "z-index:" +
        Math.round(sortY) +
        ";";
      elFence.parentNode.appendChild(el);
      var b = {
        el: el,
        def: d,
        src: first,
        sortY: sortY,
        action: anim ? null : d.action,
        positioned: positioned,
        x0: 0,
        y0: 0,
        w: 0,
        h: 0,
        imgW: 0,
        imgH: 0,
        hitCtx: null,
        anim: null,
      };
      if (anim) {
        var nf = anim.frames.length;
        // playback order of frame indices: forward / reverse / ping-pong. The
        // rest of the animator just walks this array, so all modes share one path.
        var mode =
          anim.mode ||
          (anim.pingpong ? "pingpong" : anim.reverse ? "reverse" : "forward");
        var order = [];
        if (mode === "reverse") for (var k = nf - 1; k >= 0; k--) order.push(k);
        else if (mode === "pingpong") {
          for (var k = 0; k < nf; k++) order.push(k);
          for (var k = nf - 2; k >= 1; k--) order.push(k); // back without repeating ends
        } else for (var k = 0; k < nf; k++) order.push(k);
        b.anim = {
          frames: anim.frames.map(function (f) {
            return "rooms/scene" + level + "/" + f;
          }),
          order: order,
          mode: mode,
          speed: typeof anim.speed === "number" ? anim.speed : 0.2, // sec/frame
          pause: typeof anim.pause === "number" ? anim.pause : 0, // sec at loop end
          posX: anim.posX || 0,
          posY: anim.posY || 0,
          w: anim.w || 0,
          h: anim.h || 0,
          // z-depth from animate.bottomY or the objBlock's own bottomY
          bottomY:
            anim.bottomY != null
              ? anim.bottomY
              : d.bottomY != null
                ? d.bottomY
                : null,
          fadeIn: typeof anim.fadeIn === "number" ? anim.fadeIn : 0, // sec 0→1 at cycle start
          fadeOut: typeof anim.fadeOut === "number" ? anim.fadeOut : 0, // sec 1→0 at cycle end
          si: -1, // last step index played (forces the first swap)
          t: 0,
        };
        if (b.anim.fadeIn) el.style.opacity = "0"; // start invisible, fade in
        b.anim.frames.forEach(function (u) {
          var im = new Image();
          im.src = u;
        }); // preload to avoid flicker
      }
      layoutBlock(b, url); // sizes/positions once the image dimensions are known
      objBlocks.push(b);
    }
  }
  function layoutBlock(b, url) {
    var img = new Image();
    img.onload = function () {
      b.imgW = img.naturalWidth;
      b.imgH = img.naturalHeight;
      if (b.anim && b.positioned) {
        // animated sprite: posX/posY = top-left, depth by its bottom edge
        var aw = b.anim.w || img.naturalWidth,
          ah = b.anim.h || img.naturalHeight;
        b.x0 = b.anim.posX || 0;
        b.y0 = b.anim.posY || 0;
        b.w = aw;
        b.h = ah;
        b.el.style.width = aw + "px";
        b.el.style.height = ah + "px";
        b.el.style.backgroundSize = "100% 100%";
        b.el.style.transform = "translate3d(" + b.x0 + "px," + b.y0 + "px,0)";
        b.el.style.zIndex = Math.round(
          b.anim.bottomY != null ? b.anim.bottomY : b.y0 + ah,
        );
      } else if (b.anim) {
        // full-scene animated overlay (full-frame smoke/fog) — scaled to the
        // world width, top-aligned, like the background; `bottomY` sets depth.
        b.x0 = 0;
        b.y0 = 0;
        b.w = bgWidth;
        b.h = (bgWidth * img.naturalHeight) / img.naturalWidth;
        b.el.style.width = bgWidth + "px";
        b.el.style.height = "100%";
        b.el.style.backgroundPosition = "center top";
        b.el.style.backgroundSize = "100%";
        if (b.anim.bottomY != null)
          b.el.style.zIndex = Math.round(b.anim.bottomY);
      } else if (b.positioned) {
        var w = b.def.w || img.naturalWidth,
          h = b.def.h || img.naturalHeight,
          cx = b.def.x != null ? b.def.x : 0,
          by = b.def.y != null ? b.def.y : 0;
        b.x0 = cx - w / 2;
        b.y0 = by - h;
        b.w = w;
        b.h = h;
        b.el.style.width = w + "px";
        b.el.style.height = h + "px";
        b.el.style.backgroundSize = "100% 100%";
        b.el.style.transform = "translate3d(" + b.x0 + "px," + b.y0 + "px,0)";
      } else {
        // full-scene: scaled to the world width, top-aligned
        b.x0 = 0;
        b.y0 = 0;
        b.w = bgWidth;
        b.h = (bgWidth * img.naturalHeight) / img.naturalWidth;
        b.el.style.width = bgWidth + "px";
        b.el.style.height = "100%";
        b.el.style.backgroundPosition = "center top";
        b.el.style.backgroundSize = "100%";
      }
      if (b.action) {
        var c = document.createElement("canvas");
        c.width = b.imgW;
        c.height = b.imgH;
        c.getContext("2d").drawImage(img, 0, 0);
        b.hitCtx = c.getContext("2d");
      }
    };
    img.src = url;
  }
  // advance animated objBlocks. One cycle clock (a.t) drives both the frame and
  // the optional fade, so the looping stays in sync.
  //   animate:{ frames, speed, pause, posX, posY, bottomY, fadeIn, fadeOut }
  function updateObjBlocks(dt) {
    for (var i = 0; i < objBlocks.length; i++) {
      var b = objBlocks[i],
        a = b.anim;
      if (!a || a.order.length < 2) continue;
      var m = a.order.length, // steps in the playback order (mode-dependent)
        animDur = m * a.speed, // time to walk the whole order once
        cycleDur = animDur + a.pause; // + the end-of-loop pause
      a.t += dt;
      if (a.t >= cycleDur) a.t -= cycleDur; // loop
      // step through the order during the play phase, hold the last through the pause
      var si = a.t < animDur ? Math.floor(a.t / a.speed) : m - 1;
      if (si > m - 1) si = m - 1;
      if (si !== a.si) {
        a.si = si;
        b.el.style.backgroundImage = "url('" + a.frames[a.order[si]] + "')";
      }
      // opacity: fade in over the first fadeIn sec, out over the last fadeOut sec
      if (a.fadeIn || a.fadeOut) {
        var op = 1;
        if (a.fadeIn && a.t < a.fadeIn) op = a.t / a.fadeIn;
        if (a.fadeOut && a.t > cycleDur - a.fadeOut)
          op = Math.min(op, (cycleDur - a.t) / a.fadeOut);
        b.el.style.opacity = (op < 0 ? 0 : op > 1 ? 1 : op).toFixed(3);
      }
    }
  }
  function blockActionAt(wx, wy) {
    // front-most actionable block whose pixel under (wx,wy) is opaque
    var best = null;
    for (var i = 0; i < objBlocks.length; i++) {
      var b = objBlocks[i];
      if (!b.action || !b.hitCtx || !b.w || !b.h) continue;
      var ix = Math.round(((wx - b.x0) / b.w) * b.imgW),
        iy = Math.round(((wy - b.y0) / b.h) * b.imgH);
      if (ix < 0 || iy < 0 || ix >= b.imgW || iy >= b.imgH) continue;
      var a = 0;
      try {
        a = b.hitCtx.getImageData(ix, iy, 1, 1).data[3];
      } catch (e) {}
      if (a > 24 && (best === null || b.sortY > best.sortY)) best = b;
    }
    return best;
  }

  function applyRoomConfig() {
    level = window.scene || window.level || 1; // scene index (window.level = legacy)
    if (levelSelect) levelSelect.value = level; // sync the toolbar picker
    character = window.character || "hatguy";
    bgWidth = window.backgroundSize || 1300;
    spawnX = window.startingPoint || 60;
    // (exits are painted green zones now — no x-threshold door)
    // perspective is a continuous function of feet-depth (no per-band tables):
    // height lerps farHeight..nearHeight across the floor, speed scales with it.
    FAR_H = typeof window.farHeight === "number" ? window.farHeight : 60;
    NEAR_H = typeof window.nearHeight === "number" ? window.nearHeight : 200;
    if (editor) {
      editor.perspEdited = false; // fresh scene — reset the placement edit-flags
      editor.heroPlaced = false;
      editor.npcsPlaced = false;
      editor.perspDrag = false;
      editor.perspTarget = null;
      editor.perspSel = null;
    }
    fenceY = typeof window.fenceY === "number" ? window.fenceY : Infinity;
    zoneDefs = Array.isArray(window.actionZones)
      ? window.actionZones.slice()
      : [];
    exitDefs = Array.isArray(window.exits) ? window.exits.slice() : []; // multi-door redirects
    cloudSpeed = typeof window.cloudSpeed === "number" ? window.cloudSpeed : 0; // px/s
    cloudDir = window.cloudDir < 0 ? -1 : 1; // 1 = right, -1 = left
    setRain(window.rain); // 0/undefined = dry, true or 0..1 = rain intensity

    // overlay the player's persisted overrides on top of the scene defaults, so
    // a manual rain / clouds choice survives scene changes + reloads (see env)
    if (typeof env.rain === "number") setRain(env.rain);
    if (typeof env.cloudSpeed === "number") {
      cloudSpeed = env.cloudSpeed;
      cloudDir = env.cloudDir < 0 ? -1 : 1;
    }
    if (cloudSlider) cloudSlider.value = cloudDir * cloudSpeed; // sync slider
    if (typeof env.bright === "boolean") {
      bright = env.bright; // applyBright() below renders it for this scene
      if (brightBtn) brightBtn.textContent = bright ? "☀ Bright" : "☾ Dark";
    }
    saveEnv("level", level); // remember the current scene for next reload

    // fence sits at its ground-contact depth; the character (z = feet y) draws
    // behind it when further back and in front of it when nearer. It's scenery,
    // so it must NEVER capture the mouse (it would otherwise sit above the editor
    // canvas and swallow paint/drag clicks). Unused now that objBlocks exist, but
    // kept for legacy levels that still set fenceY.
    elFence.style.zIndex = fenceY === Infinity ? 0 : Math.round(fenceY);
    elFence.style.pointerEvents = "none";

    // drifting clouds: tile horizontally so the scroll is continuous
    cloudOffset = 0;
    elClouds.style.backgroundRepeat = cloudSpeed ? "repeat-x" : "no-repeat";
    elClouds.style.backgroundPositionX = "0px";
    applyBright(); // re-assert bright/dark sky for this level's clouds path

    // rig the active character: walk/sides sheets, per-character cell metadata
    // and the run/pickup/grab cycles. A live test switch (charOverride) wins.
    applyCharacter(charOverride || character);
    if (charSelect) charSelect.value = character; // keep the toolbar in sync
    charFilter = buildCharFilter(window.charTint); // per-scene character lighting
    LIGHT_BOOST =
      typeof window.lightBoost === "number" ? window.lightBoost : 1.6; // light-pool strength
    inLight = false; // re-evaluated by updateCharLight() on the next frame
    elChar.style.filter = charFilter; // (NPCs get it in buildCast)
    elChar.style.backgroundRepeat = "no-repeat";
    curBg = "";

    var layers = document.querySelectorAll(".clouds, .background, .fence");
    for (var i = 0; i < layers.length; i++) {
      layers[i].style.width = bgWidth + "px";
      layers[i].style.height = (col.h || 800) + "px"; // fill the world box (was 100%)
    }
    buildObjBlocks(); // depth-sorted scenery props (replaces/augments .fence)
    buildZoneHitAreas(); // tappable targets over the settings action zones
    fitToScreen();
  }

  function swapRoomCss(n) {
    if (!roomCss) {
      roomCss = document.createElement("link");
      roomCss.rel = "stylesheet";
      document.head.appendChild(roomCss);
    }
    roomCss.href = "rooms/scene" + n + "/scene" + n + ".css";
  }

  function spawnPlayer() {
    // startingY (optional) pins the spawn depth; default is 60% down the floor
    var spawnY =
      typeof window.startingY === "number"
        ? window.startingY
        : col.top + (col.bottom - col.top) * 0.6;
    var s = nearestWalkable(spawnX, spawnY, 600) || { x: spawnX, y: spawnY };
    player.x = s.x;
    player.y = s.y;
    player.path = null;
    player.pathIndex = 0;
    player.frame = 1;
    player.facing =
      typeof window.startingFacing === "string" ? window.startingFacing : "r";
  }

  function loadLevel(n) {
    swapRoomCss(n);
    // optional settings: clear so they can't leak from the previous level
    window.rain = undefined;
    window.cast = undefined;
    window.objBlocks = undefined;
    window.exitTo = undefined; // green-zone redirect (story target, not scene+1)
    window.backTo = undefined; // blue-zone redirect (story target, not scene-1)
    window.exits = undefined; // per-door redirect map [{to,cx,cy,id?}] (multi-door scenes)
    window.charTint = undefined; // per-scene character lighting (tint/brightness)
    window.lightBoost = undefined; // per-scene light-pool brightness multiplier
    window.npcPaths = undefined; // editor-saved NPC patrol paths [{npc,path,speed?}]
    window.npcPlacements = undefined; // editor-saved NPC positions/scales [{npc,x,y,scale?,facing?}]
    window.startingY = undefined; // optional hero spawn depth (else 60% down the floor)
    window.startingFacing = undefined; // optional hero spawn facing (else "r")
    return (
      loadScript("rooms/scene" + n + "/js/settings.js")
        .then(function () {
          applyRoomConfig();
          return loadCollision();
        })
        .then(function () {
          spawnPlayer();
          buildCast(); // place this room's extra characters on the floor
          elMsg.style.opacity = 0;
          editorSync();
        })
        // per-level action handlers: reset to built-ins, then load this room's actions.js (optional)
        .then(function () {
          resetActions();
          return loadScriptOptional("rooms/scene" + n + "/js/actions.js");
        })
    );
  }

  // ---- collision overlay editor -------------------------------------------
  // Press E to toggle: the collision map is drawn over the live scene and you
  // paint walk-limits in context with the color legend, then export the PNG.
  var editor = {
    on: false,
    painting: false,
    brush: T_FLOOR,
    radius: 16,
    canvas: null,
    ctx: null,
    hud: null,
    rootDir: null,
    tool: "brush", // "brush" (freehand) | "line" | "poly" | "npcpath" | "move"
    lineStart: null, // first endpoint while drawing a line
    polyPts: [], // vertices while drawing a polygon
    pathPts: [], // waypoints while drawing an NPC patrol path
    pathSpeed: 0.7, // walk-speed multiplier applied to a drawn path ([ ] to adjust)
    dragBlock: null, // objBlock being dragged in move mode
    perspDrag: false, // dragging in the perspective tool
    perspTarget: null, // {kind:"far"|"near"|"heroMove"|"npcMove"|"npcResize", npc?}
    perspSel: null, // last-grabbed figure ("hero" | npc) — F cycles its facing
    perspEdited: false, // farHeight/nearHeight changed this scene (→ saved on S)
    heroPlaced: false, // hero start position moved (→ startingPoint/startingY saved)
    npcsPlaced: false, // an NPC was moved/scaled (→ npcPlacements saved)
  };
  var BRUSH_RGB = {};
  BRUSH_RGB[T_FLOOR] = [255, 0, 255];
  BRUSH_RGB[T_EXIT] = [0, 200, 0];
  BRUSH_RGB[T_SLOW] = [0, 200, 200];
  BRUSH_RGB[T_BLOCK] = [255, 255, 255];
  BRUSH_RGB[T_OBSTRUCT] = [220, 30, 30];
  BRUSH_RGB[T_ACTION] = [230, 210, 0];
  BRUSH_RGB[T_BACK] = [40, 90, 230];
  BRUSH_RGB[T_LIGHT] = [255, 140, 0]; // orange light pool
  var BRUSH_NAME = {};
  BRUSH_NAME[T_FLOOR] = "WALKABLE";
  BRUSH_NAME[T_EXIT] = "EXIT";
  BRUSH_NAME[T_SLOW] = "SLOW";
  BRUSH_NAME[T_BLOCK] = "ERASE";
  BRUSH_NAME[T_OBSTRUCT] = "OBSTRUCT";
  BRUSH_NAME[T_ACTION] = "ACTION";
  BRUSH_NAME[T_BACK] = "BACK";
  BRUSH_NAME[T_LIGHT] = "LIGHT";

  function buildEditor() {
    var c = document.createElement("canvas");
    c.style.cssText =
      "position:absolute;top:0;left:0;z-index:90000;opacity:.5;" +
      "display:none;pointer-events:none;image-rendering:pixelated;";
    elGame.appendChild(c);
    editor.canvas = c;
    editor.ctx = c.getContext("2d");

    // preview canvas for line/polygon rubber-banding (above the collision overlay)
    var pc = document.createElement("canvas");
    pc.style.cssText =
      "position:absolute;top:0;left:0;z-index:90001;opacity:.85;" +
      "display:none;pointer-events:none;image-rendering:pixelated;";
    elGame.appendChild(pc);
    editor.preview = pc;
    editor.pctx = pc.getContext("2d");

    var h = document.createElement("div");
    h.style.cssText =
      "position:fixed;left:10px;top:10px;z-index:100002;font:12px/1.55 monospace;" +
      "color:#3f6;background:rgba(0,0,0,.8);padding:8px 11px;border:1px solid #3f6;" +
      "white-space:pre;display:none;pointer-events:none;";
    document.body.appendChild(h);
    editor.hud = h;

    // brush-size cursor outline (follows the mouse, sized to the brush, tinted by brush)
    var cur = document.createElement("div");
    cur.style.cssText =
      "position:fixed;border-radius:50%;pointer-events:none;z-index:100003;" +
      "display:none;transform:translate(-50%,-50%);box-shadow:0 0 0 1px rgba(0,0,0,.7);";
    document.body.appendChild(cur);
    editor.cursor = cur;

    // layer that shows each action zone's id at its centroid
    var lbls = document.createElement("div");
    lbls.style.cssText =
      "position:fixed;left:0;top:0;pointer-events:none;z-index:100001;display:none;";
    document.body.appendChild(lbls);
    editor.labels = lbls;

    // layer that shows each objBlock's depth-sort line (bottomY) while editing
    var guides = document.createElement("div");
    guides.style.cssText =
      "position:fixed;left:0;top:0;pointer-events:none;z-index:100001;display:none;";
    document.body.appendChild(guides);
    editor.guides = guides;

    c.addEventListener("mousedown", function (e) {
      if (!editor.on) return;
      var w = overlayWorld(e);
      editor.lastWorld = w;
      if (editor.tool === "line") {
        if (!editor.lineStart) editor.lineStart = w;
        else {
          paintLine(editor.lineStart, w);
          editor.lineStart = null;
          commitPaint();
        }
        drawPreview();
      } else if (editor.tool === "poly") {
        var pts = editor.polyPts;
        if (pts.length >= 3 && nearPt(pts[0], w)) {
          fillPolygon(pts);
          editor.polyPts = [];
          commitPaint();
        } else pts.push(w);
        drawPreview();
      } else if (editor.tool === "npcpath") {
        editor.pathPts.push(w); // click to add a patrol waypoint (Enter to assign)
        drawPreview();
      } else if (editor.tool === "perspective") {
        editor.perspTarget = perspPick(w); // ghost handle / NPC / hero under cursor
        editor.perspDrag = !!editor.perspTarget;
        if (editor.perspTarget) {
          // remember the grabbed figure so F can cycle its facing
          if (editor.perspTarget.kind === "heroMove") editor.perspSel = "hero";
          else if (editor.perspTarget.npc) editor.perspSel = editor.perspTarget.npc;
          applyPerspectiveDrag(w);
        }
        drawPerspectiveGuide();
      } else if (editor.tool === "move") {
        editor.dragBlock = pickBlockAt(w); // grab an objBlock (or nothing)
        drawObjBlockGuides();
      } else {
        editor.painting = true;
        paintAt(w.x, w.y);
      }
      e.preventDefault();
    });
    window.addEventListener("mousemove", function (e) {
      if (!editor.on) return;
      updateCursor(e);
      editor.lastWorld = overlayWorld(e);
      if (editor.painting) paintAt(editor.lastWorld.x, editor.lastWorld.y);
      if (editor.dragBlock) {
        liveMoveBlock(editor.dragBlock, editor.lastWorld); // drag objBlock
        drawObjBlockGuides();
      }
      if (editor.perspDrag) applyPerspectiveDrag(editor.lastWorld); // move/resize hero
      if (editor.tool === "perspective") drawPerspectiveGuide();
      else if (editor.tool !== "brush") drawPreview(); // rubber-band line/poly
      updateHud(); // live cursor-position readout
    });
    window.addEventListener("mouseup", function () {
      if (editor.painting) {
        editor.painting = false;
        computeActionZones();
        updateZoneLabels();
      }
      if (editor.dragBlock) {
        var b = editor.dragBlock;
        editor.dragBlock = null;
        drawObjBlockGuides();
        flashMsg('objBlock "' + (b.def.id || b.def.src) + '" placed', 1000);
      }
      editor.perspDrag = false; // release the perspective grab
      editor.perspTarget = null;
    });
  }

  // name the action zone under the cursor and remember it (saved to settings on S)
  function assignZoneId() {
    if (!editor.lastWorld || !actionLabels) return;
    var px = editor.lastWorld.x | 0,
      py = editor.lastWorld.y | 0;
    if (px < 0 || py < 0 || px >= col.w || py >= col.h) return;
    var lbl = actionLabels[py * col.w + px];
    if (!lbl) {
      flashMsg("Hover a yellow action zone, then press I", 1400);
      return;
    }
    var z = actionZones[lbl - 1];
    var id = window.prompt(
      "Action id for this zone (try: message, clouds, flip):",
      String(z.id),
    );
    if (id === null) return;
    id = id.trim();
    if (!id) return;
    var best = -1,
      bd = 60 * 60; // update the nearest def or add a new one
    for (var i = 0; i < zoneDefs.length; i++) {
      var dx = zoneDefs[i].cx - z.cx,
        dy = zoneDefs[i].cy - z.cy,
        dd = dx * dx + dy * dy;
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    if (best >= 0) zoneDefs[best] = { id: id, cx: z.cx, cy: z.cy };
    else zoneDefs.push({ id: id, cx: z.cx, cy: z.cy });
    computeActionZones();
    updateZoneLabels();
  }

  function updateZoneLabels() {
    var box = editor.labels;
    if (!box) return;
    box.innerHTML = "";
    if (!editor.on) {
      box.style.display = "none";
      return;
    }
    box.style.display = "block";
    var rect = editor.canvas.getBoundingClientRect(),
      sx = rect.width / col.w,
      sy = rect.height / col.h;
    for (var i = 0; i < actionZones.length; i++) {
      var z = actionZones[i],
        t = document.createElement("div");
      t.textContent = z.id;
      t.style.cssText =
        "position:absolute;transform:translate(-50%,-50%);font:bold 12px monospace;" +
        "color:#000;background:rgba(230,210,0,.92);padding:1px 5px;border-radius:3px;white-space:nowrap;" +
        "left:" +
        (rect.left + z.cx * sx) +
        "px;top:" +
        (rect.top + z.cy * sy) +
        "px;";
      box.appendChild(t);
    }
  }

  // ---- objBlocks in the editor --------------------------------------------
  function editorObjBlocks() {
    if (!Array.isArray(window.objBlocks)) window.objBlocks = [];
    return window.objBlocks;
  }
  function blockSortY(b) {
    if (b.animate)
      return b.animate.bottomY != null ? b.animate.bottomY : b.animate.posY || 0;
    return b.bottomY != null
      ? b.bottomY
      : b.sortY != null
        ? b.sortY
        : b.y != null
          ? b.y
          : b.topY || 0;
  }
  // pick an image file (returns {file,url,img} or null)
  function pickImage() {
    return new Promise(function (resolve) {
      var inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "image/*";
      inp.onchange = function () {
        var f = inp.files && inp.files[0];
        if (!f) return resolve(null);
        var url = URL.createObjectURL(f),
          img = new Image();
        img.onload = function () {
          resolve({ file: f, url: url, img: img });
        };
        img.onerror = function () {
          resolve({ file: f, url: url, img: null });
        };
        img.src = url;
      };
      inp.click();
    });
  }
  // O: pick an image and add a new objBlock at the cursor. A scene-sized PNG
  // becomes a full-scene block; a smaller image becomes a positioned sprite.
  // (Reposition existing blocks with the move tool [M], not here.)
  function addOrMoveObjBlock() {
    var w = editor.lastWorld;
    if (!w) return;
    var list = editorObjBlocks();
    pickImage().then(function (pk) {
      if (!pk) return;
      var name = pk.file.name,
        id = name.replace(/\.[^.]+$/, ""),
        nw = pk.img ? pk.img.naturalWidth : 0,
        nh = pk.img ? pk.img.naturalHeight : 0,
        def;
      if (nw && nw >= bgWidth * 0.9) {
        def = { id: id, src: name, bottomY: Math.round(w.y), _url: pk.url }; // full-scene
      } else {
        def = {
          id: id,
          src: name,
          x: Math.round(w.x),
          y: Math.round(w.y),
          w: nw || undefined,
          h: nh || undefined,
          _url: pk.url,
        }; // positioned sprite
      }
      list.push(def);
      buildObjBlocks();
      drawObjBlockGuides();
      saveBlockImage(pk.file); // best-effort copy into the level folder
      flashMsg(
        'Added objBlock "' +
          name +
          '"' +
          (def.x != null ? " @ " + def.x + "," + def.y : " (full-scene)"),
        1700,
      );
    });
  }
  // if the rooms/ folder was already granted (via Save), copy the picked image in
  function saveBlockImage(file) {
    if (!editor.rootDir || !window.showDirectoryPicker) return;
    resolveLevelDir(editor.rootDir, level)
      .then(function (dir) {
        if (!dir) return;
        return dir
          .getFileHandle(file.name, { create: true })
          .then(function (fh) {
            return fh.createWritable().then(function (wr) {
              return wr.write(file).then(function () {
                return wr.close();
              });
            });
          });
      })
      .catch(function () {});
  }
  // Shift+O: remove the nearest objBlock line
  function removeNearestObjBlock() {
    var w = editor.lastWorld;
    if (!w) return;
    var list = editorObjBlocks(),
      best = -1,
      nd = 24;
    for (var i = 0; i < list.length; i++) {
      var d = Math.abs(blockSortY(list[i]) - w.y);
      if (d < nd) {
        nd = d;
        best = i;
      }
    }
    if (best < 0) return;
    var rm = list.splice(best, 1)[0];
    buildObjBlocks();
    drawObjBlockGuides();
    flashMsg('Removed objBlock "' + (rm.id || rm.src) + '"', 1200);
  }
  function drawObjBlockGuides() {
    var g = editor.guides;
    if (!g) return;
    g.innerHTML = "";
    g.style.display = editor.on ? "block" : "none";
    if (!editor.on || !editor.canvas) return;
    var r = editor.canvas.getBoundingClientRect(),
      sx = r.width / col.w,
      sy = r.height / col.h,
      list = editorObjBlocks();
    for (var i = 0; i < list.length; i++) {
      var d = list[i],
        by = blockSortY(d),
        ly = r.top + by * sy;
      var line = document.createElement("div");
      line.style.cssText =
        "position:fixed;height:0;border-top:2px dashed #46c0ff;left:" +
        r.left +
        "px;top:" +
        ly +
        "px;width:" +
        r.width +
        "px;";
      g.appendChild(line);
      var lab = document.createElement("div");
      lab.textContent =
        "▦ " +
        (d.id || d.src) +
        (d.x != null ? "  @" + d.x + "," + d.y : "") +
        "  ▾" +
        by;
      lab.style.cssText =
        "position:fixed;font:11px system-ui;color:#bfe6ff;background:rgba(0,40,70,.8);" +
        "padding:1px 5px;border-radius:3px;left:" +
        (r.left + 8) +
        "px;top:" +
        (ly - 17) +
        "px;";
      g.appendChild(lab);
      // positioned block: outline its footprint + a draggable base handle
      if (d.x != null) {
        var b = null;
        for (var k = 0; k < objBlocks.length; k++)
          if (objBlocks[k].def === d) b = objBlocks[k];
        if (b && b.w) {
          var box = document.createElement("div"),
            hot = editor.dragBlock && editor.dragBlock.def === d;
          box.style.cssText =
            "position:fixed;border:1.5px " +
            (hot ? "solid #ffd24a" : "dashed #46c0ff") +
            ";left:" +
            (r.left + b.x0 * sx) +
            "px;top:" +
            (r.top + b.y0 * sy) +
            "px;width:" +
            b.w * sx +
            "px;height:" +
            b.h * sy +
            "px;";
          g.appendChild(box);
          var dot = document.createElement("div");
          dot.style.cssText =
            "position:fixed;width:10px;height:10px;border-radius:50%;background:#ffd24a;" +
            "transform:translate(-50%,-50%);left:" +
            (r.left + d.x * sx) +
            "px;top:" +
            ly +
            "px;";
          g.appendChild(dot);
        }
      }
    }
  }
  // move tool: grab the objBlock under the cursor (positioned footprint, or near
  // a full-scene block's sort line) and drag it; updates live without rebuilding.
  function pickBlockAt(w) {
    var best = null,
      bd = Infinity;
    for (var i = 0; i < objBlocks.length; i++) {
      var b = objBlocks[i];
      if (b.positioned && b.w) {
        if (
          w.x >= b.x0 &&
          w.x <= b.x0 + b.w &&
          w.y >= b.y0 &&
          w.y <= b.y0 + b.h
        ) {
          var dz = Math.abs(b.sortY - w.y);
          if (dz < bd) {
            bd = dz;
            best = b;
          }
        }
      } else {
        var dist = Math.abs(b.sortY - w.y);
        if (dist < 16 && dist < bd) {
          bd = dist;
          best = b;
        }
      }
    }
    return best;
  }
  function liveMoveBlock(b, w) {
    if (b.positioned) {
      b.def.x = Math.round(w.x);
      b.def.y = Math.round(w.y);
      if (b.def.bottomY != null) b.def.bottomY = b.def.y;
      b.sortY = blockSortY(b.def);
      b.x0 = b.def.x - b.w / 2;
      b.y0 = b.def.y - b.h;
      b.el.style.transform = "translate3d(" + b.x0 + "px," + b.y0 + "px,0)";
    } else {
      b.def.bottomY = Math.round(w.y);
      b.sortY = b.def.bottomY;
    }
    b.el.style.zIndex = Math.round(b.sortY);
  }

  function updateCursor(e) {
    var cur = editor.cursor;
    if (!cur) return;
    if (!editor.on) {
      cur.style.display = "none";
      elGame.style.cursor = "";
      return;
    }
    // line / polygon / npc-path are point-placement tools: a precise crosshair,
    // not the big brush-size circle (you need to see exactly where each point lands)
    if (
      editor.tool === "line" ||
      editor.tool === "poly" ||
      editor.tool === "npcpath"
    ) {
      cur.style.display = "none";
      elGame.style.cursor = "crosshair";
      return;
    }
    // perspective tool: move figures / resize handles — no brush circle
    if (editor.tool === "perspective") {
      cur.style.display = "none";
      var pk = editor.lastWorld ? perspPick(editor.lastWorld) : null;
      elGame.style.cursor = !pk
        ? "default"
        : pk.kind === "far" || pk.kind === "near" || pk.kind === "npcResize"
          ? "ns-resize"
          : "move";
      return;
    }
    elGame.style.cursor = "";
    var rect = editor.canvas.getBoundingClientRect();
    var d = editor.radius * 2 * (rect.width / col.w); // world radius -> screen diameter
    var c = BRUSH_RGB[editor.brush];
    cur.style.display = "block";
    cur.style.left = e.clientX + "px";
    cur.style.top = e.clientY + "px";
    cur.style.width = d + "px";
    cur.style.height = d + "px";
    cur.style.border =
      "1.5px solid rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
  }

  // resize the overlay to the current map and repaint it from col.data
  function editorSync() {
    if (!editor.canvas || !col.data) return;
    editor.canvas.width = col.w;
    editor.canvas.height = col.h;
    editor.canvas.style.width = bgWidth + "px";
    editor.canvas.style.height = (col.h * bgWidth) / col.w + "px";
    if (editor.preview) {
      editor.preview.width = col.w;
      editor.preview.height = col.h;
      editor.preview.style.width = editor.canvas.style.width;
      editor.preview.style.height = editor.canvas.style.height;
    }
    var img = editor.ctx.createImageData(col.w, col.h),
      o = img.data,
      d = col.data;
    for (var i = 0; i < d.length; i += 4) {
      if (classify(d[i], d[i + 1], d[i + 2]) === T_BLOCK) {
        o[i + 3] = 0;
      } else {
        o[i] = d[i];
        o[i + 1] = d[i + 1];
        o[i + 2] = d[i + 2];
        o[i + 3] = 255;
      }
    }
    editor.ctx.putImageData(img, 0, 0);
  }

  function overlayWorld(e) {
    var r = editor.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * col.w) / r.width,
      y: ((e.clientY - r.top) * col.h) / r.height,
    };
  }

  function paintAt(wx, wy) {
    var r = editor.radius,
      c = BRUSH_RGB[editor.brush],
      d = col.data,
      rr = r * r;
    var x0 = Math.max(0, (wx - r) | 0),
      x1 = Math.min(col.w - 1, (wx + r) | 0);
    var y0 = Math.max(0, (wy - r) | 0),
      y1 = Math.min(col.h - 1, (wy + r) | 0);
    for (var y = y0; y <= y1; y++)
      for (var x = x0; x <= x1; x++) {
        var dx = x - wx,
          dy = y - wy;
        if (dx * dx + dy * dy > rr) continue;
        var p = (y * col.w + x) * 4;
        d[p] = c[0];
        d[p + 1] = c[1];
        d[p + 2] = c[2];
        d[p + 3] = 255;
      }
    // repaint just the affected overlay region from col.data
    var w = x1 - x0 + 1,
      hh = y1 - y0 + 1,
      img = editor.ctx.createImageData(w, hh),
      o = img.data;
    for (var yy = 0; yy < hh; yy++)
      for (var xx = 0; xx < w; xx++) {
        var sp = ((y0 + yy) * col.w + (x0 + xx)) * 4,
          dp = (yy * w + xx) * 4;
        if (classify(d[sp], d[sp + 1], d[sp + 2]) === T_BLOCK) {
          o[dp + 3] = 0;
        } else {
          o[dp] = d[sp];
          o[dp + 1] = d[sp + 1];
          o[dp + 2] = d[sp + 2];
          o[dp + 3] = 255;
        }
      }
    editor.ctx.putImageData(img, x0, y0);
  }

  // ---- line / polygon tools ------------------------------------------------
  function commitPaint() {
    computeActionZones();
    updateZoneLabels();
  }
  function paintLine(a, b) {
    var dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy),
      step = Math.max(1, editor.radius * 0.5),
      n = Math.ceil(len / step);
    for (var i = 0; i <= n; i++) {
      var t = n ? i / n : 0;
      paintAt(a.x + dx * t, a.y + dy * t);
    }
  }
  function fillPolygon(pts) {
    var c = BRUSH_RGB[editor.brush],
      d = col.data,
      minY = col.h,
      maxY = 0;
    for (var i = 0; i < pts.length; i++) {
      minY = Math.min(minY, pts[i].y);
      maxY = Math.max(maxY, pts[i].y);
    }
    minY = Math.max(0, minY | 0);
    maxY = Math.min(col.h - 1, maxY | 0);
    for (var y = minY; y <= maxY; y++) {
      var xs = [];
      for (var a = 0, b = pts.length - 1; a < pts.length; b = a++) {
        var ya = pts[a].y,
          yb = pts[b].y;
        if (ya > y !== yb > y)
          xs.push(pts[a].x + ((y - ya) / (yb - ya)) * (pts[b].x - pts[a].x));
      }
      xs.sort(function (m, n) {
        return m - n;
      });
      for (var k = 0; k + 1 < xs.length; k += 2) {
        var xa = Math.max(0, Math.ceil(xs[k])),
          xb = Math.min(col.w - 1, Math.floor(xs[k + 1]));
        for (var x = xa; x <= xb; x++) {
          var p = (y * col.w + x) * 4;
          d[p] = c[0];
          d[p + 1] = c[1];
          d[p + 2] = c[2];
          d[p + 3] = 255;
        }
      }
    }
    editorSync();
  }
  function nearPt(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y) < editor.radius + 8;
  }
  function drawPreview() {
    var pc = editor.preview,
      g = editor.pctx;
    if (!pc) return;
    var drawTool =
      editor.tool === "line" ||
      editor.tool === "poly" ||
      editor.tool === "npcpath";
    pc.style.display = editor.on && drawTool ? "block" : "none";
    g.clearRect(0, 0, pc.width, pc.height);
    if (!editor.on || !drawTool) return;
    var c = BRUSH_RGB[editor.brush],
      col2 = "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")",
      w = editor.lastWorld;
    // thin, screen-relative strokes so you see the *exact* outline (not a fat
    // brush-width band). `sc` = world px per on-screen px at the current zoom.
    var sc =
      pc.width / Math.max(1, pc.getBoundingClientRect().width || pc.width);
    g.lineWidth = 1.5 * sc;
    g.strokeStyle = col2;
    g.fillStyle = col2;
    g.lineCap = "round";
    g.lineJoin = "round";
    function dot(pt) {
      g.beginPath();
      g.arc(pt.x, pt.y, 3.5 * sc, 0, 7); // small vertex marker
      g.fill();
    }
    if (editor.tool === "line" && editor.lineStart && w) {
      g.beginPath();
      g.moveTo(editor.lineStart.x, editor.lineStart.y);
      g.lineTo(w.x, w.y);
      g.stroke();
      dot(editor.lineStart);
      dot(w);
    } else if (editor.tool === "poly" && editor.polyPts.length) {
      // closed outline + faint fill = exactly the area the polygon will cover
      g.beginPath();
      g.moveTo(editor.polyPts[0].x, editor.polyPts[0].y);
      for (var i = 1; i < editor.polyPts.length; i++)
        g.lineTo(editor.polyPts[i].x, editor.polyPts[i].y);
      if (w) g.lineTo(w.x, w.y);
      g.closePath();
      g.globalAlpha = 0.18;
      g.fill(); // shaded coverage preview
      g.globalAlpha = 1;
      g.stroke(); // thin outline
      for (var j = 0; j < editor.polyPts.length; j++) dot(editor.polyPts[j]);
      if (w) dot(w); // the live cursor vertex
    } else if (editor.tool === "npcpath" && editor.pathPts.length) {
      // patrol path: bright open polyline + a dashed loop-back to the start so
      // you see the full cycle the NPC will walk
      var pp = editor.pathPts;
      g.strokeStyle = "rgb(120,255,140)";
      g.fillStyle = "rgb(120,255,140)";
      g.beginPath();
      g.moveTo(pp[0].x, pp[0].y);
      for (var p = 1; p < pp.length; p++) g.lineTo(pp[p].x, pp[p].y);
      if (w) g.lineTo(w.x, w.y);
      g.stroke();
      // dashed closing segment back to the first waypoint (the loop)
      var lastPt = w || pp[pp.length - 1];
      g.setLineDash([8 * sc, 6 * sc]);
      g.beginPath();
      g.moveTo(lastPt.x, lastPt.y);
      g.lineTo(pp[0].x, pp[0].y);
      g.stroke();
      g.setLineDash([]);
      for (var q = 0; q < pp.length; q++) dot(pp[q]);
      if (w) dot(w);
    }
  }

  // ---- perspective / placement tool ----------------------------------------
  // One tool (H) to set the scene's depth + place its figures:
  //   • drag the back/front GHOST handles → farHeight / nearHeight
  //   • drag the HERO body → its start position (startingPoint / startingY)
  //   • drag an NPC body → its position; an NPC's top handle → its scale
  var GHOST_X = 130;
  function figBox(cx, feetY, h) {
    h = Math.max(8, h);
    return {
      cx: cx,
      feetY: feetY,
      topY: feetY - h,
      h: h,
      halfW: Math.max(16, h * 0.28),
    };
  }
  function npcBaseH(npc) {
    return npc.pose ? npc.pose.h || 200 : heightAt(npc.y);
  }
  function npcBox(npc) {
    return figBox(npc.x, npc.y, npcBaseH(npc) * (npc.scale || 1));
  }
  function nearHandle(w, x, y) {
    return Math.abs(w.x - x) < 46 && Math.abs(w.y - y) < 30;
  }
  function inBox(w, b) {
    return (
      w.x >= b.cx - b.halfW &&
      w.x <= b.cx + b.halfW &&
      w.y >= b.topY - 6 &&
      w.y <= b.feetY + 6
    );
  }
  // what a click grabs (priority: ghost handles → NPC handle/body → hero body)
  function perspPick(w) {
    if (nearHandle(w, GHOST_X, col.top + 2 - FAR_H)) return { kind: "far" };
    if (nearHandle(w, GHOST_X, col.bottom - 2 - NEAR_H)) return { kind: "near" };
    for (var i = 0; i < npcs.length; i++) {
      var b = npcBox(npcs[i]);
      if (nearHandle(w, b.cx, b.topY)) return { kind: "npcResize", npc: npcs[i] };
      if (inBox(w, b)) return { kind: "npcMove", npc: npcs[i] };
    }
    if (inBox(w, figBox(player.x, player.y, heightAt(player.y))))
      return { kind: "heroMove" };
    return null;
  }
  function rerenderCast() {
    for (var i = 0; i < npcs.length; i++) renderNpc(npcs[i]);
  }
  function applyPerspectiveDrag(w) {
    var t = editor.perspTarget;
    if (!t) return;
    if (t.kind === "far") {
      FAR_H = Math.max(8, col.top + 2 - w.y);
      window.farHeight = Math.round(FAR_H);
      editor.perspEdited = true;
      rerenderCast(); // heightAt changed → NPCs resize too
    } else if (t.kind === "near") {
      NEAR_H = Math.max(8, col.bottom - 2 - w.y);
      window.nearHeight = Math.round(NEAR_H);
      editor.perspEdited = true;
      rerenderCast();
    } else if (t.kind === "heroMove") {
      player.x = w.x; // clampToFloor() keeps the feet on the floor
      player.y = w.y;
      player.path = null;
      window.startingPoint = Math.round(w.x);
      window.startingY = Math.round(w.y);
      editor.heroPlaced = true;
    } else if (t.kind === "npcMove") {
      t.npc.x = w.x;
      t.npc.y = w.y;
      t.npc._placed = true;
      renderNpc(t.npc);
      editor.npcsPlaced = true;
    } else if (t.kind === "npcResize") {
      var s = (t.npc.y - w.y) / Math.max(1, npcBaseH(t.npc));
      t.npc.scale = Math.max(0.1, Math.min(6, s));
      t.npc._placed = true;
      renderNpc(t.npc);
      editor.npcsPlaced = true;
    }
  }
  function drawPerspectiveGuide() {
    var pc = editor.preview,
      g = editor.pctx;
    if (!pc) return;
    var show = editor.on && editor.tool === "perspective";
    pc.style.display = show ? "block" : "none";
    g.clearRect(0, 0, pc.width, pc.height);
    if (!show) return;
    var sc = pc.width / Math.max(1, pc.getBoundingClientRect().width || pc.width);
    g.lineWidth = 2 * sc;
    function rect(b, color) {
      g.strokeStyle = color;
      g.strokeRect(b.cx - b.halfW, b.topY, b.halfW * 2, b.h);
    }
    function handle(x, y, color) {
      g.fillStyle = color;
      g.beginPath();
      g.arc(x, y, 7 * sc, 0, 7);
      g.fill();
    }
    function label(x, y, text, color) {
      g.fillStyle = color;
      g.font = 15 * sc + "px system-ui";
      g.fillText(text, x, y);
    }
    // far / near height ghosts (dashed) with resize handles
    var fb = figBox(GHOST_X, col.top + 2, FAR_H),
      nb = figBox(GHOST_X, col.bottom - 2, NEAR_H);
    g.setLineDash([6 * sc, 5 * sc]);
    rect(fb, "rgba(120,200,255,.95)");
    rect(nb, "rgba(255,200,120,.95)");
    g.setLineDash([]);
    handle(fb.cx, fb.topY, "rgba(120,200,255,.95)");
    handle(nb.cx, nb.topY, "rgba(255,200,120,.95)");
    label(fb.cx - fb.halfW, fb.topY - 6 * sc, "far " + Math.round(FAR_H), "rgba(120,200,255,.95)");
    label(nb.cx - nb.halfW, nb.topY - 6 * sc, "near " + Math.round(NEAR_H), "rgba(255,200,120,.95)");
    // NPCs (cyan, with a resize handle) and the hero (green, move only)
    for (var i = 0; i < npcs.length; i++) {
      var b = npcBox(npcs[i]);
      rect(b, "rgb(120,255,210)");
      handle(b.cx, b.topY, "rgb(120,255,210)");
      label(
        b.cx - b.halfW,
        b.feetY + 16 * sc,
        npcs[i].label + " ×" + Math.round((npcs[i].scale || 1) * 100) / 100,
        "rgb(120,255,210)",
      );
    }
    var hb = figBox(player.x, player.y, heightAt(player.y));
    rect(hb, "rgb(120,255,140)");
    label(
      hb.cx - hb.halfW,
      hb.feetY + 16 * sc,
      "hero (spawn) " + player.facing,
      "rgb(120,255,140)",
    );
  }
  // cycle the last-grabbed figure's facing (l → r → f → b). Hero → startingFacing,
  // NPC → its facing (saved in npcPlacements). Press F in the perspective tool.
  function cyclePerspFacing() {
    var sel = editor.perspSel,
      order = ["l", "r", "f", "b"];
    if (!sel) {
      flashMsg("grab the hero or an NPC first, then F to turn it", 1600);
      return;
    }
    if (sel === "hero") {
      player.facing = order[(order.indexOf(player.facing) + 1) % 4];
      window.startingFacing = player.facing;
      editor.heroPlaced = true;
      flashMsg("hero faces " + player.facing, 900);
    } else {
      sel.facing = order[(order.indexOf(sel.facing) + 1) % 4];
      sel._placed = true;
      renderNpc(sel);
      editor.npcsPlaced = true;
      flashMsg(sel.label + " faces " + sel.facing, 900);
    }
    drawPerspectiveGuide();
    updateHud();
  }
  function cancelDraw() {
    editor.lineStart = null;
    editor.polyPts = [];
    editor.pathPts = [];
    editor.dragBlock = null;
    editor.lineStart = null;
    editor.polyPts = [];
    editor.pathPts = [];
    editor.dragBlock = null;
    drawPreview();
    drawObjBlockGuides();
  }
  // adjust the path walk-speed and apply it live to the last-drawn NPC, so you can
  // dial the pace ( [ slower / ] faster ) and watch it before saving
  function bumpPathSpeed(delta) {
    editor.pathSpeed = Math.max(
      0.1,
      Math.min(3, Math.round((editor.pathSpeed + delta) * 10) / 10),
    );
    if (editor.lastPathNpc && editor.lastPathNpc.path)
      editor.lastPathNpc.pathSpeed = editor.pathSpeed;
  }
  // Finish an NPC patrol path: assign it (+ the current editor.pathSpeed) to the
  // cast member nearest the first waypoint and start it walking live. `S` then
  // saves it as a top-level `npcPaths` in settings.js.
  function commitNpcPath() {
    var pts = editor.pathPts;
    if (pts.length < 2) return;
    var rounded = pts.map(function (p) {
      return { x: Math.round(p.x), y: Math.round(p.y) };
    });
    var best = null,
      bd = Infinity;
    for (var i = 0; i < npcs.length; i++) {
      var dx = npcs[i].x - rounded[0].x,
        dy = npcs[i].y - rounded[0].y,
        dd = dx * dx + dy * dy;
      if (dd < bd) {
        bd = dd;
        best = npcs[i];
      }
    }
    if (best && !best.pose) {
      best.path = rounded.slice();
      best.x = rounded[0].x;
      best.y = rounded[0].y;
      best.pathIndex = 1;
      best.pathSpeed = editor.pathSpeed; // the speed you dialed with [ ]
      editor.lastPathNpc = best;
      renderNpc(best);
    }
    flashMsg(
      best
        ? best.label +
            " walks the path · " +
            rounded.length +
            " pts · speed " +
            editor.pathSpeed +
            " — press S to save"
        : "no NPC near the first point",
      2800,
    );
    editor.pathPts = [];
    drawPreview();
  }
  function setTool(tool) {
    editor.tool = editor.tool === tool ? "brush" : tool;
    cancelDraw();
    // swap the cursor immediately (don't wait for the next mouse-move): crosshair
    // for point tools, a move cursor for the perspective tool, brush circle else
    var pointTool =
      editor.tool === "line" ||
      editor.tool === "poly" ||
      editor.tool === "npcpath";
    var persp = editor.tool === "perspective";
    elGame.style.cursor = pointTool ? "crosshair" : persp ? "move" : "";
    if (pointTool || persp) editor.cursor.style.display = "none";
    if (persp) drawPerspectiveGuide();
    updateHud();
  }

  function toggleEditor() {
    editor.on = !editor.on;
    editor.canvas.style.display = editor.on ? "block" : "none";
    editor.canvas.style.pointerEvents = editor.on ? "auto" : "none";
    editor.hud.style.display = editor.on ? "block" : "none";
    if (!editor.on) {
      editor.cursor.style.display = "none";
      elGame.style.cursor = ""; // drop the crosshair when leaving the editor
      editor.lineStart = null;
      editor.polyPts = [];
      applyEdits(true);
    }
    updateHud();
    updateZoneLabels();
    drawObjBlockGuides();
    drawPreview();
  }

  // commit edits to the live game: refresh the perspective band and keep the
  // player on valid floor, so painted changes take effect immediately.
  function applyEdits(silent) {
    calibrate();
    if (!isWalkable(player.x, player.y)) {
      var s = nearestWalkable(player.x, player.y, 500);
      if (s) {
        player.x = s.x;
        player.y = s.y;
        player.path = null;
      }
    }
    if (!silent) flashMsg("Applied ✓", 700);
  }

  function updateHud() {
    var w = editor.lastWorld;
    var pos = w ? Math.round(w.x) + ", " + Math.round(w.y) : "—";
    editor.hud.textContent =
      "EDIT MODE — collision map  (E to exit)\n" +
      "cursor: " +
      pos +
      "     brush: " +
      BRUSH_NAME[editor.brush] +
      (editor.tool === "npcpath"
        ? "   path speed: " + editor.pathSpeed + "×  ([ slower / ] faster)"
        : editor.tool === "perspective"
          ? "   far " +
            Math.round(FAR_H) +
            " / near " +
            Math.round(NEAR_H) +
            (editor.perspSel
              ? "   sel: " +
                (editor.perspSel === "hero"
                  ? "hero " + player.facing
                  : editor.perspSel.label + " " + editor.perspSel.facing)
              : "") +
            "  (ghost=heights, hero=spawn, NPC=move/scale, F=turn)"
          : "   size: " + editor.radius) +
      "   tool: " +
      editor.tool +
      "\n" +
      "[1] walkable [2] exit [3] slow [7] back [8] light\n" +
      "[4] erase [5] obstruct [6] action   [I] name zone under cursor\n" +
      "[L] line  [P] polygon  [N] npc path  [H] place/perspective (hero+NPCs)  [Esc] cancel\n" +
      "[O] add objBlock (pick image)  [Shift+O] remove  [M] move (drag block)\n" +
      "[ [ ] ] size   [Enter] apply   [X] clear   [S] save (map+zones+objBlocks)\n" +
      "paint: drag (brush) · click points (line/polygon)";
  }

  function clearMap() {
    var d = col.data;
    for (var i = 0; i < d.length; i += 4) {
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = 255;
    }
    editorSync();
  }

  function mapToBlob() {
    var cv = document.createElement("canvas");
    cv.width = col.w;
    cv.height = col.h;
    var cx = cv.getContext("2d"),
      img = cx.createImageData(col.w, col.h);
    img.data.set(col.data);
    cx.putImageData(img, 0, 0);
    return new Promise(function (res) {
      cv.toBlob(res, "image/png");
    });
  }

  // Save area.png + settings.js for the CURRENT scene. With the File System
  // Access API (Chrome) we ALWAYS prompt for the destination folder so each save
  // explicitly targets the right scene — defaulting (startIn) to the last folder
  // for convenience. This prevents silently overwriting another scene's files
  // when you switch scenes between saves. Other browsers download instead.
  function exportMap() {
    if (window.showDirectoryPicker) {
      saveToDir().catch(function (e) {
        if (e && e.name !== "AbortError") downloadMap();
      });
    } else {
      downloadMap();
    }
  }

  async function saveToDir() {
    var picked = await window.showDirectoryPicker({
      id: "nooir-rooms",
      mode: "readwrite",
      startIn: editor.rootDir || undefined,
    });
    if (!(await ensureWritable(picked))) {
      downloadMap();
      return;
    }
    // Resolve scene{level}/ under the picked folder — whether you picked the
    // project root, rooms/, or the scene folder itself. The bare-folder case is
    // accepted ONLY when the folder's name matches scene{level}, so picking the
    // wrong scene folder can never overwrite it with another scene's map.
    var dir = await resolveLevelDir(picked, level);
    if (!dir) {
      flashMsg(
        "Pick scene" + level + "/ (or rooms/, or the project root)",
        2000,
      );
      return;
    }
    editor.rootDir = picked; // remember for next save's startIn

    var blob = await mapToBlob();
    var afh = await dir.getFileHandle("area.png");
    var aw = await afh.createWritable();
    await aw.write(blob);
    await aw.close();

    // write the action-zone ids + objBlocks back into js/settings.js
    var sh = null;
    try {
      sh = await (await dir.getDirectoryHandle("js")).getFileHandle(
        "settings.js",
      );
    } catch (e) {
      /* no settings.js — area.png only */
    }
    if (sh) {
      var text = await (await sh.getFile()).text();
      text = injectActionZones(text, zoneDefs);
      text = injectObjBlocks(text, editorObjBlocks());
      var paths = editorNpcPaths();
      text = injectNpcPaths(text, paths);
      if (editor.perspEdited) {
        // the perspective tool changed farHeight / nearHeight
        text = injectScalar(text, "farHeight", Math.round(FAR_H));
        text = injectScalar(text, "nearHeight", Math.round(NEAR_H));
      }
      if (editor.heroPlaced) {
        // the hero's start position / facing was set
        text = injectScalar(text, "startingPoint", Math.round(player.x));
        text = injectScalar(text, "startingY", Math.round(player.y));
        text = injectScalar(text, "startingFacing", player.facing);
      }
      var placements = editor.npcsPlaced ? editorNpcPlacements() : [];
      if (editor.npcsPlaced) text = injectNpcPlacements(text, placements);
      var sw = await sh.createWritable();
      await sw.write(text);
      await sw.close();
      flashMsg(
        "Saved scene" +
          level +
          ": area.png + " +
          zoneDefs.length +
          " zone(s) + " +
          editorObjBlocks().length +
          " objBlock(s)" +
          (paths.length ? " + " + paths.length + " path(s)" : "") +
          (editor.perspEdited ? " + heights" : "") +
          (editor.heroPlaced ? " + spawn" : "") +
          (placements.length ? " + " + placements.length + " placement(s)" : "") +
          " ✓",
        1600,
      );
    } else {
      flashMsg("Saved scene" + level + "/area.png ✓", 1000);
    }
  }

  // Splice a scalar var (`farHeight = 280`, `startingFacing = "l"`) — replace the
  // value in place (keeps any trailing comment), or insert before scene=/level=.
  function injectScalar(text, name, val) {
    if (typeof val !== "number" && typeof val !== "string") return text;
    var lit = typeof val === "string" ? JSON.stringify(val) : val;
    var re = new RegExp(name + "\\s*=\\s*(?:-?[0-9.]+|\"[^\"]*\"|'[^']*')");
    if (re.test(text)) return text.replace(re, name + " = " + lit);
    return text.replace(
      /(\n[ \t]*)(scene|level)\s*=/,
      "$1" + name + " = " + lit + ",$1$2 =",
    );
  }
  // Splice `actionZones = [...]` into a settings.js var-chain (replace if present,
  // else insert just before `level = N`).
  function injectActionZones(text, defs) {
    var line = "actionZones = " + JSON.stringify(defs);
    var re = /actionZones\s*=\s*\[[\s\S]*?\]\s*,?/;
    if (re.test(text)) return text.replace(re, line + ",");
    return text.replace(/(\n[ \t]*)level\s*=/, "$1" + line + ",$1level =");
  }
  function injectObjBlocks(text, defs) {
    if (!Array.isArray(defs)) return text;
    var clean = defs.map(function (b) {
      var o = {};
      if (b.id != null) o.id = b.id;
      if (b.src != null) o.src = b.src; // animated blocks have no static src
      if (b.x != null) o.x = b.x;
      if (b.y != null) o.y = b.y;
      if (b.w != null) o.w = b.w;
      if (b.h != null) o.h = b.h;
      if (b.bottomY != null) o.bottomY = b.bottomY;
      if (b.topY != null) o.topY = b.topY;
      if (b.action != null) o.action = b.action;
      if (b.animate != null) o.animate = b.animate; // preserve frame animation
      return o; // note: transient _url preview is dropped
    });
    var line = "objBlocks = " + JSON.stringify(clean);
    // single-line greedy: objBlocks may now contain a nested `animate.frames` array,
    // so a lazy `[\s\S]*?` would stop at the first `]` and corrupt the splice
    var re = /objBlocks\s*=\s*\[.*\]\s*,?/;
    if (re.test(text)) return text.replace(re, line + ",");
    return text.replace(
      /(\n[ \t]*)(scene|level)\s*=/,
      "$1" + line + ",$1$2 =",
    );
  }
  // current NPC patrol paths, as the savable `npcPaths` defs (label-keyed, since
  // they can't be written back into the nested `cast` objects)
  function editorNpcPaths() {
    var out = [];
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      if (!n.path || n.path.length < 2 || !n.label) continue;
      var o = {
        npc: n.label,
        path: n.path.map(function (p) {
          return { x: Math.round(p.x), y: Math.round(p.y) };
        }),
      };
      if (typeof n.pathSpeed === "number" && n.pathSpeed !== 0.7)
        o.speed = Math.round(n.pathSpeed * 100) / 100;
      out.push(o);
    }
    return out;
  }
  // current editor-moved/scaled NPCs as savable `npcPlacements` defs
  function editorNpcPlacements() {
    var out = [];
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      if (!n._placed || !n.label) continue;
      var o = { npc: n.label, x: Math.round(n.x), y: Math.round(n.y) };
      if (typeof n.scale === "number" && n.scale !== 1)
        o.scale = Math.round(n.scale * 100) / 100;
      if (n.facing) o.facing = n.facing;
      out.push(o);
    }
    return out;
  }
  function injectNpcPlacements(text, defs) {
    if (!Array.isArray(defs) || defs.length === 0)
      return text.replace(/[ \t]*npcPlacements\s*=\s*\[.*\]\s*,?\n?/, "");
    var line = "npcPlacements = " + JSON.stringify(defs);
    var re = /npcPlacements\s*=\s*\[.*\]\s*,?/;
    if (re.test(text)) return text.replace(re, line + ",");
    return text.replace(
      /(\n[ \t]*)(scene|level)\s*=/,
      "$1" + line + ",$1$2 =",
    );
  }
  // Splice `npcPaths = [...]` into the var-chain (replace if present, else insert
  // just before `scene =` / `level =`). Empty = drop the assignment entirely.
  function injectNpcPaths(text, defs) {
    // npcPaths is always written on a single line (JSON.stringify, no newlines),
    // so match greedily within the line — `[\s\S]*?` would stop at the nested
    // `path:[…]` bracket and corrupt the splice.
    if (!Array.isArray(defs) || defs.length === 0)
      return text.replace(/[ \t]*npcPaths\s*=\s*\[.*\]\s*,?\n?/, "");
    var line = "npcPaths = " + JSON.stringify(defs);
    var re = /npcPaths\s*=\s*\[.*\]\s*,?/;
    if (re.test(text)) return text.replace(re, line + ",");
    return text.replace(
      /(\n[ \t]*)(scene|level)\s*=/,
      "$1" + line + ",$1$2 =",
    );
  }

  // Locate a file under the granted folder, tolerating whether the user picked
  // rooms/, the project root, or the level folder itself.
  async function resolveLevelDir(root, lvl) {
    // Prefer an explicit scene{lvl}/ under the picked root (root = project or
    // rooms/). Each candidate is confirmed by the presence of area.png.
    var tries = [["scene" + lvl], ["rooms", "scene" + lvl]];
    for (var t = 0; t < tries.length; t++) {
      try {
        var dir = root;
        for (var i = 0; i < tries[t].length; i++)
          dir = await dir.getDirectoryHandle(tries[t][i]);
        await dir.getFileHandle("area.png"); // confirm it's the level folder
        return dir;
      } catch (e) {
        /* try next layout */
      }
    }
    // The picked folder may BE the scene folder. Accept it ONLY when its name
    // matches scene{lvl} — otherwise saving scene3 while pointed at scene1/
    // would happily overwrite scene1's area.png (the bug this guards against).
    try {
      if (root.name === "scene" + lvl) {
        await root.getFileHandle("area.png");
        return root;
      }
    } catch (e) {
      /* not the scene folder */
    }
    return null;
  }

  function ensureWritable(handle) {
    var opts = { mode: "readwrite" };
    return handle.queryPermission(opts).then(function (p) {
      if (p === "granted") return true;
      return handle.requestPermission(opts).then(function (q) {
        return q === "granted";
      });
    });
  }

  function downloadMap() {
    mapToBlob().then(function (blob) {
      var a = document.createElement("a");
      a.download = "area.png";
      a.href = URL.createObjectURL(blob);
      a.click();
      flashMsg("Downloaded area.png", 1000);
    });
  }

  // touch/click parity with the Enter key: a tap ANYWHERE advances an open
  // conversation — works on touch devices and over the letterbox bars (the
  // choice buttons stopPropagation, so picking an option isn't swallowed).
  document.addEventListener("click", function () {
    if (dialogOpen && !editor.on) advanceDialog();
  });

  window.addEventListener("keydown", function (e) {
    if (e.keyCode === 69) {
      if (DEV) toggleEditor();
      return;
    } // E (dev only)
    // Enter (outside the editor): advance an open dialog, else talk to a nearby NPC
    if (e.keyCode === 13 && !editor.on) {
      if (e.repeat) return; // ignore key-repeat so held Enter doesn't skip lines
      if (dialogOpen) advanceDialog();
      else interactNearest(); // NPC (talk) / object / action zone
      return;
    }
    if (!editor.on) return;
    // picking a brush also returns to the brush (paint) tool, so you're never
    // stuck in line/poly/move mode
    function pickBrush(tt) {
      editor.brush = tt;
      if (editor.tool !== "brush") {
        editor.tool = "brush";
        cancelDraw();
        elGame.style.cursor = ""; // leaving line/poly → back to the brush circle
      }
    }
    switch (e.keyCode) {
      case 49:
        pickBrush(T_FLOOR);
        break; // 1
      case 50:
        pickBrush(T_EXIT);
        break; // 2
      case 51:
        pickBrush(T_SLOW);
        break; // 3
      case 52:
        pickBrush(T_BLOCK);
        break; // 4
      case 53:
        pickBrush(T_OBSTRUCT);
        break; // 5
      case 54:
        pickBrush(T_ACTION);
        break; // 6
      case 55:
        pickBrush(T_BACK);
        break; // 7
      case 56:
        pickBrush(T_LIGHT);
        break; // 8 = light pool
      case 73:
        assignZoneId();
        break; // I = name zone under cursor
      case 79:
        if (e.shiftKey) removeNearestObjBlock();
        else addOrMoveObjBlock();
        break; // O = add/move objBlock (Shift+O removes)
      case 76:
        setTool("line");
        break; // L = line tool
      case 80:
        setTool("poly");
        break; // P = polygon tool
      case 77:
        setTool("move");
        break; // M = move objBlocks (drag to reposition)
      case 78:
        setTool("npcpath");
        break; // N = draw an NPC patrol path (Enter assigns to nearest NPC)
      case 72:
        setTool("perspective");
        break; // H = place/perspective: drag the hero to set far/near height
      case 70:
        if (editor.tool === "perspective") cyclePerspFacing();
        break; // F = turn the grabbed figure (l→r→f→b)
      case 27:
        cancelDraw();
        break; // Esc = cancel in-progress line/poly/move
      case 219:
        if (editor.tool === "npcpath") bumpPathSpeed(-0.1); // slower
        else editor.radius = Math.max(2, editor.radius - 4);
        break; // [
      case 221:
        if (editor.tool === "npcpath") bumpPathSpeed(0.1); // faster
        else editor.radius += 4;
        break; // ]
      case 13:
        if (editor.tool === "poly" && editor.polyPts.length >= 3) {
          fillPolygon(editor.polyPts); // Enter closes & fills the polygon
          editor.polyPts = [];
          commitPaint();
          drawPreview();
        } else if (editor.tool === "npcpath" && editor.pathPts.length >= 2) {
          commitNpcPath(); // Enter assigns the drawn path to the nearest NPC
        } else applyEdits(false); // Enter = apply
        break;
      case 88:
        clearMap();
        break; // X
      case 83:
        exportMap();
        break; // S
      default:
        return;
    }
    updateHud();
  });

  // ---- boot ----------------------------------------------------------------
  // ---- character test toolbar ----------------------------------------------
  // Top-left bar: pick the active character (persists across levels), fire the
  // one-shot grab/pickup cycles, toggle the run cycle in place, and toggle the
  // weather (rain / lightning). Walk/run also engage by moving (Shift to run).
  var charSelect = null,
    levelSelect = null,
    rainBtn = null,
    rainSlider = null,
    cloudSlider = null,
    brightBtn = null;
  function setCharacter(name) {
    charOverride = CHAR_META[name] ? name : null;
    applyCharacter(name);
    if (charSelect) charSelect.value = character;
    saveEnv("character", charOverride); // remember the active character
  }
  function buildCharBar() {
    var bar = document.createElement("div");
    bar.style.cssText =
      "position:fixed;left:8px;top:8px;z-index:100060;display:flex;gap:6px;" +
      "align-items:center;font:12px system-ui,sans-serif;color:#ddd;" +
      "background:rgba(0,0,0,.55);padding:5px 8px;border-radius:6px;";
    function label(t) {
      var s = document.createElement("span");
      s.textContent = t;
      bar.appendChild(s);
      return s;
    }
    function btn(text, fn) {
      var b = document.createElement("button");
      b.textContent = text;
      b.style.cssText = "font:12px system-ui;padding:2px 7px;cursor:pointer;";
      b.addEventListener("click", fn);
      bar.appendChild(b);
      return b;
    }
    function slider(min, max, step, val, fn) {
      var s = document.createElement("input");
      s.type = "range";
      s.min = min;
      s.max = max;
      s.step = step;
      s.value = val;
      s.style.cssText = "width:74px;cursor:pointer;";
      s.addEventListener("input", function () {
        fn(parseFloat(s.value));
      });
      bar.appendChild(s);
      return s;
    }

    // level picker
    label("Scene");
    levelSelect = document.createElement("select");
    levelSelect.style.cssText = "font:12px system-ui;padding:2px 4px;";
    for (var lv = 1; lv <= MAX_LEVEL; lv++) {
      var lo = document.createElement("option");
      lo.value = lv;
      lo.textContent = lv;
      levelSelect.appendChild(lo);
    }
    levelSelect.addEventListener("change", function () {
      goToLevel(parseInt(levelSelect.value, 10));
    });
    bar.appendChild(levelSelect);

    // character picker
    label("Character");
    charSelect = document.createElement("select");
    charSelect.style.cssText = "font:12px system-ui;padding:2px 4px;";
    Object.keys(CHAR_META).forEach(function (n) {
      var o = document.createElement("option");
      o.value = n;
      o.textContent = n.charAt(0).toUpperCase() + n.slice(1);
      charSelect.appendChild(o);
    });
    charSelect.addEventListener("change", function () {
      setCharacter(charSelect.value);
    });
    bar.appendChild(charSelect);

    // animation cycle tests
    btn("Grab", function () {
      playCharAnim("grab");
    });
    btn("Pickup", function () {
      playCharAnim("pickup");
    });
    var rb = btn("Run ▶", function () {
      var on = player.anim && player.anim.def === CHAR_ANIMS.run;
      playCharAnim(on ? null : "run");
      rb.textContent = on ? "Run ▶" : "Run ■";
    });

    // weather: rain (toggle + intensity slider), cloud drift, lightning, sky
    rainBtn = btn("Rain ▶", function () {
      var v = rainOn ? 0 : 0.8;
      setRain(v); // setRain() syncs the button + slider
      saveEnv("rain", v); // remember the manual weather
    });
    rainSlider = slider(0, 1, 0.05, 0, function (v) {
      setRain(v);
      saveEnv("rain", v);
    });
    label("Clouds");
    cloudSlider = slider(-40, 40, 2, 0, function (v) {
      cloudSpeed = Math.abs(v);
      cloudDir = v < 0 ? -1 : 1; // negative = drift left
      elClouds.style.backgroundRepeat = cloudSpeed ? "repeat-x" : "no-repeat";
      saveEnv("cloudSpeed", cloudSpeed); // remember the cloud drift
      saveEnv("cloudDir", cloudDir);
    });
    btn("Lightning ⚡", function () {
      flash = { t: 0, d2: 0.24, a2: 0.7 }; // trigger a double-flash now
    });
    brightBtn = btn("☾ Dark", function () {
      setBright(!bright); // setBright() keeps the label in sync
    });
    document.body.appendChild(bar);
  }

  function animateClouds(dt) {
    if (!cloudSpeed) return;
    cloudOffset += cloudDir * cloudSpeed * dt;
    elClouds.style.backgroundPositionX = (cloudOffset % bgWidth) + "px";
  }

  // distant lightning: a quick double-flash brightening the clouds at random
  // intervals (~14-26s), with the second flash's timing/strength also varied.
  function lightInterval() {
    return 14 + Math.random() * 12;
  }
  var lightNext = lightInterval(),
    lightT = 0,
    flash = null;
  function lightning(dt) {
    if (!cloudSpeed) return; // only on rooms with a sky
    lightT += dt;
    if (lightT >= lightNext) {
      lightT = 0;
      lightNext = lightInterval();
      flash = {
        t: 0,
        d2: 0.2 + Math.random() * 0.12, // second-flash delay
        a2: 0.5 + Math.random() * 0.4, // second-flash strength
      };
    }
    if (!flash) return;
    flash.t += dt;
    if (flash.t > flash.d2 + 0.3) {
      flash = null;
      elClouds.style.filter = "";
      return;
    }
    var t = flash.t;
    function bump(c, w) {
      var x = (t - c) / w;
      return x * x < 1 ? 1 - x * x : 0;
    }
    var amt = bump(0.05, 0.07) + flash.a2 * bump(flash.d2, 0.06);
    elClouds.style.filter = "brightness(" + (1 + amt * 1.6) + ")";
  }

  // ---- rain ----------------------------------------------------------------
  // Atmosphere overlay confined to the game window (a child of .game, sized to
  // the world width and clipped). Two layers of intermittent wind-slanted dash
  // streaks (a tiling texture, not continuous lines) scroll at different speeds
  // for parallax — pure CSS, no per-frame JS. Toggle per-room with `rain` in
  // settings.js (0 = off, or 0..1 intensity), or live with Nooir.rain(...).
  var elRain = null;
  // Build a seamlessly-tiling rain texture of randomly-placed streaks. Large tiles
  // + random positions kill the obvious grid the old repeated sprite showed; each
  // streak is drawn at the 9 wrap offsets so it tiles cleanly across edges.
  function rainTextureURL(size, count, len, slant, lw) {
    var c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    var g = c.getContext("2d");
    g.lineWidth = lw;
    g.lineCap = "round";
    for (var i = 0; i < count; i++) {
      var x = Math.random() * size,
        y = Math.random() * size,
        L = len * (0.55 + Math.random() * 0.9),
        ex = x + slant * L,
        ey = y + L;
      g.strokeStyle =
        "rgba(205,214,228," + (0.35 + Math.random() * 0.5).toFixed(2) + ")";
      for (var ox = -1; ox <= 1; ox++)
        for (var oy = -1; oy <= 1; oy++) {
          g.beginPath();
          g.moveTo(x + ox * size, y + oy * size);
          g.lineTo(ex + ox * size, ey + oy * size);
          g.stroke();
        }
    }
    return c.toDataURL();
  }
  function ensureRain() {
    if (elRain) return;
    var NEAR = 240,
      FAR = 320; // big, *different* tiles → the repeat period isn't catchable
    var nearURL = rainTextureURL(NEAR, 95, 26, -0.18, 1.4),
      farURL = rainTextureURL(FAR, 70, 18, -0.18, 1.1);
    var style = document.createElement("style");
    // translate by whole-tile multiples so each layer loops seamlessly; the
    // diagonal adds wind, the differing periods give parallax.
    style.textContent =
      "@keyframes nooir-rain-near{to{background-position:" +
      -NEAR +
      "px " +
      NEAR * 2 +
      "px;}}" +
      "@keyframes nooir-rain-far{to{background-position:" +
      -FAR +
      "px " +
      FAR * 2 +
      "px;}}";
    document.head.appendChild(style);
    elRain = document.createElement("div");
    elRain.className = "rain";
    elRain.style.cssText =
      "position:absolute;left:0;top:0;height:100%;pointer-events:none;" +
      "overflow:hidden;z-index:99000;opacity:0;transition:opacity .6s;";
    var near = document.createElement("div"),
      far = document.createElement("div");
    near.style.cssText =
      "position:absolute;inset:0;background:url('" +
      nearURL +
      "') repeat;background-size:" +
      NEAR +
      "px " +
      NEAR +
      "px;opacity:.9;animation:nooir-rain-near .6s linear infinite;";
    far.style.cssText =
      "position:absolute;inset:0;background:url('" +
      farURL +
      "') repeat;background-size:" +
      FAR +
      "px " +
      FAR +
      "px;opacity:.5;animation:nooir-rain-far 1.05s linear infinite;";
    elRain.appendChild(far);
    elRain.appendChild(near);
    elGame.appendChild(elRain); // inside the game window, not the viewport
  }
  function setRain(v) {
    ensureRain();
    var intensity = v === true ? 1 : typeof v === "number" ? v : 0;
    intensity = Math.max(0, Math.min(1, intensity));
    rainOn = intensity > 0;
    elRain.style.width = (bgWidth || 1300) + "px"; // match the world width
    elRain.style.opacity = intensity;
    if (rainBtn) rainBtn.textContent = rainOn ? "Rain ■" : "Rain ▶";
    if (rainSlider) rainSlider.value = intensity;
  }
  var rainOn = false;

  // bright/dark sky: bright overrides the clouds layer with the room's sunny
  // variant; dark clears the inline image so the room CSS (clouds_noir.png)
  // shows through. Re-applied per level (applyRoomConfig) for the right path.
  var bright = false;
  function applyBright() {
    elClouds.style.backgroundImage = bright
      ? "url('rooms/scene" + level + "/clouds_noir_sunny.png')"
      : ""; // fall back to the room stylesheet's dark clouds
  }
  function setBright(on) {
    bright = !!on;
    applyBright();
    if (brightBtn) brightBtn.textContent = bright ? "☀ Bright" : "☾ Dark";
    saveEnv("bright", bright); // remember the sky state
  }

  var last = 0;
  function frame(ts) {
    if (!last) last = ts;
    var dt = Math.min(0.05, (ts - last) / 1000); // clamp long gaps (tab switches)
    last = ts;
    update(dt);
    updateDialogMoves(dt); // per-line staging glides (runs over update's idle)
    updateNpcPaths(dt); // patrolling cast walk their loops
    updateObjBlocks(dt); // animated scenery (smoke, flicker, …)
    animateClouds(dt);
    lightning(dt);
    updateAnims(dt);
    render();
    requestAnimationFrame(frame);
  }

  // dev tools (toolbar + collision/placement editor) only in dev mode
  if (DEV) {
    buildEditor();
    buildCharBar(); // top toolbar: switch character + test grab/pickup/run cycles
  }
  // resume the last session: persisted character + scene (env), else config default
  if (CHAR_META[env.character]) charOverride = env.character;
  var bootLevel =
    env.level >= 1 && env.level <= MAX_LEVEL
      ? env.level
      : window.mainlevel || 1;
  if (inventory.length) renderInventory(); // show a restored inventory
  fitToScreen();
  loadLevel(bootLevel).then(function () {
    requestAnimationFrame(frame);
  });

  // debug handle (state + helpers) for tooling and level logic
  window.Nooir = {
    player: player,
    col: col,
    isWalkable: isWalkable,
    terrainAt: terrainAt,
    findPath: findPath,
    heightAt: heightAt,
    toggleEditor: toggleEditor,
    editor: editor,
    paint: paintAt,
    exportMap: exportMap,
    setBrush: function (b) {
      editor.brush = b;
    },
    setRadius: function (r) {
      editor.radius = r;
    },
    goLevel: function (n) {
      if (!transitioning) {
        transitioning = true;
        transitionTo(n);
      }
    },
    actionZones: actionZones,
    exitZones: exitZones, // [{id,to,cx,cy,color,bounds}] resolved doors (multi-door)
    reloadZones: function (defs) {
      zoneDefs =
        defs ||
        (Array.isArray(window.actionZones) ? window.actionZones.slice() : []);
      computeActionZones();
    },
    actions: ACTIONS, // map a zone id to a behaviour: Nooir.actions.rock = () => Nooir.shake()
    shake: shake,
    spin: spin, // one-shot character animations
    flip: function () {
      charFlip = !charFlip;
    },
    playAnimation: playAnimation, // spawn a custom moving sprite animation
    setZoneActive: setZoneActive, // turn a zone off/on by id
    activateZone: function (id) {
      setZoneActive(id, true);
    },
    charAnims: CHAR_ANIMS, // registry of character cycles
    characters: CHAR_META, // per-character sprite metrics (hatguy, woman, …)
    setCharacter: setCharacter, // switch the active character live (test helper)
    npcs: npcs, // cast members standing in the level (from settings `cast`)
    scaleNpc: function (which, scale) {
      // live size tweak for dialing a cast member in: which = label (string) or
      // index (number). Paste the winning value into that scene's `cast` `scale`.
      var n =
        typeof which === "number"
          ? npcs[which]
          : npcs.filter(function (m) {
              return m.label === which || m.name === which;
            })[0];
      if (!n) return null;
      n.scale = typeof scale === "number" && scale > 0 ? scale : 1;
      renderNpc(n);
      return n.scale;
    },
    setNpcPath: function (which, pts, speed) {
      // give a cast member a looping patrol path live: which = label/name/index,
      // pts = [{x,y}, …] (>=2) or null to stop, optional speed (walk-speed × ).
      // Returns the waypoint count.
      var n =
        typeof which === "number"
          ? npcs[which]
          : npcs.filter(function (m) {
              return m.label === which || m.name === which;
            })[0];
      if (!n) return null;
      if (Array.isArray(pts) && pts.length >= 2 && !n.pose) {
        n.path = pts.map(function (p) {
          return { x: p.x, y: p.y };
        });
        n.x = n.path[0].x;
        n.y = n.path[0].y;
        n.pathIndex = 1;
        if (typeof speed === "number" && speed > 0) n.pathSpeed = speed;
      } else {
        n.path = null;
      }
      renderNpc(n);
      return n.path ? n.path.length : 0;
    },
    setNpcSpeed: function (which, speed) {
      // change a patrol's walk speed live (walk-speed multiplier; 1 = the hero's)
      var n =
        typeof which === "number"
          ? npcs[which]
          : npcs.filter(function (m) {
              return m.label === which || m.name === which;
            })[0];
      if (!n || !(typeof speed === "number" && speed > 0)) return null;
      n.pathSpeed = speed;
      return n.pathSpeed;
    },
    setCharAnim: function (name) {
      playCharAnim(name, null);
    }, // run/kneel/reach… (null = walk)
    playCharAnim: playCharAnim, // one-shots take an onEnd callback
    flashMsg: flashMsg, // flashMsg(text, ms) — brief on-screen message
    addObject: addObject, // place a prop/pickup: {id,image,size,x,y,takeable,onInteract}
    inventory: inventory, // array of {id,image} the character is carrying
    hasItem: hasItem, // hasItem(id) -> already picked up?
    story: story, // persisted story flags (branching state)
    setFlag: setFlag, // setFlag(key, value) — also persists to localStorage
    getFlag: getFlag, // getFlag(key)
    theEnd: theEnd, // theEnd(title, text) — full-screen ending card
    lightning: function () {
      flash = { t: 0, d2: 0.24, a2: 0.7 };
    }, // trigger a lightning flash now
    rain: function (v) {
      // public rain control persists (a manual override), unlike the per-scene
      // setRain() that applyRoomConfig calls with each room's default
      setRain(v);
      saveEnv("rain", v === true ? 1 : typeof v === "number" ? v : 0);
    }, // rain(true/false) or rain(0..1) intensity
    setBright: setBright, // setBright(true) = sunny sky, false = dark noir clouds
    charTint: function (v) {
      // live per-scene character lighting — number | CSS-filter string | object
      // ({brightness,contrast,saturate,sepia,hue,blur}). Handy for dialing a
      // scene's value before pasting it into that scene's settings.js `charTint`.
      window.charTint = v;
      charFilter = buildCharFilter(v);
      applyCharFilter();
      return charFilter;
    },
    // optional extra handler for action zones, on top of the built-in id actions:
    // fn({id, index, cx, cy, x, y, level})
    onAction: null,
  };
})();
