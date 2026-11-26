import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newGame } from "../src/engine/database";
import { ensureManagementState } from "../src/engine/management";
import type { Result } from "../src/engine/types";
import LeagueNews from "../src/ui/LeagueNews";

test("the lead story reports the actual away winner, shootout, shots and trade dispatch", () => {
  const game = newGame("TOR", 349);
  ensureManagementState(game);
  game.language = "ru";
  const fixture = game.schedule[0];
  fixture.result = {
    home: fixture.home,
    away: fixture.away,
    date: "2026-10-07",
    goals: [2, 3],
    shots: [24, 30],
    ot: true,
    so: true,
    events: [],
    duration: 3900,
    xg: [2, 2],
    pp: [0, 0],
    ppo: [0, 0],
  } satisfies Result;
  game.transactions = [{ year: 2026, round: 0, message: "TOR ⇄ BOS" }];
  const html = renderToStaticMarkup(createElement(LeagueNews, { game }));
  assert.ok(
    html.includes(
      fixture.away + " обыгрывает " + fixture.home + " по буллитам",
    ),
  );
  assert.ok(html.includes("3 : 2"));
  assert.ok(html.includes("TOR ⇄ BOS"));
});

import { advanceDay } from "../src/engine/management";
import { mediaFeed } from "../src/engine/media";
import { validateSave } from "../src/engine/saves";

test("a calendar career produces dated coverage across preseason, the regular season and the Cup final", () => {
  const g = newGame("TOR", 349);
  ensureManagementState(g);
  const opening = mediaFeed(g);
  assert.ok(opening.some((x) => x.beat === "market"));
  assert.ok(
    opening.some((x) => x.beat === "interview" && x.question && x.quote),
  );
  assert.ok(opening.some((x) => x.clubs.includes(g.user)));
  const initialYear = g.year;
  for (let day = 0; day < 380 && g.phase !== "offseason"; day++) advanceDay(g);
  assert.equal(g.phase, "offseason");
  const stories = g.mediaArchive!;
  const dates = new Set(stories.map((x) => x.date));
  const months = new Set(stories.map((x) => x.date.slice(0, 7)));
  assert.ok(dates.size > 150);
  assert.ok(months.size >= 7);
  assert.equal(new Set(stories.map((x) => x.id)).size, stories.length);
  assert.ok(
    stories.some((x) => x.clubs.length === 2 && x.beat === "interview"),
  );
  assert.ok(stories.some((x) => x.subject === "award/conn-smythe"));
  const champion = g.history.find((h) => h.year === initialYear)!.champion;
  assert.ok(
    stories.some((x) => x.headline[1] === champion + " lifts the Stanley Cup"),
  );
  assert.deepEqual(
    validateSave(JSON.parse(JSON.stringify(g))).mediaArchive,
    stories,
  );
  console.log(
    "Season coverage:",
    stories.length,
    "stories;",
    dates.size,
    "publication days;",
    months.size,
    "months;",
    new Set(stories.flatMap((s) => s.clubs)).size,
    "clubs.",
  );
});
