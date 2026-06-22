/* THE GREEN BOOK — Act I, Elias's office. Action handlers + world objects. */

// Vera left these on the desk. Click (or Enter when near) to pick them up.
Nooir.addObject({
  id: "photo",
  image: "objects/photo.png",
  size: { w: 44, h: 54 },
  x: 680,
  y: 500,
  z: 702, // drawn in front of the desk objBlock (bottomY 698), not behind it
  takeable: true,
  anim: "pickup",
  onInteract: function () {
    Nooir.flashMsg("Arthur Finch. Younger here. Before the counting.", 1700);
  },
});

Nooir.addObject({
  id: "ticket",
  image: "objects/pawnticket_small.png",
  size: { w: 90, h: 56 },
  x: 620,
  y: 520, // up on the desk surface…
  z: 702, // …but drawn in front of the desk objBlock (bottomY 698), not behind it
  takeable: true,
  anim: "pickup",
  onInteract: function () {
    Nooir.flashMsg("A pawn ticket. Eastside Loans — No. 0413.", 1700);
  },
});
