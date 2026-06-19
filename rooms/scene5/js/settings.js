/* THE GREEN BOOK — Mickey's bar (Act II) (PLACEHOLDER art — back.png/area.png generated).
 * See /story.md and /roadmap.md. A blue [back] zone returns to the prior scene. */
var backgroundSize = 1300, // px
  startingPoint = 134, // spawn x (clear of the back zone)
  farHeight = 350, // character height at the back of the floor
  nearHeight = 370, // character height at the near edge
  cloudSpeed = 0, // interior
  character = "hatguy",
  heroName = "Elias",
  // Mickey Sloan — bartender.
  cast = [
    {
      name: "bartender",
      label: "Mickey",
      x: 680,
      y: 630,
      facing: "r",
      scale: 0.9,
      dialog: [
        [
          "npc",
          "Elias Mores. You've got the look of a man who's been down to the river.",
        ],
        ["hero", "Finch's matchbook had your place on it. The Blue Room."],
        [
          "npc",
          "Artie drank here when his nerves got loud. Lately they got loud a lot.",
        ],
        ["hero", "Loud about what?"],
        [
          "npc",
          "A book. Numbers that belong to Vince Toranno — and a name nobody says sober. Captain Brandt.",
        ],
        ["hero", "And the woman? Red coat, calls herself his sister."],
        [
          "npc",
          "Vera's no man's sister, friend. Last I saw, she left on Toranno's arm. She pours sweeter than my best bourbon — and twice as expensive.",
        ],
      ],
    },
  ],
  objBlocks = [{"id":"bar","src":"bar.png","bottomY":653},{"id":"stools","src":"stools.png","bottomY":775}],
  actionZones = [],
  // warm, smoky bar light — sit the cast in it (tune live via Nooir.charTint)
  charTint = { brightness: 0.95, sepia: 0.22, saturate: 1.05, hue: -6 },
  exitTo = 3, //  → Quist's law office (the bribe)
  backTo = 11, // ← street outside Mickey's
  npcPaths = [{"npc":"Mickey","path":[{"x":1088,"y":595},{"x":990,"y":611},{"x":823,"y":623},{"x":416,"y":615},{"x":699,"y":607},{"x":1088,"y":593}],"speed":0.3}],
  startingY = 743,
  startingFacing = "br",
  scene = 5;
