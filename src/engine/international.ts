import { autoLines } from "./database";
import { salaryTotal } from "./contracts";
import { clamp } from "./random";
import type { Game, InternationalOffer, InternationalRole } from "./types";
import { tx } from "./text";

export interface InternationalTerms {
  salary: number;
  years: number;
  signingBonus: number;
  role: InternationalRole;
  developmentPlan: boolean;
  transferFee: number;
}

const roleValue: Record<InternationalRole, number> = {
  depth: 0,
  rotation: 1,
  "top-six": 2,
};

export function scoutInternationalPlayer(g: Game, playerId: string) {
  const candidate = g.internationalMarket?.find(
    (x) => x.player.id === playerId,
  );
  if (!candidate) throw Error("International player unavailable");
  const points = g.draft?.scoutingPoints ?? 0;
  if (points < 4) throw Error(tx(g, "Нужно 4 очка международного скаутинга", "You need 4 international scouting points"));
  g.draft!.scoutingPoints -= 4;
  candidate.scouted = clamp(candidate.scouted + 25, 0, 100);
  g.news.unshift(
    tx(
      g,
      `Международный отчёт обновлён: ${candidate.player.name}, уверенность ${candidate.scouted}%.`,
      `International report updated: ${candidate.player.name}, confidence ${candidate.scouted}%.`,
    ),
  );
}

export function contactInternationalPlayer(g: Game, playerId: string) {
  const candidate = g.internationalMarket?.find(
    (x) => x.player.id === playerId,
  );
  if (!candidate) throw Error("International player unavailable");
  if (candidate.transferStatus === "rights-restricted")
    throw Error(
      tx(
        g,
        "Права NHL принадлежат другой организации — прямые переговоры запрещены",
        "Another organization holds his NHL rights — direct negotiations are not allowed",
      ),
    );
  if (candidate.scouted < 40)
    throw Error(
      tx(
        g,
        "Сначала доведите международный скаутинг минимум до 40%",
        "Raise international scouting to at least 40% first",
      ),
    );
  candidate.contactedBy = g.user;
  g.news.unshift(
    tx(
      g,
      `${g.user} получил разрешение агента на переговоры с ${candidate.player.name}.`,
      `${g.user} received the agent's permission to negotiate with ${candidate.player.name}.`,
    ),
  );
}

export function evaluateInternationalOffer(
  g: Game,
  playerId: string,
  terms: InternationalTerms,
) {
  const candidate = g.internationalMarket?.find(
    (x) => x.player.id === playerId,
  );
  const team = g.teams.find((x) => x.id === g.user)!;
  if (!candidate) throw Error("International player unavailable");
  if (candidate.contactedBy !== g.user)
    throw Error(
      tx(g, "Сначала установите контакт с агентом", "Contact the agent first"),
    );
  if (
    !Number.isFinite(terms.salary) ||
    terms.salary < 0.8 ||
    terms.salary > g.rules.cap * 0.2
  )
    throw Error(tx(g, "Некорректный AAV", "Invalid AAV"));
  if (!Number.isInteger(terms.years) || terms.years < 1 || terms.years > 3)
    throw Error(
      tx(
        g,
        "Первый контракт иностранного новичка ограничен 1–3 годами",
        "A foreign rookie's first contract is limited to 1–3 years",
      ),
    );
  if (terms.signingBonus < 0 || terms.signingBonus > terms.salary)
    throw Error(
      tx(
        g,
        "Подписной бонус должен быть от 0 до одного AAV",
        "The signing bonus must be between 0 and one AAV",
      ),
    );
  if (salaryTotal(team) + terms.salary > g.rules.cap + 1e-8)
    throw Error(
      tx(g, "Предложение превышает потолок зарплат", "The offer exceeds the salary cap"),
    );
  const requiredFee =
    candidate.transferStatus === "release-required"
      ? Math.round(
          (0.5 + Math.max(0, candidate.player.ovr - 70) * 0.12) * 100,
        ) / 100
      : 0;
  const salaryFit = clamp(terms.salary / candidate.desiredSalary, 0, 1.35);
  const termFit =
    terms.years === candidate.desiredYears
      ? 9
      : Math.abs(terms.years - candidate.desiredYears) === 1
        ? 5
        : 0;
  const roleFit =
    roleValue[terms.role] >= roleValue[candidate.desiredRole] ? 14 : -12;
  const samePosition = team.players.filter(
    (p) => p.pos === candidate.player.pos && p.ovr >= candidate.player.ovr,
  ).length;
  const opportunity = clamp(10 - samePosition * 2, -8, 10);
  const contender = clamp(11 - (team.strengthRank ?? 16) * 0.45, -4, 10);
  const feeFit =
    requiredFee === 0 ? 4 : terms.transferFee >= requiredFee ? 8 : -30;
  const score = Math.round(
    salaryFit * 28 +
      termFit +
      roleFit +
      opportunity +
      contender +
      feeFit +
      (terms.developmentPlan ? 8 : 0) +
      clamp(terms.signingBonus / Math.max(0.1, terms.salary), 0, 1) * 8 +
      candidate.scouted * 0.08 -
      candidate.adaptationRisk * 0.08 -
      candidate.agentLeverage * 0.07 -
      candidate.competingOffers * 3,
  );
  return { score, requiredFee, salaryFit, roleFit, opportunity, contender };
}

