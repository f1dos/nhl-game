import TacticalCenter from "./TacticalCenter";
import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  MessageCircle,
  Play,
  Shield,
  Users,
} from "lucide-react";
import type { Game, Player, SpecialTeamsSituation } from "../engine/types";
import {
  buildPressConference,
  pressConferenceComplete,
} from "../engine/press";
import PressConference from "./PressConference";
import { advanceDay, openingGameNeedsCaptain } from "../engine/management";
import { MatchRatingsPanel } from "./MatchRatings";
import { clamp } from "../engine/random";
import { swapLineupPlayer } from "../engine/roster";
import {
  ensureSpecialTeams,
  setSpecialTeamPlayer,
  SPECIAL_TEAM_LABELS,
  SPECIAL_TEAM_STYLES,
} from "../engine/tactics";
import SpatialMatchCenter from "./SpatialMatchCenter";
import TacticsBoard from "./TacticsBoard";
import { ClubLink } from "./links";
import Select from "./Select";

type Edit = (fn: (game: Game) => void) => void;
type MatchdayTab = "briefing" | "lineup" | "special" | "tactics" | "press";
export default function MatchdayHub({
  game,
  edit,
  onExit,
  onChooseCaptain,
  onPlayer,
}: {
  game: Game;
  edit: Edit;
  onExit: () => void;
  onChooseCaptain: () => void;
  onPlayer?: (player: Player) => void;
}) {
  const [stage, setStage] = useState<"pre" | "live" | "post" | "result">("pre");
  const [tab, setTab] = useState<MatchdayTab>("briefing");
  const [prePressSkipped, setPrePressSkipped] = useState(false);
  const ru = game.language === "ru";
  const [matchDate] = useState(game.calendar?.date ?? "");
  const team = game.teams.find((club) => club.id === game.user)!;
  const captainRequired = openingGameNeedsCaptain(game);
  ensureSpecialTeams(team);
  const preseason = game.preseasonFixtures?.find(
    (fixture) => fixture.date === game.calendar?.date && !fixture.result,
  );
  const fixture =
    preseason ??
    game.schedule.find(
      (item) =>
        item.round === game.round && [item.home, item.away].includes(game.user),
    );
  const playoffSeries =
    game.phase === "playoffs"
      ? game.bracket[game.playoffRound]?.find(
          (series) =>
            !series.winner && [series.a, series.b].includes(game.user),
        )
      : undefined;
  const opponentId = fixture
    ? fixture.home === game.user
      ? fixture.away
      : fixture.home
    : playoffSeries
      ? playoffSeries.a === game.user
        ? playoffSeries.b
        : playoffSeries.a
      : game.last
        ? game.last.home === game.user
          ? game.last.away
          : game.last.home
        : "";
  const opponent = game.teams.find((club) => club.id === opponentId);
  const preDone = pressConferenceComplete(
    game,
    buildPressConference(game, "pre-match", matchDate),
  );
  const postDone =
    stage === "post" &&
    pressConferenceComplete(
      game,
      buildPressConference(game, "post-match", matchDate),
    );
  const specialCount =
    Object.keys(team.specialTeams ?? {}).length ||
    Object.keys(SPECIAL_TEAM_LABELS).length;
  const recordSkippedPress = (current: Game) => {
      const fans = current.fans?.[current.user];
      if (fans) {
        fans.happiness = clamp(fans.happiness - 1, 0, 100);
        fans.lastChange = ru
          ? "GM пропустил предматчевые медиа-обязательства"
          : "The GM skipped the pre-game media obligations";
      }
      if (current.managerEmployment)
        current.managerEmployment.confidence = clamp(
          current.managerEmployment.confidence - 1,
          0,
          100,
        );
  };
  const skipPrePress = () => {
    edit(recordSkippedPress);
    setPrePressSkipped(true);
  };
  const playerSelect = (
    value: string,
    candidates: Player[],
    change: (id: string) => void,
    disabledIds: string[] = [],
  ) => (
    <Select value={value} onChange={(event) => change(event.target.value)}>
      {candidates
        .filter(
          (player) =>
            !player.injury &&
            (!disabledIds.includes(player.id) || player.id === value),
        )
        .map((player) => (
          <option key={player.id} value={player.id}>
            {player.name} · {player.pos} · {player.ovr}
          </option>
        ))}
    </Select>
  );
  if (stage === "live")
    return (
      <div className="matchday-window">
        <SpatialMatchCenter
          game={game}
          home={game.teams.find(
            (t) =>
              t.id ===
              (preseason?.home ??
                (playoffSeries
                  ? [0, 1, 4, 6].includes(
                      playoffSeries.wins[0] + playoffSeries.wins[1],
                    )
                    ? playoffSeries.a
                    : playoffSeries.b
                  : fixture?.home)),
          )!}
          away={game.teams.find(
            (t) =>
              t.id ===
              (preseason?.away ??
                (playoffSeries
                  ? [0, 1, 4, 6].includes(
                      playoffSeries.wins[0] + playoffSeries.wins[1],
                    )
                    ? playoffSeries.b
                    : playoffSeries.a
                  : fixture?.away)),
          )!}
          edit={edit}
          onComplete={() => setStage("post")}
        />
      </div>
    );
  if (stage === "post" || stage === "result")
    return (
      <div className="matchday-window">
        <header className="matchday-top">
          <button onClick={onExit}>
            <ArrowLeft size={17} />{" "}
            {ru ? "Завершить матч-день" : "End matchday"}
          </button>
          <div>
            <span>{stage === "result"
              ? (ru ? "ИТОГ МАТЧА" : "MATCH RESULT")
              : (ru ? "ПОСЛЕМАТЧЕВЫЕ МЕДИА" : "POST-MATCH MEDIA")}</span>
            <b>
              {game.last?.away} {game.last?.goals[1]} : {game.last?.goals[0]}{" "}
              {game.last?.home}
            </b>
          </div>
        </header>
        {game.last && <MatchRatingsPanel game={game} result={game.last} />}
        {stage === "post" && (
        <div className="matchday-press-stage">
          <span className="eyebrow">
            {ru ? "ПОСЛЕМАТЧЕВАЯ ПРЕСС-КОНФЕРЕНЦИЯ" : "POST-MATCH PRESS CONFERENCE"}
          </span>
          <h1>{ru ? "Последнее слово после игры" : "The last word after the game"}</h1>
          <PressConference
            game={game}
            edit={edit}
            type="post-match"
            date={matchDate}
          />
          {postDone && (
            <button className="primary presser-exit" onClick={onExit}>
              {ru ? "Вернуться в кабинет" : "Back to the office"}
            </button>
          )}
        </div>
        )}
      </div>
    );
  return (
    <div className="matchday-window">
      <header className="matchday-top">
        <button onClick={onExit}>
          <ArrowLeft size={17} />{" "}
          {ru ? "Покинуть матч-день" : "Leave matchday"}
        </button>
        <div>
          <span>
            {preseason
              ? ru
                ? "ПРЕДСЕЗОНКА"
                : "PRESEASON"
              : ru
                ? "МАТЧ-ДЕНЬ NHL"
                : "NHL MATCHDAY"}{" "}
            · {game.calendar?.date}
          </span>
          <b>
            <ClubLink team={team} /> —{" "}
            {opponent && <ClubLink team={opponent} />}
          </b>
        </div>
        <div className="matchday-clubs">
          <ClubLink team={team} crest={38}>
            {""}
          </ClubLink>
          <span>VS</span>
          {opponent && (
            <ClubLink team={opponent} crest={38}>
              {""}
            </ClubLink>
          )}
        </div>
      </header>
      <nav className="matchday-nav">
        {(
          ["briefing", "lineup", "special", "tactics", "press"] as MatchdayTab[]
        ).map((value) => (
          <button
            key={value}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
          >
            {value === "briefing"
              ? ru
                ? "Брифинг"
                : "Briefing"
              : value === "lineup"
                ? ru
                  ? "Состав"
                  : "Lineup"
                : value === "special"
                  ? ru
                    ? "Спецбригады"
                    : "Special teams"
                  : value === "tactics"
                    ? ru
                      ? "Тактика"
                      : "Tactics"
                    : ru
                      ? "Пресса"
                      : "Press"}
          </button>
        ))}
      </nav>
      <main className="matchday-content">
        {tab === "lineup" && (
          <TacticsBoard
            team={team}
            onPlayer={onPlayer}
            change={(fn) =>
              edit((current) =>
                fn(current.teams.find((t) => t.id === current.user)!),
              )
            }
          />
        )}
        {tab === "briefing" && (
          <section className="matchday-brief">
            <div>
              <span className="eyebrow">
                {ru ? "ПОДГОТОВКА К МАТЧУ" : "MATCH PREPARATION"}
              </span>
              <h1>
                {ru
                  ? "Последние решения перед вбрасыванием"
                  : "Final decisions before puck drop"}
              </h1>
              <p>
                {preseason
                  ? ru
                    ? "Предсезонный матч не влияет на таблицу: проверьте сочетания и специальные бригады."
                    : "A preseason game does not count in the standings: test your combinations and special teams."
                  : ru
                    ? "Состав, тактика и публичные ожидания фиксируются до начала игры."
                    : "Lineup, tactics and public expectations are locked in before the game."}
              </p>
            </div>
            <div className="matchup-card">
              <ClubLink team={team} crest={72}>
                {""}
              </ClubLink>
              <b>
                {team.record.w}-{team.record.l}-{team.record.otl}
              </b>
              <span>{ru ? "против" : "versus"}</span>
              <b>
                {opponent?.record.w}-{opponent?.record.l}-{opponent?.record.otl}
              </b>
              {opponent && (
                <ClubLink team={opponent} crest={72}>
                  {""}
                </ClubLink>
              )}
            </div>
            <div className="brief-checklist">
              <p>
                <CheckCircle2 /> {ru ? "Состав" : "Lineup"}:{" "}
                {new Set([
                  ...team.lines.flat(),
                  ...team.defense.flat(),
                  team.goalie,
                ]).size === 19
                  ? ru
                    ? "легален"
                    : "valid"
                  : ru
                    ? "требует исправления"
                    : "needs fixing"}
              </p>
              <p>
                <Shield />{" "}
                {ru
                  ? `Спецбригады: ${specialCount} ситуаций настроено`
                  : `Special teams: ${specialCount} situations configured`}
              </p>
              <p>
                <MessageCircle /> {ru ? "Пресса" : "Press"}:{" "}
                {preDone
                  ? ru
                    ? "ответы даны"
                    : "answered"
                  : ru
                    ? "ожидает решения"
                    : "awaiting your decision"}
              </p>
            </div>
          </section>
        )}
        {false && (
          <section className="matchday-lineup">
            <header>
              <h2>Заявка и сочетания</h2>
              <p>
                Игрок может занимать только один слот. Выбор уже назначенного
                хоккеиста автоматически меняет игроков местами.
              </p>
            </header>
            <div className="matchday-units">
              <div>
                <h3>Атакующие звенья</h3>
                {team.lines.map((line, row) => (
                  <section key={row}>
                    <b>Звено {row + 1}</b>
                    {line.map((id, slot) =>
                      playerSelect(
                        id,
                        team.players.filter(
                          (player) => player.pos !== "D" && player.pos !== "G",
                        ),
                        (next) =>
                          edit((current) =>
                            swapLineupPlayer(
                              current.teams.find(
                                (club) => club.id === current.user,
                              )!,
                              "lines",
                              row,
                              slot,
                              next,
                            ),
                          ),
                      ),
                    )}
                  </section>
                ))}
              </div>
              <div>
                <h3>Защита и вратарь</h3>
                {team.defense.map((pair, row) => (
                  <section key={row}>
                    <b>Пара {row + 1}</b>
                    {pair.map((id, slot) =>
                      playerSelect(
                        id,
                        team.players.filter((player) => player.pos === "D"),
                        (next) =>
                          edit((current) =>
                            swapLineupPlayer(
                              current.teams.find(
                                (club) => club.id === current.user,
                              )!,
                              "defense",
                              row,
                              slot,
                              next,
                            ),
                          ),
                      ),
                    )}
                  </section>
                ))}
                <section>
                  <b>Стартовый вратарь</b>
                  {playerSelect(
                    team.goalie,
                    team.players.filter((player) => player.pos === "G"),
                    (next) =>
                      edit((current) => {
                        current.teams.find(
                          (club) => club.id === current.user,
                        )!.goalie = next;
                      }),
                  )}
                </section>
              </div>
            </div>
          </section>
        )}
        {(tab === "special" || tab === "tactics") && (
          <TacticalCenter
            key={tab}
            team={team}
            initial={tab === "special" ? "special" : "plan"}
            onPlayer={onPlayer}
            change={(fn) =>
              edit((current) =>
                fn(current.teams.find((t) => t.id === current.user)!),
              )
            }
          />
        )}
        {tab === "press" && (
          <section className="matchday-press">
            <span className="eyebrow">
              {ru ? "ПРЕДМАТЧЕВАЯ ПРЕСС-КОНФЕРЕНЦИЯ" : "PRE-MATCH PRESS CONFERENCE"}
            </span>
            <h2>
              {ru
                ? "Установите ожидания перед игрой"
                : "Set expectations before the game"}
            </h2>
            {prePressSkipped && !preDone ? (
              <div className="press-consequence">
                <CheckCircle2 />
                <div>
                  <b>{ru ? "Пресс-конференция пропущена" : "Press conference skipped"}</b>
                  <p>
                    {ru
                      ? "СМИ отметили отказ общаться перед матчем."
                      : "The media noted that you declined to talk before the game."}
                  </p>
                </div>
              </div>
            ) : (
              <PressConference
                game={game}
                edit={edit}
                type="pre-match"
                date={matchDate}
              />
            )}
          </section>
        )}
      </main>
      <footer className="matchday-footer">
        <span>
          {captainRequired
            ? (ru ? "Назначьте капитана перед первым матчем сезона" : "Name a captain before the season opener")
            : preDone
            ? ru
              ? "Медиа-обязательства выполнены"
              : "Media obligations complete"
            : prePressSkipped
              ? ru
                ? "Вы сознательно пропустили пресс-конференцию — СМИ это отметят"
                : "You chose to skip the press conference — the media will notice"
              : ru
                ? "До матча нужно ответить СМИ или явно отказаться от пресс-конференции"
                : "Before the game, answer the media or explicitly decline the press conference"}
        </span>
        {!captainRequired && !preDone && !prePressSkipped && (
          <button className="press-skip" onClick={skipPrePress}>
            {ru
              ? "Пропустить СМИ и принять последствия"
              : "Skip the media and accept the consequences"}
          </button>
        )}
        <button
          className="press-skip"
          disabled={captainRequired}
          onClick={() => {
            edit((current) => {
              if (!preDone && !prePressSkipped) recordSkippedPress(current);
              advanceDay(current);
            });
            setStage("result");
          }}
        >
          {ru ? "Пропустить матч и получить результат" : "Skip match and get result"}
        </button>
        <button
          className="primary"
          onClick={() => {
            if (captainRequired) {
              onChooseCaptain();
              return;
            }
            if (!preDone && !prePressSkipped) {
              setTab("press");
              return;
            }
            setStage("live");
          }}
        >
          <Play size={16} />
          {captainRequired
            ? (ru ? "Выбрать капитана" : "Choose captain")
            : !preDone && !prePressSkipped
            ? ru
              ? "Перейти к пресс-конференции"
              : "Go to the press conference"
            : ru
              ? "Начать матч"
              : "Start the match"}
        </button>
      </footer>
    </div>
  );
}
