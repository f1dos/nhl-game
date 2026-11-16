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
import type {
  Game,
  Player,
  PressAppearance,
  SpecialTeamsSituation,
} from "../engine/types";
import { advanceDay } from "../engine/management";
import { clamp } from "../engine/random";
import { swapLineupPlayer } from "../engine/roster";
import {
  ensureSpecialTeams,
  setSpecialTeamPlayer,
  SPECIAL_TEAM_LABELS,
  SPECIAL_TEAM_STYLES,
} from "../engine/tactics";
import { Crest } from "./components";
import SpatialMatchCenter from "./SpatialMatchCenter";
import TacticsBoard from "./TacticsBoard";

type Edit = (fn: (game: Game) => void) => void;
type MatchdayTab = "briefing" | "lineup" | "special" | "tactics" | "press";
type PressChoice = {
  title: string;
  line: string;
  response: string;
  tone: PressAppearance["tone"];
  fan: number;
  board: number;
  morale: number;
};

const prePress: PressChoice[] = [
  {
    title: "Снять давление",
    line: "Результат важен, но команда должна играть свободно и доверять своей подготовке.",
    response:
      "Лидеры оценили защиту команды, но руководство ожидало более жёсткого сигнала.",
    tone: "protective",
    fan: 0,
    board: -1,
    morale: 2,
  },
  {
    title: "Подчеркнуть план",
    line: "Мы детально разобрали соперника. Решат дисциплина, смены и качество спецбригад.",
    response:
      "Руководство одобрило план, но игроки почувствовали дополнительную ответственность.",
    tone: "balanced",
    fan: 1,
    board: 1,
    morale: -1,
  },
  {
    title: "Потребовать победу",
    line: "Сегодня нам нужны два очка. У этой команды нет права прятаться от ожиданий.",
    response:
      "Фанаты воодушевлены, но часть раздевалки почувствовала дополнительное давление.",
    tone: "ambitious",
    fan: 2,
    board: 2,
    morale: -1,
  },
  {
    title: "Похвалить лидеров",
    line: "Наши ключевые игроки готовы вести команду. Я полностью доверяю им в решающие минуты.",
    response:
      "Первое звено получило заряд уверенности, игроки глубины ждут своего шанса.",
    tone: "protective",
    fan: 1,
    board: -1,
    morale: 2,
  },
  {
    title: "Уважить соперника",
    line: "Это сильная команда. Если потеряем структуру хотя бы на смену, нас накажут.",
    response:
      "Ответ сочли взвешенным; тактическая дисциплина стала главным посылом.",
    tone: "balanced",
    fan: -1,
    board: 1,
    morale: 1,
  },
  {
    title: "Разогреть противостояние",
    line: "В таких матчах таблица отходит на второй план. Мы обязаны выиграть борьбу за каждый метр льда.",
    response: "Цитата разошлась по медиа и резко подняла ожидания фанатов.",
    tone: "ambitious",
    fan: 3,
    board: 1,
    morale: -1,
  },
];
const postPress: PressChoice[] = [
  {
    title: "Взять ответственность",
    line: "Все ключевые решения были моими. Игроков критиковать не собираюсь.",
    response: "Раздевалка оценила защиту менеджера.",
    tone: "protective",
    fan: 0,
    board: -1,
    morale: 2,
  },
  {
    title: "Разобрать детали",
    line: "Нам нужно улучшить смены, контроль центра и качество первого паса. Сделаем выводы завтра.",
    response:
      "Руководство оценило анализ, но публичная критика деталей задела игроков.",
    tone: "balanced",
    fan: 1,
    board: 1,
    morale: -1,
  },
  {
    title: "Потребовать большего",
    line: "Стандарт клуба выше. Независимо от счёта мы должны быть требовательнее к себе.",
    response:
      "Руководству понравилась амбиция, но уставшие игроки восприняли её тяжело.",
    tone: "ambitious",
    fan: 2,
    board: 2,
    morale: -1,
  },
  {
    title: "Отметить спецбригады",
    line: "Сегодня ключевым фактором стали наши решения в неравных составах.",
    response:
      "Штаб получил признание, но игроки вне спецбригад почувствовали, что их вклад недооценён.",
    tone: "balanced",
    fan: 1,
    board: 1,
    morale: -1,
  },
  {
    title: "Похвалить характер",
    line: "Команда не развалилась в сложный момент и продолжала играть друг за друга.",
    response: "Командная мораль заметно выросла.",
    tone: "protective",
    fan: 1,
    board: -1,
    morale: 2,
  },
  {
    title: "Ответить жёстко",
    line: "Некоторые хоккеисты не выполнили свою работу. Места в составе никому не гарантированы.",
    response:
      "Заявление понравилось требовательным фанатам, но ухудшило атмосферу.",
    tone: "ambitious",
    fan: 2,
    board: 1,
    morale: -2,
  },
];

