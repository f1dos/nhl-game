import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Crown,
  MessageCircle,
  RotateCcw,
  Shield,
  Users,
} from "lucide-react";
import type { FranchiseStrategy, Game, Player } from "../engine/types";
import { reconsiderSeasonStrategy } from "../engine/strategy";
import { likelyStrategy } from "../engine/franchiseWorld";
import { clamp } from "../engine/random";
import {
  FACTOR_LABELS,
  FLAG_LABELS,
  VERDICT_LABELS,
  applyLeadershipChoice,
  captainCandidates,
  evaluateLeadershipChoice,
  incumbentGroup,
  leadershipScore,
  roomPreferredGroup,
  type CandidateFactorKey,
  type LeadershipVerdict,
} from "../engine/leadership";
import { PlayerLink } from "./links";
import TeamMeetingPanel from "./TeamMeetingPanel";

export { leadershipScore };

type Edit = (fn: (game: Game) => void) => void;
type Slot = 0 | 1 | 2;

const strategyNames: Record<FranchiseStrategy, [string, string]> = {
  "draft-lottery": ["Команда драфт-лотереи", "Draft Lottery Team"],
  "wild-card-hunt": ["Погоня за wild card", "Wild Card Hunt"],
  "playoff-breakthrough": ["Прорыв в плей-офф", "Playoff Breakthrough"],
  "stanley-cup": ["Борьба за Кубок Стэнли", "Stanley Cup Contender"],
};

export type CaptainAppointmentRisk = "recommended" | "questionable" | "severe";

/** Simple two-player comparison kept for older callers. */
export function captainAppointmentRisk(
  selected: Player,
  recommended: Player,
): CaptainAppointmentRisk {
  const leadershipGap =
    leadershipScore(recommended) - leadershipScore(selected);
  const overallGap = recommended.ovr - selected.ovr;
  if (selected.ovr < 70 || leadershipGap >= 12 || overallGap >= 12)
    return "severe";
  if (leadershipGap >= 6 || overallGap >= 7) return "questionable";
  return "recommended";
}

const verdictTone = (verdict: LeadershipVerdict) =>
  verdict === "united" || verdict === "approved"
    ? "good"
    : verdict === "doubts"
      ? "mixed"
      : "bad";

const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);

const FACTOR_COLUMNS: CandidateFactorKey[] = [
  "leadership",
  "experience",
  "tenure",
  "status",
  "morale",
  "popularity",
];

/** Short column headers: the raw value shown, coloured by how the room rates it. */
const COLUMN_LABELS: Partial<Record<CandidateFactorKey, { ru: string; en: string }>> = {
  leadership: { ru: "Лидер", en: "Lead" },
  experience: { ru: "Возраст", en: "Age" },
  tenure: { ru: "В клубе", en: "Tenure" },
  status: { ru: "OVR", en: "OVR" },
  morale: { ru: "Мораль", en: "Morale" },
  popularity: { ru: "Автор.", en: "Pop." },
};

