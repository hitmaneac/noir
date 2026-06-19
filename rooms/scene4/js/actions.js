/* THE GREEN BOOK — Act I, Elias's office. Action handlers + world objects. */

// Vera left these on the desk. Click (or Enter when near) to pick them up.
Nooir.addObject({
  id: "photo",
  image: "objects/photo.png",
  size: { w: 44, h: 54 },
  x: 540,
  y: 722,
  takeable: true,
  anim: "pickup",
  onInteract: function () {
    Nooir.flashMsg("Arthur Finch. Younger here. Before the counting.", 1700);
  },
});

Nooir.addObject({
  id: "ticket",
  image: "objects/ticket.png",
  size: { w: 56, h: 34 },
  x: 700,
  y: 726,
  takeable: true,
  anim: "pickup",
  onInteract: function () {
    Nooir.flashMsg("A pawn ticket. Eastside Loans — No. 0413.", 1700);
  },
});
