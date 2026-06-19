/* THE GREEN BOOK — Act I: Vesper Street. The pawn-ticket puzzle.
 * Pick up the pawn ticket in Elias's office first; here it opens locker 0413. */

Nooir.actions.finchdoor = function (z) {
  Nooir.flashMsg(
    "Number 9 — Finch's room. Lock's jimmied, door hanging open. Somebody tossed it before I got here.",
    2600,
  );
};

Nooir.actions.lockers = function (z) {
  if (!Nooir.hasItem("ticket")) {
    Nooir.flashMsg("These lockers want a ticket. The kind a careful man keeps on him.", 2200);
    return;
  }
  if (Nooir.hasItem("matchbook")) {
    Nooir.flashMsg("Empty now. I've got what Finch left behind.", 1600);
    return;
  }
  // redeem ticket 0413 — Finch's last effects appear to pick up
  Nooir.flashMsg("Locker 0413 swings open. Finch travelled light — a matchbook, and a note.", 2400);
  Nooir.addObject({
    id: "matchbook",
    image: "objects/matchbook.png",
    size: { w: 42, h: 32 },
    x: (z.cx || 720) + 20,
    y: (z.cy || 655) + 40,
    takeable: true,
    anim: "pickup",
    onInteract: function () {
      Nooir.flashMsg("A matchbook — THE BLUE ROOM. And Finch's scrawl on the flap: 'Pier 7. Midnight.'", 2800);
    },
  });
};
