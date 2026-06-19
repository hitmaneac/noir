/* THE GREEN BOOK — Act II: OUTSIDE TORANNO'S CLUB (exterior, transitional).
 * "Members Only." The door leads onto the club floor. See /story.md. */
var backgroundSize = 1300, // px
  startingPoint = 114, // spawn x — sidewalk, the club door to the left
  farHeight = 82,
  nearHeight = 347,
  objBlocks = [{"id":"lamp","src":"lamp.png","bottomY":620}],
  cloudSpeed = 0,
  rain = 0.7,
  character = "hatguy",
  heroName = "Elias",
  actionZones = [],
  exitTo = 14, // → onto the club floor (green door)
  backTo = 6, //  ← the precinct
  startingY = 512,
  startingFacing = "f",
  scene = 13;
