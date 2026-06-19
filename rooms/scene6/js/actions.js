/* THE GREEN BOOK — Act II: the precinct. Brandt's open case file.
 * Examine it (click / Enter near the desk) to clock the frame taking shape. */

Nooir.actions.casefile = function (z) {
  if (Nooir.getFlag("sawFile")) {
    Nooir.flashMsg("Finch's file. My name's still penciled in the margin. Still doesn't get better.", 2200);
    return;
  }
  Nooir.setFlag("sawFile", true);
  Nooir.playCharAnim("grab");
  Nooir.flashMsg(
    "Finch's case file — already typed, already closed. And there, penciled in the margin: a name. Mine.",
    3000,
  );
};
