/* THE GREEN BOOK — Finch's apartment. Register cutscenes + action handlers here.
 *
 * Example wiring (this scene plays a short intro the first time you enter — the
 * `onEnter` in settings.js names it; the `cs_<id>` flag gates it to play once):
 *
 *   Nooir.cutscene("apartment_intro", [
 *     { do: "fade",  to: 1, ms: 500 },                  // black
 *     { do: "say",   who: "hero", text: "Finch's place. Tossed, like the locker." },
 *     { do: "fade",  to: 0, ms: 600 },                  // reveal the room
 *     { do: "move",  who: "hero", x: 520, y: 600, facing: "l" }, // staged: cross the room
 *     { do: "say",   who: "hero", text: "Somebody was looking for the same thing I am." },
 *   ]);
 *
 * Full-screen flashback example (stills + captions, then hand back to the room):
 *   Nooir.cutscene("flashback", [
 *     { do: "still", img: "cutscenes/finch_alley.png", fadeIn: 800 },
 *     { do: "say",   who: "vera", text: "He said he'd be careful." },
 *     { do: "anim",  frames: ["cutscenes/rain1.png","cutscenes/rain2.png"], speed: 0.12, hold: 1500 },
 *     { do: "clear", ms: 600 },                          // back to the live scene
 *   ]);
 *   // fire it from a dialog choice's do:, an action zone, or: Nooir.playCutscene("flashback")
 */

Nooir.cutscene("apartment_intro", [
  { do: "fade", to: 1, ms: 450 },
  { do: "say", who: "hero", text: "Finch's place. Door already open, lock already sorry about it." },
  { do: "fade", to: 0, ms: 650 },
  { do: "move", who: "hero", x: 520, y: 600, facing: "l" },
  { do: "say", who: "hero", text: "Somebody tossed it before me. Looking for the same little green book." },
]);
