import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import { ageWorld } from "../src/engine/lifecycle";
import { RNG } from "../src/engine/random";
import { setPlayerOverall } from "../src/engine/ratings";
import { emptyStats } from "../src/engine/types";

test("full season awards and the Cup starter outweigh temporary form and ageing", () => {
  const g = newGame("CAR", 410);
  const season = g.year++;
  const find = (name: string) =>
    g.teams.flatMap((t) => t.players).find((p) => p.name === name)!;
  const goalie = find("Pyotr Kochetkov"),
    ross = find("Nathan MacKinnon"),
    mvp = find("Sebastian Aho");
  g.history.push({ year: season, champion: "CAR", points: 110 });
  goalie.stats.wins = 16;
  g.awards = (
    [
      ["art-ross", ross, "COL"],
      ["conn-smythe", mvp, "CAR"],
    ] as const
  ).map(([key, p, team]) => ({
    year: season,
    key,
    team,
    playerId: p.id,
    player: p.name,
    pos: p.pos,
    line: "",
  }));
  const before = [goalie, ross, mvp].map((p) => {
    p.history.push({
      year: season,
      ovr: p.ovr + 1,
      stats: { ...emptyStats(), gp: 75 },
    });
    p.age = 35;
    p.formAdjustment = 2;
    p.performanceForm = -40;
    return p.ovr;
  });
  ageWorld(g, new RNG(4));
  for (const [i, p] of [goalie, ross, mvp].entries()) {
    assert(p.ovr >= before[i] + 1, p.name);
    assert.match(
      p.developmentLog![0].reason,
      [/Кубка/, /Art Ross/, /Conn Smythe/][i],
    );
  }
});

test("young regulars grow, young leaders grow faster and a lost season costs ability", () => {
  const g = newGame("TOR", 111),
    team = g.teams.find((t) => t.id === "TOR")!;
  const season = g.year++;
  team.record.gp = 84;
  const [star, regular, injured, poor, veteran] = team.players
    .filter((p) => p.pos !== "G" && p.pos !== "D")
    .slice(0, 5);
  for (const p of [star, regular, injured, poor, veteran]) {
    p.age = p === veteran ? 38 : 21;
    setPlayerOverall(p, 75);
    p.potential = 84;
    p.injury = 0;
    const s = { ...emptyStats(), gp: 70, toi: 980, rated: 70, ratingSum: 470 };
    if (p === star) {
      s.g = 37;
      s.a = 45;
      s.toi = 1500;
    }
    if (p === injured) {
      s.gp = 8;
      s.toi = 45;
      p.injuryBurden = 50;
    }
    if (p === poor) {
      s.ratingSum = 415;
      p.formAdjustment = -2;
    }
    p.history.push({ year: season, ovr: 75, stats: s });
  }
  ageWorld(g, new RNG(12));
  assert(star.ovr > regular.ovr && regular.ovr > 75);
  assert(injured.ovr <= 73 && poor.ovr < 75 && veteran.ovr < 75);
});
