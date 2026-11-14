import test from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import { ensureDraft } from "../src/engine/draft";
import { callUpFromFarm } from "../src/engine/roster";
import {
  contactInternationalPlayer,
  resolveInternationalOffers,
  scoutInternationalPlayer,
  submitInternationalOffer,
} from "../src/engine/international";

test("real injury snapshot moves matching NHL players to the infirmary with return dates", () => {
  const game = newGame("FLA", 260027);
  const players = game.teams.flatMap((t) => [...t.players, ...(t.farm ?? [])]);
  const barkov = players.find((p) => p.name === "Aleksander Barkov")!;
  assert.equal(barkov.injurySource, "puckpedia");
  assert.equal(barkov.injuryReason, "Knee");
  assert.equal(barkov.injuryReturnDate, "2026-11-27");
  assert.ok(barkov.injury > 0);
  assert.ok(players.filter((p) => p.injurySource === "puckpedia").length >= 80);
});

test("all NHL organizations receive an official AHL affiliate and OHL pool", () => {
  const game = newGame("NYI", 91);
  assert.equal(game.teams.filter((t) => t.ahlAffiliate).length, 32);
  assert.ok(
    game.teams.every((t) => (t.farm ?? []).some((p) => p.league === "AHL")),
  );
  assert.equal(game.juniorPlayers?.length, 487);
  assert.ok(game.juniorPlayers!.every((p) => p.league === "OHL"));
  const ahlOnly = game.teams
    .find((t) => t.id === "NYI")!
    .farm!.find((p) => p.contractType === "AHL")!;
  assert.throws(() => callUpFromFarm(game, ahlOnly.id), /контракт AHL/);
});

test("international signing requires scouting, agent contact and delayed multi-factor decision", () => {
  const game = newGame("CAR", 121);
  ensureDraft(game);
  game.rules.cap = 300;
  const candidate = game.internationalMarket!.find(
    (x) => x.transferStatus === "free",
  )!;
  assert.throws(
    () => contactInternationalPlayer(game, candidate.player.id),
    /скаутинг/,
  );
  scoutInternationalPlayer(game, candidate.player.id);
  contactInternationalPlayer(game, candidate.player.id);
  const offer = submitInternationalOffer(game, candidate.player.id, {
    salary: Math.max(3, candidate.desiredSalary * 1.3),
    years: candidate.desiredYears,
    signingBonus: 1,
    role: "top-six",
    developmentPlan: true,
    transferFee: 2,
  });
  assert.equal(offer.status, "pending");
  assert.equal(offer.decisionRound, game.round + 2);
  resolveInternationalOffers(game);
  assert.equal(offer.status, "pending");
  game.round = offer.decisionRound;
  resolveInternationalOffers(game);
  assert.equal(offer.status, "accepted");
  assert.ok(
    game.teams
      .find((t) => t.id === "CAR")!
      .players.some((p) => p.id === candidate.player.id),
  );
});