export default function LeadershipCenter({
  game,
  edit,
}: {
  game: Game;
  edit: Edit;
}) {
  const ru = game.language === "ru";
  const lang = ru ? "ru" : "en";
  const tr = (russian: string, english: string) => (ru ? russian : english);
  const team = game.teams.find((club) => club.id === game.user)!;
  const [tab, setTab] = useState<"captaincy" | "meeting">("captaincy");

  const candidates = useMemo(() => captainCandidates(game), [game]);
  const preferred = roomPreferredGroup(candidates);
  const incumbent = incumbentGroup(game);
  const assigned = game.leadershipSeason === game.year && !!team.captainId;
  const initial: string[] = team.captainId
    ? [team.captainId, ...(team.alternateCaptainIds ?? [])]
    : incumbent.captainId
      ? [
          incumbent.captainId,
          ...preferred.filter((id) => id !== incumbent.captainId),
        ]
      : preferred;
  const [group, setGroup] = useState<string[]>([...new Set([...initial, ...preferred, ...candidates.map(c=>c.player.id)])].filter(id => candidates.some(c=>c.player.id===id)).slice(0, 3));
  const [slot, setSlot] = useState<Slot>(0);
  const [lastResult, setLastResult] = useState<{
    verdict: LeadershipVerdict;
    approval: number;
    letter: boolean;
    applied: boolean;
  }>();
  const [captainDialogue, setCaptainDialogue] = useState(false);
  const [captainDecision, setCaptainDecision] = useState<
    "pending" | "kept" | "aligned"
  >("pending");

  const byId = new Map(candidates.map((item) => [item.player.id, item]));
  const complete =
    group.length === 3 &&
    group.every((id) => byId.has(id)) &&
    new Set(group).size === 3;
  const evaluation = complete
    ? evaluateLeadershipChoice(game, group[0], group.slice(1))
    : undefined;
  const suggestedStrategy = likelyStrategy(team);
  const strategyMismatch =
    game.franchiseStrategy && game.franchiseStrategy !== suggestedStrategy;
  const captainPlayer = team.players.find((p) => p.id === team.captainId);

  const assign = (id: string) => {
    setGroup((current) => {
      const next = [...current];
      const existing = next.indexOf(id);
      if (existing >= 0 && existing !== slot) next[existing] = next[slot];
      next[slot] = id;
      return next;
    });
    setSlot((current) => ((current + 1) % 3) as Slot);
    setLastResult(undefined);
  };

  const confirm = () => {
    if (!complete || !evaluation) return;
    const firstThisSeason = !assigned;
    let result: ReturnType<typeof applyLeadershipChoice> | undefined;
    edit((current) => {
      result = applyLeadershipChoice(current, group[0], group.slice(1));
    });
    if (!result) return;
    setLastResult({
      verdict: evaluation.verdict,
      approval: evaluation.approval,
      letter: !!result.letterEventId,
      applied: result.applied || firstThisSeason,
    });
    if (result.applied && firstThisSeason) setCaptainDialogue(true);
  };

  const keepStrategy = () => {
    if (strategyMismatch) {
      edit((current) => {
        const club = current.teams.find((item) => item.id === current.user)!;
        club.players.forEach((player) => {
          player.morale = clamp(player.morale - 3, 0, 100);
          player.motivation = clamp((player.motivation ?? 50) - 2, 0, 100);
        });
        const leader = club.players.find((p) => p.id === club.captainId);
        if (leader)
          leader.relationship = clamp((leader.relationship ?? 50) - 4, 0, 100);
        if (current.managerEmployment)
          current.managerEmployment.confidence = clamp(
            current.managerEmployment.confidence - 3,
            0,
            100,
          );
      });
    }
    setCaptainDecision("kept");
  };

  const alignStrategy = () => {
    edit((current) =>
      reconsiderSeasonStrategy(
        current,
        likelyStrategy(current.teams.find((t) => t.id === current.user)!),
      ),
    );
    setCaptainDecision("aligned");
  };

  const slotLabel = (index: number) =>
    index === 0 ? tr("Капитан", "Captain") : tr("Ассистент", "Alternate");
  const tradeRequests = team.players.filter((player) => player.tradeRequest);
  const log = (game.leadershipLog ?? []).slice(0, 5);
  const nameOf = (id?: string) =>
    team.players.find((player) => player.id === id)?.name ?? "—";

  return (
    <div className="leadership-center">
      <header className="leadership-hero">
        <div>
          <span className="eyebrow">
            {tr("УПРАВЛЕНИЕ РАЗДЕВАЛКОЙ", "DRESSING ROOM MANAGEMENT")}
          </span>
          <h1>{tr("Лидерская группа", "Leadership group")}</h1>
          <p>
            {tr(
              "Капитан и ассистенты задают тон в раздевалке. Игроки знают, кого уважают, и заметят, если вы пойдёте против них.",
              "The captain and alternates set the tone in the room. The players know who they respect and will notice if you go against them.",
            )}
          </p>
        </div>
        <Crown size={44} />
      </header>

      <nav className="leadership-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "captaincy"}
          className={tab === "captaincy" ? "active" : ""}
          onClick={() => setTab("captaincy")}
        >
          <Crown size={15} /> {tr("Капитанство", "Captaincy")}
        </button>
        <button
          role="tab"
          aria-selected={tab === "meeting"}
          className={tab === "meeting" ? "active" : ""}
          onClick={() => setTab("meeting")}
        >
          <Users size={15} /> {tr("Командное собрание", "Team meeting")}
        </button>
      </nav>

      {tab === "meeting" ? (
        <TeamMeetingPanel game={game} edit={edit} />
      ) : (
        <div className="captaincy-layout">
          <section className="leadership-panel captaincy-main">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">
                  {tr("ВЫБОР ЛИДЕРОВ", "LEADERSHIP SELECTION")}
                </span>
                <h2>{tr("Капитан и ассистенты", "Captain and alternates")}</h2>
              </div>
              {assigned && (
                <span className="status-pill">
                  <CheckCircle2 size={15} />
                  {tr("Утверждено на сезон", "Set for the season")}
                </span>
              )}
            </div>

            <div className="captaincy-slots">
              {[0, 1, 2].map((index) => {
                const id = group[index];
                const candidate = id ? byId.get(id) : undefined;
                const was =
                  index === 0
                    ? incumbent.captainId
                    : incumbent.alternateIds[index - 1];
                return (
                  <button
                    key={index}
                    className={`captaincy-slot${slot === index ? " active" : ""}${index === 0 ? " captain" : ""}`}
                    onClick={() => setSlot(index as Slot)}
                  >
                    <span className="letter">{index === 0 ? "C" : "A"}</span>
                    <div>
                      <small>{slotLabel(index)}</small>
                      <strong>{candidate?.player.name ?? "—"}</strong>
                      <span>
                        {candidate
                          ? `${candidate.player.pos} · ${candidate.player.age} · ${tr("авторитет", "standing")} ${candidate.standing}`
                          : tr("выберите игрока", "pick a player")}
                      </span>
                      {index === 0 && was && was !== id && (
                        <em>
                          {tr("Сейчас", "Currently")}: {nameOf(was)}
                        </em>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="captaincy-hint">
              {tr(
                `Выберите слот, затем игрока в таблице. Сейчас заполняется: ${slotLabel(slot).toLowerCase()}.`,
                `Pick a slot, then a player in the table. Filling: ${slotLabel(slot).toLowerCase()}.`,
              )}
            </p>

            <div className="captaincy-table-wrap">
              <table className="captaincy-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{tr("Игрок", "Player")}</th>
                    {FACTOR_COLUMNS.map((key) => (
                      <th key={key} title={FACTOR_LABELS[key][lang]}>
                        {COLUMN_LABELS[key]?.[lang]}
                      </th>
                    ))}
                    <th>{tr("Авторитет", "Standing")}</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate, index) => {
                    const id = candidate.player.id;
                    const position = group.indexOf(id);
                    const roomPick = preferred.indexOf(id);
                    return (
                      <tr
                        key={id}
                        className={position >= 0 ? "chosen" : ""}
                        onClick={() => assign(id)}
                      >
                        <td className="rank">{index + 1}</td>
                        <td className="who">
                          <div>
                            <PlayerLink player={candidate.player} />
                            {candidate.role && (
                              <b className={`role-badge ${candidate.role}`}>
                                {candidate.role}
                              </b>
                            )}
                            {position >= 0 && (
                              <b className="pick-badge">
                                {position === 0 ? "C" : "A"}{" "}
                                {tr("выбран", "picked")}
                              </b>
                            )}
                            {roomPick >= 0 && (
                              <b className="room-badge">
                                {tr("выбор раздевалки", "room's pick")}
                              </b>
                            )}
                          </div>
                          <small>
                            {candidate.player.pos} · {candidate.player.age}{" "}
                            {tr("лет", "yrs")} · {candidate.player.ovr} OVR ·{" "}
                            {tr("№", "#")}
                            {candidate.ovrRank} {tr("в составе", "on roster")}
                            {candidate.flags.length > 0 &&
                              ` · ${candidate.flags
                                .map((flag) => FLAG_LABELS[flag][lang])
                                .join(", ")}`}
                          </small>
                        </td>
                        {FACTOR_COLUMNS.map((key) => (
                          <td key={key} className="factor">
                            <span
                              className={`factor-value ${candidate.factors[key] >= 70 ? "high" : candidate.factors[key] < 40 ? "low" : ""}`}
                            >
                              {key === "tenure"
                                ? `${candidate.tenure}${tr(" с.", "y")}`
                                : key === "leadership"
                                  ? candidate.leadership
                                  : key === "experience"
                                    ? candidate.player.age
                                    : key === "status"
                                      ? candidate.player.ovr
                                      : key === "morale"
                                        ? Math.round(candidate.player.morale)
                                        : candidate.popularity}
                            </span>
                          </td>
                        ))}
                        <td className="standing">
                          <div className="standing-bar">
                            <i style={{ width: `${candidate.standing}%` }} />
                          </div>
                          <b>{candidate.standing}</b>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="captaincy-side">
            <section className="leadership-panel room-choice">
              <span className="eyebrow">
                {tr("КОГО ХОЧЕТ РАЗДЕВАЛКА", "WHO THE ROOM WANTS")}
              </span>
              <ol>
                {preferred.map((id, index) => (
                  <li key={id}>
                    <span className="letter small">{index ? "A" : "C"}</span>
                    <PlayerLink id={id} name={nameOf(id)} />
                    <b>{byId.get(id)?.standing}</b>
                  </li>
                ))}
              </ol>
              <button
                className="ghost-button"
                onClick={() => {
                  setGroup(preferred);
                  setLastResult(undefined);
                }}
              >
                <RotateCcw size={14} />
                {tr("Взять выбор раздевалки", "Use the room's choice")}
              </button>
            </section>

            {evaluation && (
              <section
                className={`leadership-panel reaction-preview ${verdictTone(evaluation.verdict)}`}
              >
                <span className="eyebrow">
                  {tr("ОЖИДАЕМАЯ РЕАКЦИЯ", "PREDICTED REACTION")}
                </span>
                <div className="approval-head">
                  <strong>{VERDICT_LABELS[evaluation.verdict][lang]}</strong>
                  <span>
                    {tr("Одобрение", "Approval")} {evaluation.approval}%
                  </span>
                </div>
                <div className="approval-meter">
                  <i style={{ width: `${evaluation.approval}%` }} />
                </div>
                <ul className="reaction-reasons">
                  {evaluation.reasons.slice(0, 4).map((reason) => (
                    <li key={reason.en}>{reason[lang]}</li>
                  ))}
                </ul>
                {evaluation.changed ? (
                  <div className="effect-grid">
                    <div>
                      <small>{tr("Мораль команды", "Squad morale")}</small>
                      <b className={evaluation.squadMoraleDelta < 0 ? "neg" : "pos"}>
                        {signed(evaluation.squadMoraleDelta)}
                      </b>
                    </div>
                    <div>
                      <small>{tr("Мотивация", "Motivation")}</small>
                      <b className={evaluation.motivationDelta < 0 ? "neg" : "pos"}>
                        {signed(evaluation.motivationDelta)}
                      </b>
                    </div>
                    <div>
                      <small>{tr("Отношение к вам", "Trust in you")}</small>
                      <b className={evaluation.relationshipDelta < 0 ? "neg" : "pos"}>
                        {signed(evaluation.relationshipDelta)}
                      </b>
                    </div>
                    <div>
                      <small>{tr("Доверие совета", "Board confidence")}</small>
                      <b className={evaluation.confidenceDelta < 0 ? "neg" : "pos"}>
                        {signed(evaluation.confidenceDelta)}
                      </b>
                    </div>
                  </div>
                ) : (
                  <p className="muted-note">
                    {!assigned ? tr("Сохраните эту тройку или выберите новых лидеров на сезон.", "Confirm these three for this season or choose new leaders.") : tr(
                      "Это текущий состав лидеров. Повторное сохранение ничего не изменит.",
                      "This is the current group. Saving it again changes nothing.",
                    )}
                  </p>
                )}
                {evaluation.changed &&
                  evaluation.effects.some((e) => e.moraleDelta < 0) && (
                    <ul className="individual-effects">
                      {evaluation.effects
                        .filter((effect) => effect.moraleDelta < 0)
                        .map((effect) => (
                          <li key={effect.player.id}>
                            <span>{effect.player.name}</span>
                            <small>
                              {effect.reason === "stripped"
                                ? tr("лишён капитанства", "stripped of the C")
                                : effect.reason === "demoted"
                                  ? tr("понижен до «A»", "demoted to A")
                                  : tr("обойдён", "passed over")}
                            </small>
                            <b className="neg">
                              {tr("мораль", "morale")}{" "}
                              {signed(effect.moraleDelta)}
                            </b>
                          </li>
                        ))}
                    </ul>
                  )}
                {evaluation.changed && evaluation.stripped && (
                  <div className="letter-warning">
                    <AlertTriangle size={16} />
                    <span>
                      {tr(
                        `${evaluation.stripped.player.name} потребует объяснений.`,
                        `${evaluation.stripped.player.name} will want an explanation.`,
                      )}
                    </span>
                  </div>
                )}
                <button
                  className="primary leadership-confirm"
                  onClick={confirm}
                  disabled={assigned && !evaluation.changed}
                >
                  <Crown size={17} />
                  {!assigned && !evaluation.changed ? tr("Подтвердить на этот сезон", "Confirm for this season") : verdictTone(evaluation.verdict) === "bad"
                    ? tr("Всё равно утвердить", "Confirm anyway")
                    : tr("Утвердить лидерскую группу", "Confirm leadership group")}
                </button>
              </section>
            )}

            {lastResult && (
              <div
                className={`leadership-result ${verdictTone(lastResult.verdict)}`}
                role="status"
              >
                <Shield size={18} />
                <div>
                  <b>
                    {lastResult.applied
                      ? tr("Лидерская группа утверждена", "Leadership group confirmed")
                      : tr("Без изменений", "No change")}
                  </b>
                  {lastResult.applied && (
                    <span>
                      {VERDICT_LABELS[lastResult.verdict][lang]} ·{" "}
                      {lastResult.approval}%
                      {lastResult.letter &&
                        ` · ${tr("во входящих письмо от бывшего капитана", "a letter from the former captain is in your inbox")}`}
                    </span>
                  )}
                </div>
              </div>
            )}

            {tradeRequests.length > 0 && (
              <section className="leadership-panel trade-requests">
                <span className="eyebrow">
                  {tr("ПРОСЯТ ОБМЕН", "TRADE REQUESTS")}
                </span>
                {tradeRequests.map((player) => (
                  <p key={player.id}>
                    <PlayerLink player={player} />{" "}
                    <small>
                      {player.tradeRequest!.reason === "captaincy"
                        ? tr("после потери капитанства", "after losing the C")
                        : tr("после собрания", "after a meeting")}
                    </small>
                  </p>
                ))}
              </section>
            )}

            {log.length > 0 && (
              <section className="leadership-panel leadership-log">
                <span className="eyebrow">
                  {tr("ИСТОРИЯ РЕШЕНИЙ", "DECISION LOG")}
                </span>
                {log.map((entry) => (
                  <div key={`${entry.date}-${entry.captainId}`}>
                    <small>{entry.date}</small>
                    <span>
                      C {nameOf(entry.captainId)} · A{" "}
                      {entry.alternateIds.map(nameOf).join(", ")}
                    </span>
                    <b className={verdictTone(entry.verdict)}>
                      {VERDICT_LABELS[entry.verdict][lang]} {entry.approval}%
                    </b>
                  </div>
                ))}
              </section>
            )}
          </aside>
        </div>
      )}

      {captainDialogue && captainPlayer && (
        <div
          className="conversation-window leadership-dialogue"
          role="dialog"
          aria-modal="true"
        >
          <header>
            <div>
              <span className="eyebrow">
                {tr("КАПИТАН · ЛИЧНАЯ ВСТРЕЧА", "CAPTAIN · PRIVATE MEETING")}
              </span>
              <strong>{tr("Цели на сезон", "Season objectives")}</strong>
            </div>
          </header>
          <main className="conversation-room">
            <div className="speech player">
              <small>{captainPlayer.name.toUpperCase()}</small>
              <p>
                {lastResult && verdictTone(lastResult.verdict) === "bad"
                  ? tr(
                      "Спасибо за доверие. Скажу честно: старшие игроки удивлены, и мне придётся доказать, что я готов.",
                      "Thanks for the trust. Honestly, the senior guys are surprised. I'll have to prove I'm ready.",
                    )
                  : tr(
                      "Спасибо за доверие. Для меня это честь. Хочу, чтобы раздевалка верила в цели клуба.",
                      "Thanks for the trust. It's an honour. I want the room to believe in the club's targets.",
                    )}
              </p>
            </div>
            <div className="strategy-dialogue-card">
              <MessageCircle />
              <div>
                <b>
                  {strategyMismatch
                    ? tr(
                        "Капитан сомневается в реалистичности выбранной стратегии",
                        "The captain questions whether the selected strategy is realistic",
                      )
                    : tr(
                        "Капитан поддерживает стратегию клуба",
                        "The captain supports the club strategy",
                      )}
                </b>
                <span>
                  {tr("Выбрано", "Selected")}:{" "}
                  {game.franchiseStrategy
                    ? strategyNames[game.franchiseStrategy][ru ? 0 : 1]
                    : "—"}{" "}
                  · {tr("рекомендация", "recommended")}:{" "}
                  {strategyNames[suggestedStrategy][ru ? 0 : 1]}
                </span>
              </div>
            </div>
            {captainDecision === "pending" ? (
              <div className="dialogue-choices">
                {strategyMismatch && !game.leadershipStrategyChanged && (
                  <button onClick={alignStrategy}>
                    <span>
                      {tr(
                        "Принять рекомендацию капитана",
                        "Align with the captain",
                      )}
                    </span>
                    <p>
                      {tr(
                        "Единственный доступный пересмотр стратегии в этом сезоне.",
                        "This is the only strategy review available this season.",
                      )}
                    </p>
                  </button>
                )}
                <button onClick={keepStrategy}>
                  <span>
                    {strategyMismatch
                      ? tr(
                          "Оставить выбранную стратегию",
                          "Keep the current strategy",
                        )
                      : tr(
                          "Подтвердить общую цель",
                          "Confirm the shared objective",
                        )}
                  </span>
                  <p>
                    {tr(
                      "Закрыть обсуждение и передать цели раздевалке.",
                      "Close the discussion and take the objectives to the room.",
                    )}
                  </p>
                </button>
              </div>
            ) : (
              <div className="dialogue-result positive">
                <CheckCircle2 />
                <div>
                  <b>{tr("Решение принято", "Decision confirmed")}</b>
                  <p>
                    {captainDecision === "aligned"
                      ? tr(
                          "Капитан согласен: новая цель соответствует возможностям состава.",
                          "The captain agrees the revised target fits the roster.",
                        )
                      : tr(
                          "Капитан принял решение и донесёт позицию руководства до команды.",
                          "The captain accepts the decision and will carry it to the room.",
                        )}
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => setCaptainDialogue(false)}
                >
                  {tr("Завершить встречу", "End meeting")}
                </button>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
