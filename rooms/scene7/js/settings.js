/* THE GREEN BOOK — Toranno's club, back room (Act II) (PLACEHOLDER art — back.png/area.png generated).
 * See /story.md and /roadmap.md. A blue [back] zone returns to the prior scene. */
var backgroundSize = 1300, // px
  startingPoint = 382, // spawn x (clear of the back zone)
  farHeight = 266, // character height at the back of the floor
  nearHeight = 363, // character height at the near edge
  cloudSpeed = 0, // interior
  character = "hatguy",
  heroName = "Elias",
  // Vince Toranno — gangster, in his booth. Side-walk art, faces left.
  cast = [
    {
      name: "thug",
      label: "Toranno",
      x: 900,
      y: 650,
      facing: "r",
      dialog: [
        ["npc", "Sit. You're the one stirring up my quiet little pond."],
        ["hero", "You'd be Toranno."],
        [
          "npc",
          "I'm a businessman. Businessmen keep books. One of mine walked off — green cover, about so big. You wouldn't have seen it.",
        ],
        ["hero", "Lot of books in this town."],
        [
          "npc",
          "Only one gets a man killed for reading it. Bring it to me, Mores, and you step out of the rain a rich man.",
        ],
        ["hero", "And if I'd rather stay wet?"],
        ["npc", "Then you'll catch your death. I hear it's going around."],
      ],
    },
  ],
  objBlocks = [],
  // the club's book of reservations on the booth table — a name worth noting
  actionZones = [{"id":"ledgerbook","cx":620,"cy":660}],
  exitTo = 15, // → hallway to the holding cells (Act III: the frame)
  backTo = 14, // ← the club floor
  npcPlacements = [{"npc":"Toranno","x":934,"y":663,"scale":1.08,"facing":"l"}],
  startingY = 602,
  startingFacing = "fr",
  scene = 7;
