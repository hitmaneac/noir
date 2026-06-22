/* THE GREEN BOOK — Pier 7. Click Finch's body to examine it; the green book —
 * the MacGuffin — is sewn into the coat lining. (Moved here from the transitional
 * waterfront so it lands on the deep-perspective dock where the body lies.) */

Nooir.addObject({
  id: "finchbody",
  image: "objects/body.png",
  size: { w: 350, h: 126 },
  x: 640,
  y: 716,
  z: 700, // dock objBlock is 698, so this draws in front but is still clickable
  takeable: false, // a body isn't pocket-sized
  anim: "pickup", // Elias crouches over it
  onInteract: function () {
    if (Nooir.hasItem("greenbook")) {
      Nooir.flashMsg("Nothing left to learn from a dead man.", 1600);
      return;
    }
    Nooir.shake(500);
    Nooir.flashMsg(
      "Arthur Finch. Eight days of river on him. Something stiff sewn into the coat...",
      2800,
    );
    Nooir.addObject({
      id: "greenbook",
      image: "objects/greenbook.png",
      size: { w: 46, h: 58 },
      x: 850, // clear of the body's footprint (≈x515-765) and nearer, so it
      y: 736, // draws in front (higher z) and stays clickable
      takeable: true,
      anim: "grab",
      onInteract: function () {
        Nooir.flashMsg(
          "A little green ledger. Every dirty dollar, a name beside it. Now everyone in this town will want me dead.",
          3200,
        );
      },
    });
  },
});
