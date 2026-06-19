/* THE GREEN BOOK — Act III: THE FRAME (a holding cell). See /story.md.
 * Brandt pins Finch's murder on Elias; Dot comes to spring him and offers to
 * run the book to the clean DA — but it puts HER in danger. The CHOICE sets
 * `protectedDot`, which colors Dot's final beat in both endings (scene8). */
var backgroundSize = 1300, // px
  startingPoint = 300, // Elias, in the cell
  farHeight = 304, // character height at the back of the room
  nearHeight = 474, // character height at the near edge
  cloudSpeed = 0, // interior
  character = "hatguy",
  heroName = "Elias",
  cast = [
    // Capt. Brandt — springs the frame.
    {
      name: "cop",
      label: "Brandt",
      x: 900,
      y: 620,
      facing: "l",
      dialog: [
        ["npc", "Comfortable, Mores? Get used to it."],
        ["hero", "On what charge?"],
        ["npc", "Arthur Finch. Funny thing — his blood turned up on a coat in your office. Imagine that."],
        ["hero", "You put it there."],
        ["npc", "I put a lot of things where they belong. You'll hang for Finch, and the book burns with you. Sleep tight."],
      ],
    },
    // Dot — the rescue + the choice that decides who carries the risk.
    {
      name: "secretary",
      label: "Dot",
      x: 420,
      y: 640,
      facing: "r",
      dialog: [
        ["npc", "Mr. Mores. You look terrible. I brought coffee and a lawyer who owes me a favor."],
        ["hero", "Dot — how did you even get back here?"],
        ["npc", "I kept the green book. It's somewhere Brandt would never think to look — my mother's hatbox."],
        ["npc", "I can walk it to the one clean DA left in this town. But if Brandt's people make me, I'm the next coat they find blood on."],
        { choice: [
          { text: "Do it. I need somebody I trust on the outside.",
            set: { protectedDot: false },
            then: [
              ["hero", "Do it. I need somebody out there I can trust."],
              ["npc", "...Then I'd better not get caught. See you on the far side of this, Mr. Mores."],
              ["hero", "(An hour later, Quist's own lawyer walks you out the front door. The book is moving — and so is Dot.)"],
            ] },
          { text: "No. Give me the hatbox — keep your name out of it.",
            set: { protectedDot: true },
            then: [
              ["hero", "No. Give me the hatbox. You were never here."],
              ["npc", "Stubborn man. Fine — but you walk out owing me, and I always collect."],
              ["hero", "(You take the weight yourself. Dot goes home. The book stays with you — and so does the danger.)"],
            ] },
        ] },
      ],
    },
  ],
  objBlocks = [],
  actionZones = [],
  exitTo = 16, // → the stairway up to the rooftop (the finale)
  backTo = 15, // ← the hallway / holding cells
  scene = 9;
