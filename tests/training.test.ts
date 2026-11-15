import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import {
  ensureTrainingSchedule,
  readiness,
  trainTeam,
  trainingLoad,
} from "../src/engine/training";

test("weekly schedules balance demanding sessions against recovery and rest", () => {
  const recovery = newGame().teams[0];
  const intense = structuredClone(recovery);
  const recoverySchedule = ensureTrainingSchedule(recovery);
  recoverySchedule.intensity = "low";
  recoverySchedule.days = recoverySchedule.days.map(() => ({
    morning: "recovery",
    afternoon: "rest",
  }));
  const intenseSchedule = ensureTrainingSchedule(intense);
  intenseSchedule.intensity = "high";
  intenseSchedule.days = intenseSchedule.days.map(() => ({
    morning: "conditioning",
    afternoon: "skills",
  }));
  recovery.players.forEach((player) => (player.fatigue = 50));
  intense.players.forEach((player) => (player.fatigue = 50));
  trainTeam(recovery);
  trainTeam(intense);
  assert(recovery.players[0].fatigue < intense.players[0].fatigue);
  assert(trainingLoad(recovery) < trainingLoad(intense));
});

test("profile sessions develop relevant skills while injuries prevent development", () => {
  const team = newGame().teams[0];
  const schedule = ensureTrainingSchedule(team);
  schedule.days = schedule.days.map(() => ({
    morning: "offense",
    afternoon: "skills",
  }));
  const player = team.players.find((item) => item.pos !== "G")!;
  player.age = 20;
  player.potential = 100;
  player.attributes.accuracy = 60;
  for (let index = 0; index < 5; index++) trainTeam(team);
  assert.equal(player.attributes.accuracy, 60);
  trainTeam(team);
  assert.equal(player.attributes.accuracy, 61);
  player.injury = 20;
  for (let index = 0; index < 6; index++) trainTeam(team);
  assert.equal(player.attributes.accuracy, 61);
  assert(
    readiness(team).injured.some((item) => item.id === player.id) ||
      !team.lines.flat().includes(player.id),
  );
});
