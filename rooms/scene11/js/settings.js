/* THE GREEN BOOK — Act II: STREET OUTSIDE MICKEY'S BAR (exterior, transitional).
 * Neon and wet pavement; the door leads into Mickey's. See /story.md. */
var backgroundSize = 1300, // px
  startingPoint = 95, // spawn x — arrive on the sidewalk, the door to the left
  farHeight = 84, // flat storefront — shallow sidewalk, little perspective
  nearHeight = 398,
  objBlocks = [{"id":"lamp","src":"lamp.png","bottomY":612}],
  cloudSpeed = 0,
  rain = 0.7, // wet night on the street
  character = "hatguy",
  heroName = "Elias",
  actionZones = [],
  exitTo = 5, // → into Mickey's bar (the green door)
  backTo = 10, // ← Pier 7 / the waterfront
  startingY = 502,
  startingFacing = "f",
  scene = 11;
