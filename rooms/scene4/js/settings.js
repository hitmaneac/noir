/* THE GREEN BOOK — Act I, Scene: Elias Mores's office (see /story.md).
 * Small, crowded: filing cabinets, broken window, green banker's lamp, an
 * overfilled trashcan, an ashtray. Vera Lange (the woman in red) hires Elias
 * to find her "brother"; Dot Hayes (secretary) sees through her. */
var backgroundSize = 1300, // width of the game world, px
  startingPoint = 359, // spawn x (in front of the desk)
  farHeight = 320, // character height (px) at the back of the floor
  nearHeight = 450, // character height (px) at the near edge
  cloudSpeed = 0, // interior: no sky/clouds
  character = "hatguy", // Elias Mores, the hero
  heroName = "Elias", // dialog name for the hero
  cast = [
    // Vera Lange — the client, the woman in red. (Click her, or Enter when near.)
    {
      name: "woman",
      label: "Vera",
      x: 880,
      y: 720,
      facing: "l",
      dialog: [
        [
          "npc",
          "Mr. Mores? They tell me you find people who don't want to be found.",
        ],
        [
          "hero",
          "Sometimes I find them. Sometimes they find me. Who're we talking about?",
        ],
        [
          "npc",
          "My brother. Arthur Finch. Eight days, not a word — and Artie always calls.",
        ],
        ["hero", "Brothers skip town. It's a hobby. Why a private man?"],
        [
          "npc",
          "Because the police read his name and stopped reading. I can pay.",
        ],
        ["hero", "You can pay plenty, judging by the coat."],
        {
          who: "npc",
          text: "Find him. Before someone less gentle does.",
          npc: { x: 980, y: 640, facing: "l" },
        },
      ],
    },
    // Dot Hayes — secretary / confidant. PLACEHOLDER art.
    {
      name: "secretary",
      label: "Dot",
      x: 300,
      y: 726,
      facing: "r",
      // optional default pose — Dot sits at her desk (omit `pose` to stand)
      pose: { src: "characters/secretary_sit.png", w: 224, h: 178 },
      dialog: [
        ["npc", "She tipped you double and didn't ask your rate."],
        ["hero", "Maybe she's just generous."],
        [
          "npc",
          "People are only generous when they already know how the story ends.",
        ],
        ["hero", "Then somebody ought to find out the ending."],
        ["npc", "That's the part I'm worried about, Mr. Mores."],
      ],
    },
  ],
  objBlocks = [{"id":"desk","src":"desk.png","bottomY":698},{"id":"minicloset","src":"minicloset.png","bottomY":682}], // (desk / chairs are painted into the background art)
  actionZones = [],
  exitTo = 1, // → Vesper Street (Act I: go find Finch)
  backTo = 0, // start of the game — no way back
  startingY = 608,
  startingFacing = "br",
  npcPlacements = [{"npc":"Vera","x":726,"y":530,"facing":"b"}],
  scene = 4;
