/* THE GREEN BOOK — Act I: VESPER STREET (Finch's tenement, rain). See /story.md.
 * Elias works the pawn ticket Vera left him: locker 0413 holds Finch's last clue. */
var backgroundSize = 1300, // width of the game world, px
  startingPoint = 327, // spawn x (under the streetlamp)
  farHeight = 130, // character height (px) at the far edge of the floor
  nearHeight = 230, // character height (px) at the near edge
  objBlocks = [{"id":"lamppost","src":"lamppost.png","bottomY":632}], // dedicated street art — no reused fence layer
  cloudSpeed = 0, // building facade fills the frame; no sky
  rain = 0.8, // rainy night
  character = "hatguy",
  heroName = "Elias",
  // story zones — examine Finch's door, work the pawn lockers (see actions.js)
  actionZones = [{"id":"finchdoor","cx":300,"cy":620},{"id":"lockers","cx":720,"cy":655}],
  exitTo = 2, // → the docks (follow Finch's trail to Pier 7)
  backTo = 4, // ← Elias's office
  startingY = 562,
  startingFacing = "f",
  scene = 1;
