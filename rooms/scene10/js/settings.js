/* THE GREEN BOOK — Act I close: PIER 7, the body (deep-perspective dock art).
 * The transitional waterfront (scene2) sets the mood; here Elias actually finds
 * Arthur Finch dead and recovers the green book sewn into his coat. See /story.md. */
var backgroundSize = 1300, // width of the game world, px
  startingPoint = 179, // spawn x — arrive on the near-right dock, body ahead
  farHeight = 10, // small at the back (the dock recedes toward the crane)
  nearHeight = 450, // tall at the near edge
  objBlocks = [],
  cloudSpeed = 0, // night waterfront
  rain = 0.6, // same wet night as the approach
  character = "hatguy",
  heroName = "Elias",
  actionZones = [],
  // cold, wet night — darken + cool the hero so he isn't pasted onto the dock
  charTint = { brightness: 0.7, saturate: 0.85, hue: -6 },
  exitTo = 11, // → street outside Mickey's bar (Act II)
  backTo = 2, //  ← the waterfront approach (transitional)
  startingY = 750,
  startingFacing = "br",
  scene = 10;
