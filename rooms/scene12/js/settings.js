/* THE GREEN BOOK — Act II: OUTSIDE THE PRECINCT (exterior, transitional).
 * Stone steps to the 15th Precinct; Brandt's "invitation" is up those stairs. */
var backgroundSize = 1300, // px
  startingPoint = 668, // spawn x — sidewalk, the steps to the centre-left
  farHeight = 126,
  nearHeight = 220,
  objBlocks = [{"id":"lamp","src":"lamp.png","bottomY":772},{"id":"precinct","src":"precinct.png","bottomY":666},{"id":"grocery","src":"grocery.png","bottomY":595}],
  cloudSpeed = 0,
  rain = 0.7,
  character = "hatguy",
  heroName = "Elias",
  actionZones = [],
  exitTo = 6, // → up the steps into the precinct (green door)
  backTo = 3, // ← Quist's law office
  startingY = 558,
  startingFacing = "f",
  scene = 12;
