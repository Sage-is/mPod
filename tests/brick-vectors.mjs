import { BrickGame, STEER } from "../src/brick.js";

const vectors = [[0, 0, 5.52], [3, 7, 20.2], [4, 6, 24.84], [6, 4, 16.92], [9, 5, 14.12], [10, 4, 13.88]];
let bad = 0;
for (const [n, score, secs] of vectors) {
  const g = new BrickGame();
  for (let i = 0; i < n; i++) g.movePaddle(-STEER);
  g.select();
  let ms = 0, guard = 0;
  while (!g.over && guard++ < 1e6) { ms += g.tickMs; g.tick(); }
  const ok = g.score === score && Math.abs(ms / 1000 - secs) < 0.05;
  if (!ok) bad++;
  console.log(`n=${n} score=${g.score} (want ${score}) time=${(ms / 1000).toFixed(2)} (want ${secs}) ${ok ? "ok" : "FAIL"}`);
}
process.exit(bad ? 1 : 0);
