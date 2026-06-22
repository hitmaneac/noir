/* THE GREEN BOOK — Act II: inside the club (The Blue Room), main floor.
 * A doorman guards the side door to Toranno's back room. The green exit
 * (→ scene7) is vetoed here until the player talks their way past him — each
 * doorman dialog choice (see settings.js cast) calls Nooir.passDoorman(),
 * which lifts the veto. The `pastDoorman` flag persists, so once you're in,
 * the door stays open for the rest of the run. */

var lastNudge = 0; // throttles the "talk to me first" nudge (checkExit is per-frame)

// Hold the back-room door shut until the doorman waves Elias through.
window.exitGate = function (dest) {
  if (dest === 7 && !Nooir.getFlag("pastDoorman")) {
    var now = Date.now();
    if (now - lastNudge > 2600) {
      lastNudge = now;
      Nooir.flashMsg(
        'The doorman steps into the gap. "Invitation only, friend. Talk to me first."',
        2400,
      );
    }
    return false; // blocked
  }
  return true;
};

// Called from each doorman dialog choice — clears the veto so the door opens.
Nooir.passDoorman = function () {
  if (Nooir.getFlag("pastDoorman")) return;
  Nooir.setFlag("pastDoorman", true);
  Nooir.flashMsg(
    "He steps off the door and tips his head at the back room. The way's open.",
    2600,
  );
};
