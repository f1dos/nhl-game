import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import {
  ensureDraft,
  makeUserDraftPick,
  openDraft,
  scoutProspect,
  setScoutingRegion,
} from "../src/engine/draft";
import { nextSeason } from "../src/engine/season";
import { validateSave } from "../src/engine/saves";

test("scouting reports improve without exposing exact potential", () => {
  const g = newGame("SJS", 991);
  const draft = ensureDraft(g);
  assert.equal(draft.prospects.length, 224);
  const target = draft.prospects.find(
    (prospect) => prospect.region === "Nordic",
  )!;
  const before = draft.reports[target.player.id];
  setScoutingRegion(g, "Nordic");
  scoutProspect(g, target.player.id);
  const after = draft.reports[target.player.id];
  assert(after.confidence > before.confidence);
  assert(
    Math.abs(after.estimatedPotential - target.player.potential) <=
      Math.abs(before.estimatedPotential - target.player.potential),
  );
  assert.equal(draft.scoutingPoints, 7);
});

test("draft lottery, AI selections and seven user picks transfer prospect rights", () => {
  const g = newGame("SJS", 773);
  const draft = ensureDraft(g);
  g.teams.forEach((team, index) => {
    team.record.pts = index * 3;
  });
  openDraft(g);
  assert.equal(draft.picks.length, 224);
  assert.equal(draft.status, "draft");
  while (draft.status === "draft") {
    assert.equal(draft.picks[draft.currentPick].team, g.user);
    const target = draft.prospects
      .filter((prospect) => !prospect.draftedBy)
      .sort((a, b) => a.trueRank - b.trueRank)[0];
    makeUserDraftPick(g, target.player.id);
  }
  assert.equal(draft.picks.filter((pick) => pick.team === g.user).length, 7);
  assert.equal(
    g.teams.find((team) => team.id === g.user)!.prospects!.length,
    7,
  );
  assert.equal(new Set(draft.picks.map((pick) => pick.prospectId)).size, 224);
});

test("season rollover auto-completes draft, archives it and prepares next class", () => {
  const g = newGame("TOR", 448);
  ensureDraft(g).shortlist.push(ensureDraft(g).prospects[20].player.id);
  g.phase = "offseason";
  nextSeason(g);
  assert.equal(g.year, 2027);
  assert.equal(g.draft?.year, 2028);
  assert.equal(g.draft?.status, "scouting");
  assert.equal(g.draftHistory?.[0].picks.length, 224);
  assert.equal(
    g.teams
      .flatMap((team) => [...team.players, ...(team.prospects ?? [])])
      .filter((player) => player.id.startsWith("draft-2027-")).length,
    224,
  );
  assert(validateSave(JSON.parse(JSON.stringify(g))));
});
