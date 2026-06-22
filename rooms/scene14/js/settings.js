/* THE GREEN BOOK — Act II: INSIDE THE CLUB, main floor (interior).
 * Stage, dance floor, the long bar. A side door leads to Toranno's back room. */
var backgroundSize = 1300, // px
  startingPoint = 1154, // spawn x — out on the floor, between the tables
  farHeight = 103, // deep room — small at the stage, large at the front tables
  nearHeight = 250,
  objBlocks = [{"id":"tables","src":"tables.png","bottomY":801},{"id":"counter","src":"counter.png","bottomY":477}],
  cloudSpeed = 0,
  character = "hatguy",
  heroName = "Elias",
  cast = [
    {
      // The bouncer on the back-room door. The green exit (→ scene7) is vetoed
      // in actions.js until a dialog choice calls Nooir.passDoorman().
      name: "thug",
      label: "Doorman",
      x: 956,
      y: 521,
      facing: "r", // squared up to the floor, watching who comes off it
      dialog: [
        ["npc", "Far as you go, friend. Back room's family and the invited. You're neither."],
        ["hero", "I'm the man who pulled Arthur Finch out of the river."],
        ["npc", "...Huh. Everybody's got a sad story. Most leave 'em at the door."],
        {
          choice: [
            {
              text: "“Tell Toranno the man who found Finch is asking for him.”",
              set: { doormanTone: "name" },
              then: [
                ["npc", "Finch. Yeah — that one he'll want to hear himself."],
                ["npc", "Two minutes. Keep your hands where the room can see 'em."],
              ],
              do: function () {
                Nooir.passDoorman();
              },
            },
            {
              text: "Flash Finch's Blue Room matchbook.",
              set: { doormanTone: "matchbook" },
              then: [
                ["hero", "A regular left this behind. He won't be needing the light."],
                ["npc", "...Dead man's matches. Classy. Go on in — and you leave when I say leave."],
              ],
              do: function () {
                Nooir.passDoorman();
              },
            },
            {
              text: "“Move, or I move you.”",
              set: { doormanTone: "menace" },
              then: [
                ["npc", "Heh. Tough guy. Those are the ones that bruise the prettiest."],
                ["npc", "...Ah — boss said no scenes on the floor tonight. Your lucky night. Go."],
              ],
              do: function () {
                Nooir.passDoorman();
              },
            },
          ],
        },
      ],
    },
  ],
  actionZones = [],
  exitTo = 7, // → through to Toranno's back room (green, far right)
  backTo = 13, // ← back out to the street
  startingY = 739,
  startingFacing = "b",
  scene = 14;
