import { RULES } from "./rules";
import { RNG, clamp } from "./random";
import type { Team, Player, Result, Event } from "./types";
export function simulateMatch(
  home: Team,
  away: Team,
  r: RNG,
  playoffs = false,
): Result {
  const teams = [home, away];
  const res: Result = {
    home: home.id,
    away: away.id,
    goals: [0, 0],
    shots: [0, 0],
    xg: [0, 0],
    pp: [0, 0],
    ppo: [0, 0],
    ot: false,
    so: false,
    duration: RULES.regulationSeconds,
    events: [],
  };
  const penalty = [0, 0];
  const active = teams.map((t) =>
    [...new Set([...t.lines.flat(), ...t.defense.flat(), t.goalie])]
      .map((id) => t.players.find((p) => p.id === id)!)
      .filter(Boolean),
  );
  const goalies = teams.map(
    (t, i) =>
      active[i].find((p) => p.pos === "G") ||
      t.players.find((p) => p.pos === "G")!,
  );
  active.forEach((ps) =>
    ps.forEach((p) => {
      p.stats.gp++;
    }),
  );
  const emit = (
    time: number,
    type: Event["type"],
    side: number,
    p: Player,
    text: string,
    xg?: number,
  ) =>
    res.events.push({
      time,
      type,
      team: teams[side].id,
      player: p.name,
      text,
      x: side === 0 ? r.int(52, 90) : r.int(10, 48),
      y: r.int(18, 82),
      score: [...res.goals],
      xg,
    });
  function onIce(i: number, time: number) {
    const t = teams[i],
      line = Math.floor(time / 45) % 10;
    const li = [0, 1, 0, 2, 1, 3, 0, 1, 2, 3][line];
    return [...t.lines[li], ...t.defense[Math.floor(time / 45) % 3]]
      .map((id) => t.players.find((p) => p.id === id)!)
      .filter(Boolean);
  }
  function effective(p: Player, a: string) {
    return (
      p.attributes[a] *
      (1 - p.fatigue * 0.002) *
      (p.injury ? 0.8 : 1) *
      (0.92 + p.morale * 0.001)
    );
  }
  const avg = (ps: Player[], a: string) =>
    ps.reduce((s, p) => s + effective(p, a), 0) / Math.max(1, ps.length);
  function step(time: number, dt = 20) {
    const ice = [onIce(0, time), onIce(1, time)];
    ice.forEach((ps) => ps.forEach((p) => (p.stats.toi += dt / 60)));
    goalies.forEach((p) => (p.stats.toi += dt / 60));
    const control = teams.map(
      (t, i) =>
        avg(ice[i], "passing") +
        avg(ice[i], "speed") * 0.25 +
        (t.tactics.forecheck === "2-1-2"
          ? 4
          : t.tactics.forecheck === "1-3-1"
            ? -3
            : 0) +
        (penalty[1 - i] > time ? 15 : 0),
    );
    const side =
      r.next() < clamp(0.515 + (control[0] - control[1]) * 0.004, 0.3, 0.7)
        ? 0
        : 1;
    const other = 1 - side;
    const t = teams[side];
    const p = r.pick(ice[side]);
    const roll = r.next();
    if (
      roll <
        RULES.basePenaltyProbability + (t.tactics.physical - 50) * 0.00012 &&
      penalty[side] <= time
    ) {
      penalty[side] = time + RULES.minorPenaltySeconds;
      p.stats.pim += 2;
      res.ppo[other]++;
      emit(time, "penalty", side, p, "2 минуты / 2 minutes");
      return;
    }
    if (roll < 0.027) {
      p.injury = r.int(1, 4);
      emit(time, "injury", side, p, "Повреждение / Injury");
      return;
    }
    if (roll < 0.1) {
      emit(time, "hit", side, p, "Силовой приём / Hit");
      return;
    }
    if (roll < 0.17) {
      emit(time, "turnover", side, p, "Перехват / Takeaway");
      return;
    }
    if (roll < 0.22) {
      emit(time, "faceoff", side, p, "Вбрасывание / Faceoff");
      return;
    }
    if (
      roll >
      RULES.baseShotThreshold +
        (t.tactics.shooting - 50) * 0.001 +
        (t.tactics.pace - 50) * 0.0005
    )
      return;
    const pp = penalty[other] > time && penalty[side] <= time;
    const goalie = goalies[other];
    const defense = avg(ice[other], "defensivePosition");
    const chemistry = avg(ice[side], "teamwork");
    const xg = clamp(
      RULES.baseExpectedGoal +
        (effective(p, "accuracy") - 75) * 0.0016 +
        (avg(ice[side], "passing") - defense) * 0.0012 +
        (chemistry - 75) * 0.0004 +
        (pp ? RULES.powerPlayExpectedGoalBonus : 0) +
        (teams[other].tactics.forecheck === "2-1-2" ? 0.009 : 0) -
        (teams[other].tactics.forecheck === "1-3-1" ? 0.006 : 0),
      0.025,
      0.24,
    );
    const chance = clamp(
      xg + (75 - effective(goalie, "reflexes")) * 0.0015,
      0.018,
      0.28,
    );
    res.shots[side]++;
    res.xg[side] += xg;
    p.stats.sog++;
    goalie.stats.sa++;
    if (r.next() < chance) {
      res.goals[side]++;
      p.stats.g++;
      goalie.stats.ga++;
      const assist = ice[side].filter((a) => a.id !== p.id);
      if (r.next() < 0.87) {
        const a = r.pick(assist);
        a.stats.a++;
        if (r.next() < 0.69)
          r.pick(assist.filter((b) => b.id !== a.id)).stats.a++;
      }
      if (pp) {
        res.pp[side]++;
        penalty[other] = 0;
      } else if (penalty[side] <= time) {
        ice[side].forEach((a) => a.stats.plus++);
        ice[other].forEach((a) => a.stats.plus--);
      }
      emit(
        time,
        "goal",
        side,
        p,
        pp ? "Гол в большинстве / Power play goal" : "ГОЛ / GOAL",
        xg,
      );
    } else emit(time, "shot", side, p, "Бросок — сейв / Shot saved", xg);
  }
  for (
    let time = RULES.eventStepSeconds;
    time <= RULES.regulationSeconds;
    time += RULES.eventStepSeconds
  )
    step(time);
  if (res.goals[0] === res.goals[1]) {
    res.ot = true;
    const limit = playoffs
      ? Infinity
      : RULES.regulationSeconds + RULES.regularOvertimeSeconds;
    let time = 3620;
    while (res.goals[0] === res.goals[1] && time <= limit) {
      step(time);
      res.duration = time;
      time += 20;
    }
    if (res.goals[0] === res.goals[1]) {
      res.so = true;
      const side =
        r.next() < 0.5 + (goalies[1].ovr - goalies[0].ovr) * 0.003 ? 0 : 1;
      res.goals[side]++;
      emit(
        3900,
        "shootout",
        side,
        r.pick(active[side].filter((p) => p.pos !== "G")),
        "Победа по буллитам / Shootout winner",
      );
    }
  }
  const winner = res.goals[0] > res.goals[1] ? 0 : 1;
  goalies[winner].stats.wins++;
  active.forEach((ps) =>
    ps.forEach((p) => {
      p.fatigue = clamp(
        p.fatigue + 7 + (p.stats.toi / Math.max(1, p.stats.gp)) * 0.1,
        0,
        100,
      );
      p.morale = clamp(
        p.morale + (teams[winner].players.includes(p) ? 2 : -1),
        20,
        100,
      );
    }),
  );
  return res;
}
