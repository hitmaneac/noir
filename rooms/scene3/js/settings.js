/* THE GREEN BOOK — Act II: QUIST'S LAW OFFICE. See /story.md.
 * Avery Quist — Toranno's fixer — offers Elias an envelope to forget Finch.
 * The hero CHOOSES: take it (flag tookBribe=true) or refuse. */
var backgroundSize = 1300, // width of the game world, px
  startingPoint = 196, // spawn x
  farHeight = 310, // character height (px) at the back of the floor
  nearHeight = 450, // character height (px) at the near edge
  objBlocks = [{"id":"desk","src":"desk.png","bottomY":669}], // (furniture is painted into the background art)
  cloudSpeed = 0, // interior: no sky/clouds
  character = "hatguy", // Elias
  heroName = "Elias",
  cast = [
    {
      name: "attorney",
      label: "Quist",
      x: 760,
      y: 620,
      facing: "r",
      dialog: [
        ["npc", "Mr. Mores. Sit — a drink? No? Suit yourself. Avery Quist."],
        ["hero", "Toranno's lawyer."],
        [
          "npc",
          "I represent interests. One of them would like the Finch matter to rest. Quietly.",
        ],
        [
          "npc",
          "There's an envelope on the desk. Thick. It's yours, and we never met.",
        ],
        {
          choice: [
            {
              text: "Take the envelope.",
              set: { tookBribe: true },
              then: [
                ["hero", "...A man's got rent."],
                [
                  "npc",
                  "A practical man. We'll remember the favor. Go home, Mores. Stay dry.",
                ],
              ],
            },
            {
              text: "Leave it on the desk.",
              set: { tookBribe: false },
              then: [
                [
                  "hero",
                  "I don't take money to stop looking. Bad for the eyes.",
                ],
                [
                  "npc",
                  "Pity — eyes are delicate things. Do give my regards to your secretary.",
                ],
              ],
            },
          ],
        },
      ],
    },
  ],
  actionZones = [{ id: "letter", cx: 540, cy: 552 }], // Quist's bribe on the desk blotter (examine)
  exitTo = 12, // → outside the precinct (Act II continues)
  backTo = 5, //  ← Mickey's bar
  npcPaths = [{"npc":"Quist","path":[{"x":803,"y":580},{"x":630,"y":577},{"x":803,"y":579}],"speed":0.3}],
  startingY = 534,
  startingFacing = "fr",
  npcPlacements = [{"npc":"Quist","x":786,"y":596,"facing":"r"}],
  scene = 3;
