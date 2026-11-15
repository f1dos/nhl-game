import type { Game } from "./types";
export function validateSave(value: unknown): Game {
  const g = value as Game;
  if (
    !g ||
    g.version !== 1 ||
    !Array.isArray(g.teams) ||
    g.teams.length !== 32 ||
    !Number.isInteger(g.seed) ||
    !Number.isInteger(g.year) ||
    !Number.isInteger(g.round) ||
    g.round < 0 ||
    g.round > 82 ||
    !["regular", "playoffs", "offseason"].includes(g.phase) ||
    !["ru", "en"].includes(g.language)
  )
    throw Error("Неподдерживаемое или повреждённое сохранение");
  const ids = new Set(g.teams.map((t) => t.id));
  if (
    ids.size !== 32 ||
    !ids.has(g.user) ||
    !Array.isArray(g.schedule) ||
    g.schedule.length !== 1312 ||
    !Array.isArray(g.history) ||
    !Array.isArray(g.news)
  )
    throw Error("Неполные данные лиги");
  const players = new Set<string>();
  for (const t of g.teams) {
    if (
      t.training !== undefined &&
      !["balanced", "recovery", "shooting", "defense"].includes(t.training)
    )
      throw Error("Invalid training plan");
    if (
      t.trainingTicks !== undefined &&
      (!Number.isInteger(t.trainingTicks) || t.trainingTicks < 0)
    )
      throw Error("Invalid training progress");
    if (
      !Array.isArray(t.players) ||
      t.players.length < 20 ||
      t.lines?.length !== 4 ||
      t.defense?.length !== 3 ||
      !t.record ||
      !t.tactics
    )
      throw Error("Неверные данные клуба");
    for (const p of t.players) {
      if (
        players.has(p.id) ||
        typeof p.name !== "string" ||
        !["LW", "C", "RW", "D", "G"].includes(p.pos) ||
        !p.stats ||
        !Array.isArray(p.history) ||
        Object.keys(p.attributes || {}).length !== 30 ||
        Object.values(p.attributes).some(
          (v) => !Number.isFinite(v) || v < 1 || v > 100,
        ) ||
        !Number.isFinite(p.ovr)
      )
        throw Error("Неверные данные игрока");
      players.add(p.id);
    }
    for (const p of t.prospects ?? []) {
      if (
        players.has(p.id) ||
        typeof p.id !== "string" ||
        !["LW", "C", "RW", "D", "G"].includes(p.pos) ||
        !p.stats ||
        Object.keys(p.attributes || {}).length !== 30
      )
        throw Error("Invalid or duplicate prospect");
      players.add(p.id);
    }
    for (const p of t.farm ?? []) {
      if (
        players.has(p.id) ||
        typeof p.id !== "string" ||
        !["LW", "C", "RW", "D", "G"].includes(p.pos) ||
        !p.stats ||
        Object.keys(p.attributes || {}).length !== 30
      )
        throw Error("Invalid or duplicate farm player");
      players.add(p.id);
    }
    const onIce = [...t.lines.flat(), ...t.defense.flat(), t.goalie];
    if (
      onIce.length !== 19 ||
      new Set(onIce).size !== 19 ||
      onIce.some((id) => !t.players.some((p) => p.id === id))
    )
      throw Error("Неверные звенья");
  }
  for (const collection of [
    g.freeAgents ?? [],
    (g.retired ?? []).map((x) => x.player),
    g.juniorPlayers ?? [],
    (g.internationalMarket ?? []).map((x) => x.player),
  ]) {
    if (!Array.isArray(collection)) throw Error("Invalid player pool");
    for (const p of collection) {
      if (
        !p ||
        players.has(p.id) ||
        typeof p.id !== "string" ||
        typeof p.name !== "string" ||
        !["LW", "C", "RW", "D", "G"].includes(p.pos) ||
        !Number.isFinite(p.age) ||
        !Number.isFinite(p.ovr) ||
        !Array.isArray(p.history) ||
        !p.stats ||
        Object.keys(p.attributes || {}).length !== 30 ||
        Object.values(p.attributes).some(
          (v) => !Number.isFinite(v) || v < 1 || v > 100,
        )
      )
        throw Error("Invalid or duplicate player in world");
      players.add(p.id);
    }
  }
  if ((g.freeAgents || []).some((p) => p.years !== 0))
    throw Error("Free agent has an active contract");
  if (
    (g.internationalOffers ?? []).some(
      (offer) =>
        !["pending", "accepted", "rejected", "countered"].includes(
          offer.status,
        ) ||
        !Number.isFinite(offer.salary) ||
        !Number.isInteger(offer.decisionRound),
    )
  )
    throw Error("Invalid international offer");
  if (g.freeAgentOffers !== undefined) {
    if (!Array.isArray(g.freeAgentOffers) ||
        new Set(g.freeAgentOffers.map(o => o.id)).size !== g.freeAgentOffers.length ||
        g.freeAgentOffers.some(o =>
          !o.id || !o.playerId || !ids.has(o.teamId) ||
          !["pending","countered","accepted","rejected","signed-elsewhere","withdrawn","expired"].includes(o.status) ||
          !["depth","middle-six","top-six","star"].includes(o.role) ||
          !Number.isInteger(o.years) || o.years < 1 || o.years > 7 ||
          !Number.isFinite(o.salary) || o.salary < 0 || o.salary > g.rules.cap * .2 ||
          !Number.isInteger(o.attempts) || o.attempts < 1 || o.attempts > 3 ||
          !/^\d{4}-\d{2}-\d{2}$/.test(o.submittedDate) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(o.decisionDate) ||
          (o.counterSalary !== undefined && !Number.isFinite(o.counterSalary)) ||
          (o.competingTeamId !== undefined && !ids.has(o.competingTeamId))
        )) throw Error("Invalid free-agent negotiation history");
  }
  if (g.draft) {
    if (
      !["scouting", "draft", "complete"].includes(g.draft.status) ||
      !Array.isArray(g.draft.prospects) ||
      !Array.isArray(g.draft.picks) ||
      !Array.isArray(g.draft.shortlist) ||
      !Number.isInteger(g.draft.currentPick) ||
      g.draft.currentPick < 0
    )
      throw Error("Invalid draft state");
    for (const prospect of g.draft.prospects) {
      const p = prospect.player;
      if (!prospect.draftedBy && players.has(p.id))
        throw Error("Duplicate undrafted prospect");
      if (
        !p ||
        typeof p.id !== "string" ||
        !["LW", "C", "RW", "D", "G"].includes(p.pos) ||
        !g.draft.reports[p.id]
      )
        throw Error("Invalid draft prospect");
    }
  }
  if (
    g.schedule.some(
      (f) =>
        !ids.has(f.home) ||
        !ids.has(f.away) ||
        f.home === f.away ||
        !Number.isInteger(f.round),
    )
  )
    throw Error("Неверный календарь");
  if (
    g.calendar &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(g.calendar.date) ||
      !Number.isInteger(g.calendar.day) ||
      g.calendar.day < 0)
  )
    throw Error("Invalid management calendar");
  if (
    g.franchiseStrategy !== undefined &&
    ![
      "draft-lottery",
      "wild-card-hunt",
      "playoff-breakthrough",
      "stanley-cup",
    ].includes(g.franchiseStrategy)
  )
    throw Error("Invalid franchise strategy");
  if (
    g.franchiseObjectives &&
    (!Array.isArray(g.franchiseObjectives) ||
      g.franchiseObjectives.some(
        (objective) =>
          !["critical", "major", "supporting"].includes(objective.tier) ||
          !Number.isFinite(objective.target) ||
          !Number.isFinite(objective.progress),
      ))
  )
    throw Error("Invalid franchise objectives");
  if (
    g.managerEmployment &&
    (!Number.isFinite(g.managerEmployment.confidence) ||
      g.managerEmployment.confidence < 0 ||
      g.managerEmployment.confidence > 100 ||
      !["secure", "under-pressure", "final-warning", "fired"].includes(
        g.managerEmployment.status,
      ))
  )
    throw Error("Invalid manager employment state");
  if (g.events) {
    if (
      !Array.isArray(g.events) ||
      new Set(g.events.map((event) => event.id)).size !== g.events.length ||
      g.events.some(
        (event) =>
          !event.id ||
          !event.date ||
          !["low", "normal", "high", "critical"].includes(event.priority),
      )
    )
      throw Error("Invalid management events");
  }
  if (g.draftAssets) {
    if (
      !Array.isArray(g.draftAssets) ||
      new Set(g.draftAssets.map((asset) => asset.id)).size !==
        g.draftAssets.length ||
      g.draftAssets.some(
        (asset) =>
          !ids.has(asset.originalTeam) ||
          !ids.has(asset.currentTeam) ||
          asset.round < 1 ||
          asset.round > 7,
      )
    )
      throw Error("Invalid draft assets");
  }
  if (
    g.fans &&
    Object.values(g.fans).some(
      (fans) =>
        !Number.isFinite(fans.supporters) ||
        fans.supporters < 0 ||
        !Number.isFinite(fans.happiness) ||
        fans.happiness < 0 ||
        fans.happiness > 100 ||
        !Number.isFinite(fans.engagement) ||
        fans.engagement < 0 ||
        fans.engagement > 100,
    )
  )
    throw Error("Invalid fan state");
  if (
    g.rivalries &&
    (!Array.isArray(g.rivalries) ||
      g.rivalries.some(
        (rivalry) =>
          !ids.has(rivalry.teamA) ||
          !ids.has(rivalry.teamB) ||
          rivalry.teamA === rivalry.teamB ||
          rivalry.heat < 0 ||
          rivalry.heat > 100,
      ))
  )
    throw Error("Invalid rivalry state");
  if (
    g.teamNeeds &&
    Object.entries(g.teamNeeds).some(
      ([team, needs]) =>
        !ids.has(team) ||
        !Array.isArray(needs) ||
        needs.some(
          (need) =>
            !["LW", "C", "RW", "D", "G"].includes(need.position) ||
            !["critical", "high", "medium"].includes(need.priority) ||
            !Number.isFinite(need.budget),
        ),
    )
  )
    throw Error("Invalid team needs");
  return g;
}
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("nhlm26", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("careers", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
async function writeGame(g: Game) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("careers", "readwrite");
    tx.objectStore("careers").put(g);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  localStorage.setItem("nhlm26-last", g.id);
}
export async function listGames(): Promise<Game[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction("careers").objectStore("careers").getAll();
    req.onsuccess = () => {
      db.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}
export function exportGame(g: Game) {
  const blob = new Blob([JSON.stringify(g)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `NHL-${g.user}-${g.year}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let saveQueue: Promise<void> = Promise.resolve();
export function saveGame(g: Game): Promise<void> {
  const snapshot = structuredClone(g);
  saveQueue = saveQueue.catch(() => {}).then(() => writeGame(snapshot));
  return saveQueue;
}
