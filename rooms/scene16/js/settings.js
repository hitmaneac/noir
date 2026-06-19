/* THE GREEN BOOK — Act III: STAIRWAY TO THE ROOFTOP (interior → exterior).
 * Concrete fire-stairs up to the door, and the rain, and the reckoning. */
var backgroundSize = 1300, // px
  startingPoint = 298, // spawn x — the landing; the stairs rise to the centre
  farHeight = 123,
  nearHeight = 393,
  objBlocks = [{"id":"railing","src":"railing.png","bottomY":669}],
  cloudSpeed = 0,
  rain = 0.4, // a little weather leaks into the stairwell
  character = "hatguy",
  heroName = "Elias",
  actionZones = [],
  exitTo = 8, // → up the stairs to the rooftop (green, the stairs)
  backTo = 9, // ← back down toward the cells
  startingY = 701,
  startingFacing = "br",
  scene = 16;
