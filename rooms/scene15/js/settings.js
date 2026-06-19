/* THE GREEN BOOK — Act III: HALLWAY TO THE HOLDING CELLS (interior).
 * A grimy precinct corridor receding to the barred gate — the cells beyond. */
var backgroundSize = 1300, // px
  startingPoint = 570, // spawn x — mid-corridor, the barred gate dead ahead
  farHeight = 127, // strong one-point perspective: tiny at the gate, tall up front
  nearHeight = 581,
  objBlocks = [],
  cloudSpeed = 0,
  character = "hatguy",
  heroName = "Elias",
  actionZones = [],
  exitTo = 9, // → through the barred gate into the cell (green, far centre)
  backTo = 7, // ← back toward the club / the way in
  startingY = 775,
  startingFacing = "b",
  scene = 15;
