import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import { lineChemistry, tacticalAssessment } from "../src/engine/tactics";
test("line chemistry responds to mental attributes, fatigue and role diversity", () => {
  const line = newGame()
    .teams[0].players.filter((p) => p.pos !== "G")
    .slice(0, 3);
  const baseline = lineChemistry(line);
  for (const p of line) {
    p.attributes.teamwork = 99;
    p.attributes.decisions = 99;
    p.attributes.consistency = 99;
    p.fatigue = 0;
  }
  assert(lineChemistry(line) > baseline);
  const fresh = lineChemistry(line);
  line.forEach((p) => (p.fatigue = 90));
  assert(lineChemistry(line) < fresh);
});
test("tactical assessment exposes actual tradeoffs", () => {
  const aggressive = tacticalAssessment({
    forecheck: "2-1-2",
    pace: 90,
    physical: 90,
    shooting: 90,
  });
  const conservative = tacticalAssessment({
    forecheck: "1-3-1",
    pace: 30,
    physical: 20,
    shooting: 30,
  });
  assert(aggressive.possession > conservative.possession);
  assert(aggressive.chanceVolume > conservative.chanceVolume);
  assert(aggressive.penaltyRisk > conservative.penaltyRisk);
  assert(aggressive.defensiveStability < conservative.defensiveStability);
});