export default function MatchdayHub({
  game,
  edit,
  onExit,
  onPlayer,
}: {
  game: Game;
  edit: Edit;
  onExit: () => void;
  onPlayer?: (player: Player) => void;
}) {
  const [stage, setStage] = useState<"pre" | "live" | "post">("pre");
  const [tab, setTab] = useState<MatchdayTab>("briefing");
  const [preAnswer, setPreAnswer] = useState<PressChoice>();
  const [prePressSkipped, setPrePressSkipped] = useState(false);
  const [postAnswer, setPostAnswer] = useState<PressChoice>();
  const [matchDate] = useState(game.calendar?.date ?? "");
  const team = game.teams.find((club) => club.id === game.user)!;
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
  const preDone =
    !!preAnswer ||
    !!game.pressHistory?.some(
      (appearance) =>
        appearance.date === matchDate && appearance.type === "pre-match",
    );
  const postDone =
    !!postAnswer ||
    !!game.pressHistory?.some(
      (appearance) =>
        appearance.date === matchDate && appearance.type === "post-match",
    );
  const skipPrePress = () => {
    edit((current) => {
      const fans = current.fans?.[current.user];
      if (fans) {
        fans.happiness = clamp(fans.happiness - 1, 0, 100);
        fans.lastChange = "GM пропустил предматчевые медиа-обязательства";
      }
      if (current.managerEmployment)
        current.managerEmployment.confidence = clamp(
          current.managerEmployment.confidence - 1,
          0,
          100,
        );
    });
    setPrePressSkipped(true);
  };
  const press = (choice: PressChoice, type: PressAppearance["type"]) => {
    edit((current) => {
      current.pressHistory ??= [];
      if (
        current.pressHistory.some(
          (appearance) =>
            appearance.date === matchDate && appearance.type === type,
        )
      )
        return;
      current.pressHistory.unshift({
        date: matchDate,
        type,
        tone: choice.tone,
        headline: choice.line,
        fanDelta: choice.fan,
        boardDelta: choice.board,
        moraleDelta: choice.morale,
      });
      const fans = current.fans?.[current.user];
      if (fans) {
        fans.happiness = clamp(fans.happiness + choice.fan, 0, 100);
        fans.engagement = clamp(
          fans.engagement + Math.sign(choice.fan),
          0,
          100,
        );
        fans.lastChange =
          type === "pre-match" ? "Предматчевая пресса" : "Послематчевая пресса";
      }
      if (current.managerEmployment)
        current.managerEmployment.confidence = clamp(
          current.managerEmployment.confidence + choice.board,
          0,
          100,
        );
      current.teams
        .find((club) => club.id === current.user)!
        .players.forEach((player) => {
          player.morale = clamp(player.morale + choice.morale, 0, 100);
        });
    });
    type === "pre-match" ? setPreAnswer(choice) : setPostAnswer(choice);
  };
  const playerSelect = (
    value: string,
    candidates: Player[],
    change: (id: string) => void,
    disabledIds: string[] = [],
  ) => (
    <select value={value} onChange={(event) => change(event.target.value)}>
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
    </select>
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
  if (stage === "post")
    return (
      <div className="matchday-window">
        <header className="matchday-top">
          <button onClick={onExit}>
            <ArrowLeft size={17} /> Завершить матч-день
          </button>
          <div>
            <span>POST-MATCH MEDIA</span>
            <b>
              {game.last?.away} {game.last?.goals[1]} : {game.last?.goals[0]}{" "}
              {game.last?.home}
            </b>
          </div>
        </header>
        <div className="matchday-press-stage">
          <span className="eyebrow">ПОСЛЕМАТЧЕВАЯ ПРЕСС-КОНФЕРЕНЦИЯ</span>
          <h1>Последнее слово после игры</h1>
          <p className="press-prompt">
            Журналист: «Как вы оцениваете результат, решения штаба и реакцию
            команды сегодня?»
          </p>
          {!postDone ? (
            <div className="matchday-answer-grid">
              {postPress.map((choice) => (
                <button
                  key={choice.title}
                  onClick={() => press(choice, "post-match")}
                >
                  <b>{choice.title}</b>
                  <span>«{choice.line}»</span>
                  <small>
                    Фанаты {choice.fan >= 0 ? "+" : ""}
                    {choice.fan} · руководство {choice.board >= 0 ? "+" : ""}
                    {choice.board} · команда {choice.morale >= 0 ? "+" : ""}
                    {choice.morale}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <div className="press-consequence">
              <CheckCircle2 size={28} />
              <div>
                <b>Ответ опубликован</b>
                <p>
                  {postAnswer?.response ??
                    "Медиа-обязательства после матча уже выполнены."}
                </p>
              </div>
              <button className="primary" onClick={onExit}>
                Вернуться в кабинет
              </button>
            </div>
          )}
        </div>
      </div>
    );
  return (
    <div className="matchday-window">
      <header className="matchday-top">
        <button onClick={onExit}>
          <ArrowLeft size={17} /> Покинуть матч-день
        </button>
        <div>
          <span>
            {preseason ? "PRESEASON" : "NHL MATCHDAY"} · {game.calendar?.date}
          </span>
          <b>
            {team.city} {team.name} — {opponent?.city} {opponent?.name}
          </b>
        </div>
        <div className="matchday-clubs">
          <Crest team={team} size={38} />
          <span>VS</span>
          {opponent && <Crest team={opponent} size={38} />}
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
              ? "Брифинг"
              : value === "lineup"
                ? "Состав"
                : value === "special"
                  ? "Спецбригады"
                  : value === "tactics"
                    ? "Тактика"
                    : "Пресса"}
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
              <span className="eyebrow">MATCH PREPARATION</span>
              <h1>Последние решения перед вбрасыванием</h1>
              <p>
                {preseason
                  ? "Предсезонный матч не влияет на таблицу: проверьте сочетания и специальные бригады."
                  : "Состав, тактика и публичные ожидания фиксируются до начала игры."}
              </p>
            </div>
            <div className="matchup-card">
              <Crest team={team} size={72} />
              <b>
                {team.record.w}-{team.record.l}-{team.record.otl}
              </b>
              <span>против</span>
              <b>
                {opponent?.record.w}-{opponent?.record.l}-{opponent?.record.otl}
              </b>
              {opponent && <Crest team={opponent} size={72} />}
            </div>
            <div className="brief-checklist">
              <p>
                <CheckCircle2 /> Состав:{" "}
                {new Set([
                  ...team.lines.flat(),
                  ...team.defense.flat(),
                  team.goalie,
                ]).size === 19
                  ? "легален"
                  : "требует исправления"}
              </p>
              <p>
                <Shield /> Спецбригады: 9 ситуаций настроено
              </p>
              <p>
                <MessageCircle /> Пресса:{" "}
                {preDone ? "ответ дан" : "ожидает решения"}
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
            <span className="eyebrow">PRE-MATCH PRESS CONFERENCE</span>
            <h2>Установите ожидания перед игрой</h2>
            <p className="press-prompt">
              Журналист: «Какой сигнал вы хотите отправить игрокам и болельщикам
              перед сегодняшним матчем?»
            </p>
            {!preDone ? (
              <div className="matchday-answer-grid">
                {prePress.map((choice) => (
                  <button
                    key={choice.title}
                    onClick={() => press(choice, "pre-match")}
                  >
                    <b>{choice.title}</b>
                    <span>«{choice.line}»</span>
                    <small>
                      Фанаты {choice.fan >= 0 ? "+" : ""}
                      {choice.fan} · руководство {choice.board >= 0 ? "+" : ""}
                      {choice.board} · команда {choice.morale >= 0 ? "+" : ""}
                      {choice.morale}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="press-consequence">
                <CheckCircle2 />
                <div>
                  <b>Ответ опубликован</b>
                  <p>
                    {preAnswer?.response ??
                      "Предматчевая пресс-конференция уже проведена."}
                  </p>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
      <footer className="matchday-footer">
        <span>
          {preDone
            ? "Медиа-обязательства выполнены"
            : prePressSkipped
              ? "Вы сознательно пропустили пресс-конференцию — СМИ это отметят"
              : "До матча нужно ответить СМИ или явно отказаться от пресс-конференции"}
        </span>
        {!preDone && !prePressSkipped && (
          <button className="press-skip" onClick={skipPrePress}>
            Пропустить СМИ и принять последствия
          </button>
        )}
        <button
          className="primary"
          onClick={() => {
            if (!preDone && !prePressSkipped) {
              setTab("press");
              return;
            }
            setStage("live");
          }}
        >
          <Play size={16} />
          {!preDone && !prePressSkipped
            ? "Перейти к пресс-конференции"
            : "Начать матч"}
        </button>
      </footer>
    </div>
  );
}
