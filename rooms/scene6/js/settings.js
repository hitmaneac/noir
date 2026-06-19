/* THE GREEN BOOK — The precinct (Act II) (PLACEHOLDER art — back.png/area.png generated).
 * See /story.md and /roadmap.md. A blue [back] zone returns to the prior scene. */
var backgroundSize = 1300, // px
  startingPoint = 226, // spawn x (clear of the back zone)
  farHeight = 280, // character height at the back of the floor
  nearHeight = 340, // character height at the near edge
  cloudSpeed = 0, // interior
  character = "hatguy",
  heroName = "Elias",
  // Capt. Russ Brandt — corrupt police captain. Side-walk art, faces left.
  cast = [
    {
      name: "cop",
      label: "Brandt",
      x: 940,
      y: 620,
      facing: "r",
      dialog: [
        [
          "npc",
          "Mores. Heard you've been kicking over rocks down on Vesper Street.",
        ],
        ["hero", "A man's missing. Somebody ought to look."],
        [
          "npc",
          "Somebody did. Case is closed — Finch took a long walk off a short pier. Accident.",
        ],
        ["hero", "Funny kind of accident. Sewn into his own coat."],
        [
          "npc",
          "You want to be careful what you dig up, private man. It has a way of getting buried with you.",
        ],
        {
          who: "hero",
          text: "That a threat, Captain?",
          hero: { x: 700, y: 700, facing: "l" },
        },
        [
          "npc",
          "It's a weather report. Storm's coming. I'd hate to read your name in it — say, on a warrant.",
        ],
      ],
    },
  ],
  objBlocks = [
    { id: "desks", src: "desks.png", bottomY: 699 },
    {
      id: "smoke1",
      bottomY: 699,
      animate: {
        frames: [
          "smoke1.png",
          "smoke2.png",
          "smoke3.png",
          "smoke4.png",
          "smoke5.png",
          "smoke6.png",
        ],
        speed: 0.2,
        pause: 0.2,
        fadeIn: 0.2,
        fadeOut: 0.2,
      },
    },
    {
      id: "smoke2",
      bottomY: 699,
      animate: {
        frames: [
          "smoke4.png",
          "smoke5.png",
          "smoke6.png",
          "smoke1.png",
          "smoke2.png",
          "smoke3.png",
        ],
        speed: 0.2,
      },
    },
  ],
  // glimpse Brandt's open case file — Elias's own name penciled in the margin
  actionZones = [{"id":"casefile","cx":940,"cy":600}],
  exitTo = 13, // → outside Toranno's club
  backTo = 12, // ← outside the precinct
  objBlocks = [{"id":"desks","src":"desks.png","bottomY":699},{"id":"smoke1","bottomY":699,"animate":{"frames":["smoke1.png","smoke2.png","smoke3.png","smoke4.png","smoke5.png","smoke6.png"],"speed":0.2,"pause":0.2,"fadeIn":0.2,"fadeOut":0.2}},{"id":"smoke2","bottomY":699,"animate":{"frames":["smoke4.png","smoke5.png","smoke6.png","smoke1.png","smoke2.png","smoke3.png"],"speed":0.2}}],
  npcPaths = [{"npc":"Brandt","path":[{"x":936,"y":564},{"x":960,"y":607},{"x":354,"y":605},{"x":852,"y":564},{"x":935,"y":564}]}],
  startingY = 607,
  startingFacing = "fr",
  scene = 6;
