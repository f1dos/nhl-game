import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Crown,
  MessageCircle,
  Shield,
  Users,
} from "lucide-react";
import type { FranchiseStrategy, Game, Player } from "../engine/types";
import { reconsiderSeasonStrategy } from "../engine/strategy";
import { likelyStrategy } from "../engine/franchiseWorld";
import { clamp } from "../engine/random";

type Edit = (fn: (game: Game) => void) => void;
type MeetingTone = "supportive" | "calm" | "demanding";

const strategyNames: Record<FranchiseStrategy, [string, string]> = {
  "draft-lottery": ["Команда драфт-лотереи", "Draft Lottery Team"],
  "wild-card-hunt": ["Погоня за wild card", "Wild Card Hunt"],
  "playoff-breakthrough": ["Прорыв в плей-офф", "Playoff Breakthrough"],
  "stanley-cup": ["Борьба за Кубок Стэнли", "Stanley Cup Contender"],
};

const realWorldCaptains: Record<string, string> = {
  ANA: "Radko Gudas",
  BUF: "Rasmus Dahlin",
  CGY: "Mikael Backlund",
  CAR: "Jordan Staal",
  CHI: "Nick Foligno",
  COL: "Gabriel Landeskog",
  CBJ: "Boone Jenner",
  DAL: "Jamie Benn",
  DET: "Dylan Larkin",
  EDM: "Connor McDavid",
  FLA: "Aleksander Barkov",
  LAK: "Anze Kopitar",
  MIN: "Jared Spurgeon",
  MTL: "Nick Suzuki",
  NSH: "Roman Josi",
  NJD: "Nico Hischier",
  NYI: "Anders Lee",
  OTT: "Brady Tkachuk",
  PHI: "Sean Couturier",
  PIT: "Sidney Crosby",
  SEA: "Jordan Eberle",
  STL: "Brayden Schenn",
  TBL: "Victor Hedman",
  TOR: "Auston Matthews",
  VAN: "Quinn Hughes",
  VGK: "Mark Stone",
  WSH: "Alex Ovechkin",
  WPG: "Adam Lowry",
  UTA: "Clayton Keller",
};

export function leadershipScore(player: Player) {
  const a = player.attributes;
  const ageFit =
    player.age >= 27 && player.age <= 35 ? 8 : player.age >= 24 ? 3 : -4;
  return Math.round(
    (a.leadership ?? 60) * 0.34 +
      (a.teamwork ?? 60) * 0.18 +
      (a.composure ?? 60) * 0.16 +
      (a.consistency ?? 60) * 0.12 +
      player.ovr * 0.2 +
      ageFit,
  );
}

export type CaptainAppointmentRisk = "recommended" | "questionable" | "severe";

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

