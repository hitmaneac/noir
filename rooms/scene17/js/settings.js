/* THE GREEN BOOK — Finch's apartment (interior). Reached from the first door on
 * Vesper Street (scene1). Placeholder art for now — replace back.png with the
 * real interior and repaint area.png (the walkable floor + the blue door back to
 * the hall) in the editor (E). Add clues/props in js/actions.js when ready. */
var backgroundSize = 1300, // width of the game world, px
  startingPoint = 630, // spawn x — just inside the door
  farHeight = 270, // character height (px) at the back wall
  nearHeight = 430, // character height (px) at the near edge
  cloudSpeed = 0, // interior: no sky
  character = "hatguy",
  heroName = "Elias",
  actionZones = [], // TODO: Finch's things to examine
  onEnter = "apartment_intro", // plays once on first entry (registered in actions.js)
  backTo = 1, //  ← back out to Vesper Street (the blue door)
  startingY = 560, // a step in front of the door, clear of the back zone
  startingFacing = "f",
  scene = 17;
