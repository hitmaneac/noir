/* THE GREEN BOOK — Act II: Toranno's club back room. The reservations book.
 * A small thing on the booth table that says more than Toranno means it to. */

Nooir.actions.ledgerbook = function (z) {
  if (Nooir.getFlag("sawClubBook")) {
    Nooir.flashMsg("Same page, same name. Vera Lange — a standing table, every Thursday. On Toranno's tab.", 2400);
    return;
  }
  Nooir.setFlag("sawClubBook", true);
  Nooir.playCharAnim("grab");
  Nooir.flashMsg(
    "The club's reservation book. One name keeps a standing table — Thursdays, on the house: Vera Lange. No man's sister.",
    3200,
  );
};