export function submitInternationalOffer(
  g: Game,
  playerId: string,
  terms: InternationalTerms,
) {
  const evaluation = evaluateInternationalOffer(g, playerId, terms);
  const candidate = g.internationalMarket!.find(
    (x) => x.player.id === playerId,
  )!;
  g.internationalOffers ??= [];
  const existing = g.internationalOffers.find(
    (x) =>
      x.playerId === playerId && x.team === g.user && x.status !== "accepted",
  );
  const offer: InternationalOffer = {
    id: existing?.id ?? `intl-offer-${g.year}-${g.round}-${playerId}`,
    playerId,
    team: g.user,
    ...terms,
    submittedRound: g.round,
    decisionRound: g.round + 2,
    status: "pending",
    score: evaluation.score,
    message: tx(
      g,
      `Агент изучает предложение. Решение после тура ${g.round + 2}.`,
      `The agent is reviewing the offer. Decision after round ${g.round + 2}.`,
    ),
  };
  if (existing) Object.assign(existing, offer);
  else g.internationalOffers.push(offer);
  g.news.unshift(
    tx(
      g,
      `${g.user} направил официальное предложение ${candidate.player.name}.`,
      `${g.user} sent an official offer to ${candidate.player.name}.`,
    ),
  );
  return offer;
}

export function resolveInternationalOffers(g: Game) {
  for (const offer of g.internationalOffers ?? []) {
    if (offer.status !== "pending" || offer.decisionRound > g.round) continue;
    const candidate = g.internationalMarket?.find(
      (x) => x.player.id === offer.playerId,
    );
    const team = g.teams.find((x) => x.id === offer.team);
    if (!candidate || !team) continue;
    if (offer.score >= 65) {
      offer.status = "accepted";
      offer.message = tx(
        g,
        "Контракт принят после проверки трансферных документов.",
        "Contract accepted after the transfer documents were checked.",
      );
      const player = candidate.player;
      player.salary = offer.salary;
      player.years = offer.years;
      player.contractRemainingValue =
        Math.round(offer.salary * offer.years * 100) / 100;
      player.contractExpiryYear = g.year + offer.years;
      player.contractStatus = player.age < 27 ? "RFA" : "UFA";
      player.contractSource = "generated";
      player.contractType = "ELC";
      player.league = "NHL";
      player.currentClub = team.id;
      if (
        team.players.length < 30 &&
        salaryTotal(team) + player.salary <= g.rules.cap
      )
        team.players.push(player);
      else (team.farm ??= []).push(player);
      autoLines(team);
      g.internationalMarket = g.internationalMarket!.filter(
        (x) => x.player.id !== player.id,
      );
      g.news.unshift(
        tx(
          g,
          `${team.id}: международный контракт подписан — ${player.name}, ${offer.years} г. / $${offer.salary}M AAV.`,
          `${team.id}: international contract signed — ${player.name}, ${offer.years} yr / $${offer.salary}M AAV.`,
        ),
      );
    } else if (offer.score >= 52) {
      offer.status = "countered";
      offer.message = tx(
        g,
        `Контрпредложение агента: минимум $${candidate.desiredSalary.toFixed(2)}M, роль ${candidate.desiredRole}, бонус и план адаптации.`,
        `Agent's counteroffer: at least $${candidate.desiredSalary.toFixed(2)}M, a ${candidate.desiredRole} role, a bonus and an adaptation plan.`,
      );
      g.news.unshift(
        tx(
          g,
          `${candidate.player.name}: агент вернулся с контрпредложением.`,
          `${candidate.player.name}: the agent came back with a counteroffer.`,
        ),
      );
    } else {
      offer.status = "rejected";
      offer.message = tx(
        g,
        "Игрок выбрал другой вариант: предложение не компенсировало роль, риск адаптации и конкуренцию.",
        "The player chose another option: the offer did not make up for the role, adaptation risk and competition.",
      );
      g.news.unshift(
        tx(
          g,
          `${candidate.player.name} отклонил предложение ${team.id}.`,
          `${candidate.player.name} rejected the ${team.id} offer.`,
        ),
      );
    }
  }
}
