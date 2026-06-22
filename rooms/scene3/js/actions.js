/* THE GREEN BOOK — Act II: Quist's law office.
 * The "letter" is Quist's bribe — a fat unmarked envelope squared up on the
 * desk blotter, under the banker's lamp. Examining it reads differently once
 * Elias has made the call (the dialog choice sets the `tookBribe` flag):
 *   undefined → not yet decided   true → he pocketed it   false → he walked. */

Nooir.actions.letter = function (z) {
  var took = Nooir.getFlag("tookBribe");

  if (took === true) {
    // he took it — it's riding in his coat now, not on the desk
    Nooir.flashMsg(
      "The envelope's in my coat now, heavy against the ribs the way a thing gets " +
        "heavy once it's already costing you. I don't look at it. I know what it weighs.",
      3200,
    );
    return;
  }

  Nooir.playCharAnim("grab"); // lean into the lamplight over the blotter

  if (took === false) {
    // he refused — it sits there cold, and they both know it
    Nooir.flashMsg(
      "Still squared on the blotter where Quist slid it. A month's rent in cold paper, " +
        "and not one bill of it mine. Leaving it there cost more than taking it would have.",
      3200,
    );
    return;
  }

  // hasn't decided yet — the bribe, examined before the choice
  Nooir.flashMsg(
    "A fat envelope, unmarked, squared up in the lamplight. No name, no seal — the kind " +
      "you're meant to understand without being told. I can almost hear the bills inside breathing.",
    3400,
  );
};
