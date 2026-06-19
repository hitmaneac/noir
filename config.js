var mainlevel = 4; // the game opens in Elias's office (Act I)

// Dev tools (the top toolbar + the collision/placement editor) show only in dev.
// Auto-detects: on by default on localhost / 127.0.0.1 / file://, off everywhere
// else (e.g. skalamax.si). Set `dev = true`/`false` here to force it.
var dev = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|)$/.test(
  location.hostname,
);
