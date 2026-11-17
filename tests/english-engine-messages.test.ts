import assert from "node:assert/strict";
import test from "node:test";
import { newGame } from "../src/engine/database";
import { ensureDraft, setScoutingRegion } from "../src/engine/draft";
import {
  advanceDay,
  advisorRecommendations,
  ensureManagementState,
  selectFranchiseStrategy,
} from "../src/engine/management";
import {
  localizeObjective,
  reviewSeasonStrategy,
  strategyPolicy,
} from "../src/engine/strategy";
import { evaluateTrade } from "../src/engine/trades";
import { prepareAnnualDevelopment } from "../src/engine/performance";
import { externalContactEligibility } from "../src/engine/conversations";
import {
  contactInternationalPlayer,
  scoutInternationalPlayer,
} from "../src/engine/international";
import { tx } from "../src/engine/text";
import { translateEnglish } from "../src/i18n/englishMatch";
import type { Game } from "../src/engine/types";

const cyrillic = /[А-Яа-яЁё]/;

function career(language: "en" | "ru", days = 70) {
  const g = newGame("TOR", 777, language);
  ensureDraft(g);
  ensureManagementState(g);
  selectFranchiseStrategy(g, "draft-lottery");
  for (let day = 0; day < days; day++) advanceDay(g);
  return g;
}

function generatedTexts(g: Game) {
  return [
    ...g.news,
    ...g.events!.flatMap((event) => [event.title, event.body]),
    ...(g.transactions ?? []).map((item) => item.message),
    ...(g.franchiseObjectives ?? []).flatMap((item) => [
      item.title,
      item.detail,
    ]),
    ...advisorRecommendations(g).flatMap((item) => [item.title, item.detail]),
    ...Object.values(g.fans ?? {}).map((fan) => fan.lastChange),
    ...Object.values(g.teamNeeds ?? {}).flatMap((needs) =>
      needs.map((need) => need.reason),
    ),
  ];
}

test("tx picks English for non-Russian careers and Russian for old saves", () => {
  assert.equal(tx({ language: "en" }, "Привет", "Hello"), "Hello");
  assert.equal(tx({ language: "de" }, "Привет", "Hello"), "Hello");
  assert.equal(tx({ language: "ru" }, "Привет", "Hello"), "Привет");
  assert.equal(tx({}, "Привет", "Hello"), "Привет");
});

test("an English career generates news, inbox, objectives and AI moves in English", () => {
  const g = career("en");
  reviewSeasonStrategy(g);
  setScoutingRegion(g, "Nordic");
  const texts = generatedTexts(g);
  assert(texts.length > 60, "the career produced plenty of generated text");
  const russian = texts.filter((text) => cyrillic.test(text));
  assert.deepEqual(russian, []);
  assert(
    g.events!.some((event) => event.title === "Approve the franchise strategy"),
  );
  assert(
    g.news.some((item) =>
      item.startsWith("Club strategy approved: Draft Lottery Team"),
    ),
  );
});

test("the same career in Russian keeps its Russian messages", () => {
  const g = career("ru", 20);
  assert(
    g.events!.some((event) => event.title === "Утвердите стратегию франшизы"),
  );
  assert(
    g.news.some((item) =>
      item.startsWith("Стратегия клуба утверждена: draft-lottery"),
    ),
  );
  assert(generatedTexts(g).filter((text) => cyrillic.test(text)).length > 20);
});

test("errors, policies, development reasons and trade replies follow the language", () => {
  const en = career("en", 1);
  const ru = career("ru", 1);
  assert.doesNotMatch(
    Object.values(strategyPolicy("stanley-cup", "en")).join(" "),
    cyrillic,
  );
  assert.match(strategyPolicy("stanley-cup", "ru").roster, cyrillic);
  const other = en.teams.find((team) => team.id !== en.user)!.id;
  assert.equal(evaluateTrade(en, other, [], []).reason, "Invalid assets");
  assert.equal(evaluateTrade(ru, other, [], []).reason, "Некорректные активы");
  const player = en.teams[0].players[0];
  player.injuryBurden = 60;
  assert.doesNotMatch(prepareAnnualDevelopment(player, "en").reason, cyrillic);
  assert.match(prepareAnnualDevelopment(player, "ru").reason, /травмы/);
  const foreign = en.teams.find((team) => team.id !== en.user)!.players[0];
  assert.doesNotMatch(
    externalContactEligibility(en, foreign.id).reason,
    cyrillic,
  );
  const prospect = en.internationalMarket?.[0];
  if (prospect) {
    en.draft!.scoutingPoints = 0;
    assert.throws(
      () => scoutInternationalPlayer(en, prospect.player.id),
      /You need 4 international scouting points/,
    );
    prospect.scouted = 0;
    prospect.transferStatus = "free";
    assert.throws(
      () => contactInternationalPlayer(en, prospect.player.id),
      /Raise international scouting/,
    );
  }
});

test("objectives stored in either language are shown in the current one", () => {
  const ru = career("ru", 1);
  for (const objective of ru.franchiseObjectives!) {
    const english = localizeObjective(objective, "en");
    assert.doesNotMatch(`${english.title} ${english.detail}`, cyrillic);
    assert.deepEqual(localizeObjective(english, "ru"), {
      title: objective.title,
      detail: objective.detail,
    });
  }
});

test("Russian messages stored by older saves are translated in English mode", () => {
  const ru = career("ru", 70);
  // Objectives are rendered through localizeObjective (tested above).
  ru.franchiseObjectives = [];
  const texts = generatedTexts(ru).filter((text) => cyrillic.test(text));
  const untranslated = texts.filter((text) =>
    cyrillic.test(translateEnglish(text)),
  );
  assert.deepEqual(untranslated, []);
});
