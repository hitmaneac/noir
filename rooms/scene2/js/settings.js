/* THE GREEN BOOK — Act I: THE WATERFRONT APPROACH, night (TRANSITIONAL).
 * A mood-setting pass-through; Elias walks the harbor to Pier 7 (scene10),
 * where he'll find Finch's body and the green book. See /story.md. */
var backgroundSize = 1300, // width of the game world, px
  startingPoint = 60, // spawn x
  farHeight = 130, // character height at the back of the pier
  nearHeight = 230, // character height at the near edge
  objBlocks = [{"id":"boxes","src":"boxes.png","bottomY":661},{"id":"posts","src":"posts.png","bottomY":729}], // dedicated pier art — no reused fence layer
  cloudSpeed = 0, // night waterfront
  rain = 0.6, // wet night on the waterfront
  character = "hatguy",
  heroName = "Elias",
  actionZones = [],
  exitTo = 10, // → Pier 7, the body (deep-perspective dock)
  backTo = 1, //  ← Vesper Street
  startingY = 626,
  startingFacing = "r",
  scene = 2;
