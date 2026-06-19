/* THE GREEN BOOK — Act II: INSIDE THE CLUB, main floor (interior).
 * Stage, dance floor, the long bar. A side door leads to Toranno's back room. */
var backgroundSize = 1300, // px
  startingPoint = 1154, // spawn x — out on the floor, between the tables
  farHeight = 103, // deep room — small at the stage, large at the front tables
  nearHeight = 250,
  objBlocks = [{"id":"tables","src":"tables.png","bottomY":801},{"id":"counter","src":"counter.png","bottomY":477}],
  cloudSpeed = 0,
  character = "hatguy",
  heroName = "Elias",
  actionZones = [],
  exitTo = 7, // → through to Toranno's back room (green, far right)
  backTo = 13, // ← back out to the street
  startingY = 739,
  startingFacing = "b",
  scene = 14;
