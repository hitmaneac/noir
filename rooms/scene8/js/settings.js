/* THE GREEN BOOK — Act III: THE RECKONING (rooftop, rain). See /story.md.
 * Vera reveals she's the schemer; Elias decides who the green book destroys.
 * The dialog is conditional on holding the book (Nooir.hasItem), and the finale
 * CHOICE sets the `vera` flag and fires the matching ending (Nooir.theEnd). */
var backgroundSize = 1300, // px
  startingPoint = 285, // spawn by the roof-access door
  farHeight = 172, // character height at the back of the roof
  nearHeight = 318, // character height at the near edge
  cloudSpeed = 0, // sky is painted into the bg
  rain = 0.85, // rooftop in the rain
  character = "hatguy",
  heroName = "Elias";

// conditional opening dialog (the "workaround" — settings.js can read game state)
var _hasBook = !!(window.Nooir && Nooir.hasItem && Nooir.hasItem("greenbook"));

// Dot's fate is decided back in the cell (scene9). `protectedDot` flips which
// version of her closing beat each ending gets. Evaluated at ending time so the
// flag set in scene9 is current. Returns the Dot half-line for the given ending.
function _dotBeat(ending) {
  var safe = !!(window.Nooir && Nooir.getFlag && Nooir.getFlag("protectedDot"));
  if (ending === "hard") {
    return safe
      ? " Back at the office Dot's already there, name nowhere in it, lighting your cigarette like she'd waited up. She says nothing. It means everything. Rain."
      : " It was Dot's hands that walked the book to that honest desk, and Dot's name in the margins now. She got out clean — barely. She lights your cigarette and you both pretend the shake in her hand is the cold. Rain.";
  }
  // bleak
  return safe
    ? " You kept Dot out of it, at least; she's home, safe, never knew how close it came. In the morning she doesn't quite look at you the same. Maybe she never will again."
    : " And Dot's still out there somewhere with a book nobody can ever know she touched, waiting for a knock that may yet come. In the morning she doesn't quite look at you the same. Maybe she never will again.";
}

var _veraDialog = _hasBook
  ? [
      [
        "npc",
        "You found it. I knew you would — you always were a finder, Elias.",
      ],
      ["hero", "You were never Finch's sister."],
      [
        "npc",
        "No. I was the one thing worse: the woman he trusted. I sent Artie running with that book so it'd surface somewhere clean. Somewhere like your hands.",
      ],
      ["hero", "And Toranno killed him before you could collect."],
      [
        "npc",
        "Vince got impatient. Men do. But you — you're a patient man. Give me the book and we cut this city down the middle and vanish into the rain.",
      ],
      ["hero", "Half the leverage. And you."],
      {
        who: "npc",
        text: "All of me. You only have to forget which lies were mine.",
        npc: { x: 740, y: 650, facing: "l" },
      },
      {
        choice: [
          {
            text: '"I won\'t play the sap for you, angel."',
            set: { vera: "turn_in" },
            do: function () {
              Nooir.theEnd(
                "The book goes to the one honest desk left in town",
                "Brandt and Toranno make the morning edition. The city stays exactly as dirty as it was — and you keep your license and your spine, and lose the girl, and a piece of yourself." +
                  _dotBeat("hard"),
              );
            },
          },
          {
            text: '"...Get in the car."',
            set: { vera: "let_go" },
            do: function () {
              Nooir.theEnd(
                "The book goes into the harbor",
                "Nobody hangs. Nobody's clean. You tell yourself it was mercy. Vera disappears into the rain on your arm." +
                  _dotBeat("bleak"),
              );
            },
          },
        ],
      },
    ]
  : [
      [
        "npc",
        "You came up to a rooftop in the rain with empty hands, detective?",
      ],
      ["hero", "I came to talk."],
      [
        "npc",
        "Talk's cheap. Bring me what Finch was carrying, and we'll have something to say to each other.",
      ],
    ];

var cast = [
  {
    name: "woman",
    label: "Vera",
    x: 860,
    y: 600,
    facing: "r",
    dialog: _veraDialog,
  },
];
var objBlocks = [],
  actionZones = [],
  exitTo = 0, //  the finale — no way forward
  backTo = 16, // ← the stairway down
  npcPlacements = [{"npc":"Vera","x":1172,"y":757}],
  startingY = 515,
  startingFacing = "f",
  exits = [{"to":16,"cx":203,"cy":494},{"to":16,"cx":1299,"cy":570},{"to":15,"cx":1279,"cy":686}],
  scene = 8;