export default function LeadershipCenter({
  game,
  edit,
}: {
  game: Game;
  edit: Edit;
}) {
  const ru = game.language === "ru";
  const team = game.teams.find((club) => club.id === game.user)!;
  const ranked = useMemo(
    () =>
      [...team.players].sort((a, b) => leadershipScore(b) - leadershipScore(a)),
    [team.players],
  );
  const realCaptain = team.players.find(
    (player) => player.name === realWorldCaptains[team.id],
  );
  const [recommended] = useState(realCaptain?.id ?? ranked[0]?.id ?? "");
  const [captain, setCaptain] = useState(team.captainId ?? recommended);
  const alternateDefaults =
    team.alternateCaptainIds ??
    ranked
      .filter((p) => p.id !== captain)
      .slice(0, 2)
      .map((p) => p.id);
  const [alternates, setAlternates] = useState<string[]>(alternateDefaults);
  const [captainDialogue, setCaptainDialogue] = useState(false);
  const [captainDecision, setCaptainDecision] = useState<
    "pending" | "kept" | "aligned"
  >("pending");
  const [meetingTone, setMeetingTone] = useState<MeetingTone>();
  const [meetingStep, setMeetingStep] = useState(0);
  const assigned = game.leadershipSeason === game.year && !!team.captainId;
  const suggestedStrategy = likelyStrategy(team);
  const strategyMismatch =
    game.franchiseStrategy && game.franchiseStrategy !== suggestedStrategy;
  const form = team.record.form.slice(-5);
  const averageMorale =
    team.players.reduce((sum, p) => sum + p.morale, 0) /
    Math.max(1, team.players.length);
  const seasonDate = game.calendar?.date ?? "";
  const meetingReason =
    game.phase === "playoffs"
      ? "playoffs"
      : form.filter((result) => result.startsWith("L")).length >= 4
        ? "losing-streak"
        : averageMorale < 55
          ? "morale"
          : game.calendar && seasonDate < game.calendar.seasonStart
            ? "preseason"
            : undefined;
  const alreadyMet = game.teamMeetings?.some(
    (meeting) =>
      meeting.reason === meetingReason &&
      meeting.date.slice(0, 4) === String(game.year),
  );
  const canMeet = !!meetingReason && !alreadyMet && assigned;
  const captainPlayer = team.players.find(
    (player) => player.id === (team.captainId ?? captain),
  );
  const recommendedPlayer = team.players.find(
    (player) => player.id === recommended,
  );
  const selectedCandidate = team.players.find(
    (player) => player.id === captain,
  );
  const appointmentRisk =
    selectedCandidate && recommendedPlayer
      ? captainAppointmentRisk(selectedCandidate, recommendedPlayer)
      : "recommended";

  const tr = (russian: string, english: string) => (ru ? russian : english);
  const updateAlternate = (index: number, value: string) =>
    setAlternates((current) => {
      const next = [...current];
      const other = next[index === 0 ? 1 : 0];
      next[index] = value === other ? (current[index] ?? "") : value;
      return next;
    });

  const confirmLeadership = () => {
    if (
      !captain ||
      alternates.length < 2 ||
      new Set([captain, ...alternates]).size !== 3
    )
      return;
    edit((current) => {
      const club = current.teams.find((item) => item.id === current.user)!;
      const previous = club.captainId;
      if (previous && previous !== captain) {
        const old = club.players.find((p) => p.id === previous);
        if (old) {
          old.morale = clamp(old.morale - 4, 0, 100);
          old.relationship = clamp((old.relationship ?? 50) - 7, 0, 100);
        }
      }
      const selected = club.players.find((p) => p.id === captain)!;
      const staffChoice = club.players.find((p) => p.id === recommended)!;
      const risk = captainAppointmentRisk(selected, staffChoice);
      const teamMoraleDelta =
        risk === "severe" ? -6 : risk === "questionable" ? -3 : 1;
      club.players.forEach((player) => {
        player.morale = clamp(player.morale + teamMoraleDelta, 0, 100);
        if (risk === "severe")
          player.motivation = clamp((player.motivation ?? 50) - 3, 0, 100);
      });
      selected.morale = clamp(selected.morale + 2, 0, 100);
      selected.relationship = clamp(
        (selected.relationship ?? 50) + (risk === "severe" ? -2 : 3),
        0,
        100,
      );
      if (risk !== "recommended" && staffChoice.id !== selected.id) {
        staffChoice.morale = clamp(
          staffChoice.morale - (risk === "severe" ? 7 : 3),
          0,
          100,
        );
        staffChoice.relationship = clamp(
          (staffChoice.relationship ?? 50) - (risk === "severe" ? 10 : 4),
          0,
          100,
        );
      }
      if (current.managerEmployment)
        current.managerEmployment.confidence = clamp(
          current.managerEmployment.confidence -
            (risk === "severe" ? 6 : risk === "questionable" ? 2 : 0),
          0,
          100,
        );
      club.captainId = captain;
      club.alternateCaptainIds = alternates.slice(0, 2);
      current.leadershipSeason = current.year;
      current.events
        ?.filter((event) => event.action === "leadership")
        .forEach((event) => {
          event.read = true;
          event.resolved = true;
        });
      current.news.unshift(
        risk === "severe"
          ? `Спорное назначение: ${selected.name} стал капитаном, лидеры ${club.id} требуют объяснений.`
          : `${selected.name} назначен капитаном ${club.city} ${club.name}.`,
      );
    });
    setCaptainDialogue(true);
  };

  const keepStrategy = () => {
    if (strategyMismatch) {
      edit((current) => {
        const club = current.teams.find((item) => item.id === current.user)!;
        club.players.forEach((player) => {
          player.morale = clamp(player.morale - 3, 0, 100);
          player.motivation = clamp((player.motivation ?? 50) - 2, 0, 100);
        });
        const leader = club.players.find(
          (player) => player.id === club.captainId,
        );
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

  const holdMeeting = (tone: MeetingTone) => {
    if (!meetingReason || !captainPlayer) return;
    const fit =
      meetingReason === "losing-streak"
        ? tone !== "demanding"
        : meetingReason === "preseason"
          ? tone !== "supportive"
          : true;
    const outcome = fit ? "positive" : "negative";
    edit((current) => {
      const club = current.teams.find((item) => item.id === current.user)!;
      club.players.forEach((player) => {
        player.morale = clamp(player.morale + (fit ? 2 : -2), 0, 100);
        player.motivation = clamp(
          (player.motivation ?? 50) + (fit ? 3 : -3),
          0,
          100,
        );
      });
      const leader = club.players.find((p) => p.id === captainPlayer.id)!;
      leader.relationship = clamp(
        (leader.relationship ?? 50) + (fit ? 2 : -2),
        0,
        100,
      );
      (current.teamMeetings ??= []).unshift({
        date: current.calendar?.date ?? `${current.year}-09-01`,
        reason: meetingReason,
        tone,
        leaderId: leader.id,
        outcome,
        message: fit
          ? "Команда приняла посыл и договорилась о следующем шаге."
          : "Раздевалка сочла тон несвоевременным.",
      });
    });
    setMeetingTone(tone);
    setMeetingStep(1);
  };

  const meetingLabels: Record<string, [string, string]> = {
    preseason: [
      "Старт сезона и общие стандарты",
      "Season launch and shared standards",
    ],
    "losing-streak": [
      "Реакция на серию поражений",
      "Response to the losing streak",
    ],
    playoffs: ["Настрой перед плей-офф", "Playoff focus"],
    morale: ["Восстановление атмосферы", "Restore dressing-room morale"],
  };

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
              "Капитан задаёт стандарты, а собрания работают только тогда, когда для них есть настоящий повод.",
              "Your captain sets the standards. Team meetings only work when the moment calls for one.",
            )}
          </p>
        </div>
        <Crown size={44} />
      </header>

      <div className="leadership-grid">
        <section className="leadership-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                {tr("ПЕРЕД СЕЗОНОМ", "PRESEASON DECISION")}
              </span>
              <h2>{tr("Капитан и ассистенты", "Captain and alternates")}</h2>
            </div>
            {assigned && (
              <span className="status-pill">
                <CheckCircle2 size={15} />
                {tr("Утверждено", "Confirmed")}
              </span>
            )}
          </div>
          <div className="captain-recommendation">
            <Shield size={22} />
            <div>
              <b>
                {tr("Рекомендация штаба", "Staff recommendation")}:{" "}
                {team.players.find((p) => p.id === recommended)?.name}
              </b>
              <span>
                {tr(
                  "Оценены лидерство, командная игра, хладнокровие, стабильность и авторитет.",
                  "Based on leadership, teamwork, composure, consistency and dressing-room standing.",
                )}
              </span>
            </div>
          </div>
          <label>
            {tr("Капитан", "Captain")}
            <select
              value={captain}
              disabled={assigned}
              onChange={(e) => setCaptain(e.target.value)}
            >
              {ranked.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name} · {leadershipScore(p)} LEAD · {p.ovr} OVR
                  {p.id === recommended
                    ? ` · ${tr("РЕКОМЕНДОВАН", "RECOMMENDED")}`
                    : ""}
                </option>
              ))}
            </select>
          </label>
          {appointmentRisk !== "recommended" && !assigned && (
            <div className={`captain-risk ${appointmentRisk}`}>
              <Shield size={20} />
              <div>
                <b>
                  {appointmentRisk === "severe"
                    ? tr(
                        "Штаб категорически против этого назначения",
                        "The staff strongly opposes this appointment",
                      )
                    : tr(
                        "Лидеры раздевалки сомневаются в выборе",
                        "Dressing-room leaders question this choice",
                      )}
                </b>
                <span>
                  {tr(
                    `${selectedCandidate?.name}: ${selectedCandidate?.ovr} OVR / ${selectedCandidate ? leadershipScore(selectedCandidate) : 0} LEAD. Рекомендация: ${recommendedPlayer?.name}, ${recommendedPlayer?.ovr} OVR. Назначение ухудшит мораль, мотивацию и доверие к GM.`,
                    `${selectedCandidate?.name}: ${selectedCandidate?.ovr} OVR / ${selectedCandidate ? leadershipScore(selectedCandidate) : 0} LEAD. Recommended: ${recommendedPlayer?.name}, ${recommendedPlayer?.ovr} OVR. The appointment will damage morale, motivation and confidence in the GM.`,
                  )}
                </span>
              </div>
            </div>
          )}
          <div className="alternate-grid">
            {[0, 1].map((index) => (
              <label key={index}>
                {tr(`Ассистент ${index + 1}`, `Alternate ${index + 1}`)}
                <select
                  value={alternates[index] ?? ""}
                  disabled={assigned}
                  onChange={(e) => updateAlternate(index, e.target.value)}
                >
                  <option value="">—</option>
                  {ranked
                    .filter((p) => p.id !== captain)
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name} · {leadershipScore(p)} LEAD
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
          {!assigned && (
            <button
              className="primary leadership-confirm"
              onClick={confirmLeadership}
              disabled={
                !captain ||
                alternates.length < 2 ||
                new Set([captain, ...alternates]).size !== 3
              }
            >
              <Crown size={17} />
              {appointmentRisk === "severe"
                ? tr(
                    "Утвердить спорное назначение",
                    "Confirm controversial appointment",
                  )
                : tr("Утвердить лидерскую группу", "Confirm leadership group")}
            </button>
          )}
        </section>

        <section className="leadership-panel meeting-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                {tr("КОМАНДНОЕ СОБРАНИЕ", "TEAM MEETING")}
              </span>
              <h2>
                {meetingReason
                  ? meetingLabels[meetingReason][ru ? 0 : 1]
                  : tr(
                      "Сейчас собрание не требуется",
                      "No meeting is needed now",
                    )}
              </h2>
            </div>
            <Users size={24} />
          </div>
          <p>
            {canMeet
              ? tr(
                  "Лидеры считают момент подходящим. Выберите тон обращения к раздевалке.",
                  "The leaders agree the timing is right. Choose how to address the room.",
                )
              : !assigned
                ? tr(
                    "Сначала назначьте капитана и ассистентов.",
                    "Appoint the captain and alternates first.",
                  )
                : alreadyMet
                  ? tr(
                      "Эта тема уже обсуждалась. Повторное собрание будет выглядеть паникой.",
                      "This issue has already been addressed. Calling another meeting would look like panic.",
                    )
                  : tr(
                      "Без плохой серии, старта сезона, плей-офф или кризиса атмосферы команда воспримет собрание отрицательно.",
                      "Without a losing streak, season launch, playoff berth or morale problem, the room would react badly.",
                    )}
          </p>
          {!meetingTone && (
            <div className="meeting-options">
              {(["supportive", "calm", "demanding"] as MeetingTone[]).map(
                (tone) => (
                  <button
                    key={tone}
                    disabled={!canMeet}
                    onClick={() => holdMeeting(tone)}
                  >
                    <b>
                      {tone === "supportive"
                        ? tr("Поддержать", "Supportive")
                        : tone === "calm"
                          ? tr("Спокойно обозначить план", "Calm and clear")
                          : tr("Потребовать реакции", "Demand a response")}
                    </b>
                    <span>
                      {tone === "supportive"
                        ? tr(
                            "Снять давление и защитить игроков.",
                            "Take pressure off the players.",
                          )
                        : tone === "calm"
                          ? tr(
                              "Дать конкретную цель без лишних эмоций.",
                              "Set a clear target without theatrics.",
                            )
                          : tr(
                              "Поставить стандарты выше комфорта.",
                              "Put standards above comfort.",
                            )}
                    </span>
                  </button>
                ),
              )}
            </div>
          )}
          {meetingStep > 0 && (
            <div className="meeting-dialogue">
              <div className="speech player">
                <small>
                  {captainPlayer?.name?.toUpperCase()} ·{" "}
                  {tr("КАПИТАН", "CAPTAIN")}
                </small>
                <p>
                  {meetingTone === "demanding"
                    ? tr(
                        "Посыл понятен. Теперь важно, чтобы требования были одинаковы для всех.",
                        "Message received. Now the standard has to be the same for everyone.",
                      )
                    : tr(
                        "Раздевалка вас услышала. Нам нужен понятный следующий шаг.",
                        "The room heard you. We need a clear next step now.",
                      )}
                </p>
              </div>
              {meetingStep === 1 && (
                <div className="dialogue-choices">
                  <button onClick={() => setMeetingStep(2)}>
                    <span>
                      {tr("Назначить командную цель", "Set a team target")}
                    </span>
                    <p>
                      {tr(
                        "Закрепить разговор конкретной задачей на ближайшие матчи.",
                        "Turn the message into a concrete target for the next games.",
                      )}
                    </p>
                  </button>
                  <button onClick={() => setMeetingStep(2)}>
                    <span>
                      {tr("Выслушать лидеров", "Listen to the leaders")}
                    </span>
                    <p>
                      {tr(
                        "Дать капитану самому донести детали до раздевалки.",
                        "Let the captain carry the details into the room.",
                      )}
                    </p>
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

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
                {appointmentRisk === "severe"
                  ? tr(
                      "Спасибо за доверие. Но я не буду притворяться: старшие игроки удивлены, и мне придётся доказать, что я готов к этой роли.",
                      "Thank you for the trust. I will not pretend otherwise: the senior players are surprised, and I will have to prove I am ready for this role.",
                    )
                  : tr(
                      "Спасибо за доверие. Для меня это честь. Я хочу убедиться, что раздевалка верит в цели клуба.",
                      "Thank you for the trust. It is an honour. I want to make sure the room believes in the club's objectives.",
                    )}
              </p>
            </div>
            {appointmentRisk !== "recommended" && (
              <div className={`captain-risk dialogue ${appointmentRisk}`}>
                <Shield size={20} />
                <div>
                  <b>
                    {tr(
                      "Назначение уже вызвало недовольство раздевалки",
                      "The appointment has already unsettled the dressing room",
                    )}
                  </b>
                  <span>
                    {tr(
                      "Авторитетные игроки ждут объяснений. Мораль и доверие к руководству снизились.",
                      "Senior players expect an explanation. Morale and confidence in management have fallen.",
                    )}
                  </span>
                </div>
              </div>
            )}
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
