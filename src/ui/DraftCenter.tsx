import { useMemo, useState } from "react";
import {
  advanceDraftToUser,
  ensureDraft,
  makeUserDraftPick,
  scoutProspect,
  SCOUTING_REGIONS,
  setScoutingRegion,
  toggleShortlist,
} from "../engine/draft";
import type { DraftProspect, Game, ScoutingReport } from "../engine/types";
import { Panel } from "./components";
import { ClubLink, PlayerLink } from "./links";

type Translate = (ru: string, en: string) => string;

const regionLabel = (region: string, tr: Translate) =>
  ({
    "North America": tr("Северная Америка", "North America"),
    Nordic: tr("Скандинавия", "Nordic"),
    "Central Europe": tr("Центральная Европа", "Central Europe"),
    Russia: tr("Россия", "Russia"),
  })[region] ?? region;

function range(report: ScoutingReport) {
  const spread = Math.max(1, Math.ceil((100 - report.confidence) / 12));
  return `${Math.max(40, report.estimatedPotential - spread)}–${Math.min(99, report.estimatedPotential + spread)}`;
}

export default function DraftCenter({
  game,
  edit,
  tr,
}: {
  game: Game;
  edit: (fn: (game: Game) => void) => void;
  tr: Translate;
}) {
  const [position, setPosition] = useState("ALL");
  const [region, setRegion] = useState("ALL");
  const [query, setQuery] = useState("");
  const [board, setBoard] = useState<"class" | "shortlist" | "pipeline">(
    "class",
  );
  const draft = game.draft;
  const team = game.teams.find((t) => t.id === game.user)!;

  const players = useMemo(() => {
    if (!draft) return [];
    return draft.prospects
      .filter((prospect) => !prospect.draftedBy)
      .filter(
        (prospect) => position === "ALL" || prospect.player.pos === position,
      )
      .filter((prospect) => region === "ALL" || prospect.region === region)
      .filter(
        (prospect) =>
          board !== "shortlist" || draft.shortlist.includes(prospect.player.id),
      )
      .filter((prospect) =>
        prospect.player.name.toLowerCase().includes(query.toLowerCase()),
      )
      .sort((a, b) => {
        const ra = draft.reports[a.player.id];
        const rb = draft.reports[b.player.id];
        return (
          rb.estimatedPotential - ra.estimatedPotential ||
          rb.estimatedOvr - ra.estimatedOvr ||
          a.player.name.localeCompare(b.player.name)
        );
      });
  }, [draft, position, region, query, board]);

  if (!draft)
    return (
      <div className="draft-empty">
        <span>2027</span>
        <h1>{tr("Создать драфт-класс", "Create draft class")}</h1>
        <p>
          {tr(
            "Это сохранение создано до появления системы драфта. Мир можно безопасно обновить.",
            "This save predates the draft system. The world can be upgraded safely.",
          )}
        </p>
        <button className="primary" onClick={() => edit(ensureDraft)}>
          {tr("Обновить карьеру", "Upgrade career")}
        </button>
      </div>
    );

  const current = draft.picks[draft.currentPick];
  const myPicks = draft.picks.filter((pick) => pick.team === game.user);
  const selected = myPicks.filter((pick) => pick.prospectId);
  const pipeline = team.prospects ?? [];

  return (
    <>
      <div className="draft-hero">
        <div>
          <span className="eyebrow">NHL ENTRY DRAFT · {draft.year}</span>
          <h1>{tr("Центр драфта и скаутинга", "Draft & scouting center")}</h1>
          <p>
            {draft.status === "scouting"
              ? tr(
                  "Формируйте собственный рейтинг и уменьшайте неопределённость до драфта.",
                  "Build your board and reduce uncertainty before draft night.",
                )
              : draft.status === "draft"
                ? tr(
                    "Драфт идёт в реальном порядке. ИИ-клубы выбирают по ценности и потребностям.",
                    "The draft follows the live order. AI clubs pick for value and need.",
                  )
                : tr(
                    "Драфт завершён. Выбранные игроки добавлены в системы клубов.",
                    "The draft is complete. Selected players joined club pipelines.",
                  )}
          </p>
        </div>
        <div className={`draft-status ${draft.status}`}>
          <small>{tr("СТАТУС", "STATUS")}</small>
          <b>
            {draft.status === "scouting"
              ? tr("СКАУТИНГ", "SCOUTING")
              : draft.status === "draft"
                ? tr("ДРАФТ ИДЁТ", "DRAFT LIVE")
                : tr("ЗАВЕРШЁН", "COMPLETE")}
          </b>
          <span>
            {draft.status === "draft"
              ? `${draft.currentPick + 1} / ${draft.picks.length}`
              : `${draft.prospects.length} ${tr("игрока", "players")}`}
          </span>
        </div>
      </div>

      <div className="draft-metrics">
        <div>
          <small>{tr("РЕСУРС СКАУТОВ", "SCOUTING CAPACITY")}</small>
          <b>{draft.scoutingPoints}</b>
          <span>{tr("отчётов доступно", "reports available")}</span>
        </div>
        <div>
          <small>{tr("РЕГИОН ЗАДАНИЯ", "ASSIGNED REGION")}</small>
          <b>{regionLabel(draft.assignment, tr)}</b>
          <span>{tr("пассивное изучение", "passive coverage")}</span>
        </div>
        <div>
          <small>{tr("МОЙ СПИСОК", "MY SHORTLIST")}</small>
          <b>{draft.shortlist.length}</b>
          <span>{tr("приоритетных игроков", "priority targets")}</span>
        </div>
        <div>
          <small>{tr("СИСТЕМА КЛУБА", "CLUB PIPELINE")}</small>
          <b>{pipeline.length}</b>
          <span>{tr("проспектов с правами", "owned prospects")}</span>
        </div>
      </div>

      {draft.status === "scouting" && (
        <Panel title={tr("ЗАДАНИЕ СКАУТСКОЙ СЛУЖБЫ", "SCOUTING ASSIGNMENT")}>
          <div className="region-selector">
            {SCOUTING_REGIONS.map((item) => (
              <button
                key={item}
                className={draft.assignment === item ? "active" : ""}
                onClick={() => edit((g) => setScoutingRegion(g, item))}
              >
                <span>{regionLabel(item, tr)}</span>
                <small>
                  {draft.prospects.filter((p) => p.region === item).length}{" "}
                  {tr("игроков", "players")}
                </small>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {draft.status === "draft" && current && (
        <section className="on-clock">
          <div>
            <span>{tr("СЕЙЧАС ВЫБИРАЕТ", "ON THE CLOCK")}</span>
            <b>
              <ClubLink id={current.team} crest={24} />
            </b>
            <small>
              {tr("Раунд", "Round")} {current.round} · #{current.overall}
            </small>
          </div>
          {current.team === game.user ? (
            <strong>{tr("ВАШ ВЫБОР", "YOUR PICK")}</strong>
          ) : (
            <button onClick={() => edit(advanceDraftToUser)}>
              {tr("До моего выбора", "Sim to my pick")}
            </button>
          )}
        </section>
      )}

      <div className="draft-tabs tabs">
        <button
          className={board === "class" ? "active" : ""}
          onClick={() => setBoard("class")}
        >
          {tr("Драфт-класс", "Draft class")}
        </button>
        <button
          className={board === "shortlist" ? "active" : ""}
          onClick={() => setBoard("shortlist")}
        >
          {tr("Мой список", "My shortlist")} · {draft.shortlist.length}
        </button>
        <button
          className={board === "pipeline" ? "active" : ""}
          onClick={() => setBoard("pipeline")}
        >
          {tr("Система клуба", "Club pipeline")} · {pipeline.length}
        </button>
      </div>

      {board === "pipeline" ? (
        <Pipeline players={pipeline} tr={tr} />
      ) : (
        <Panel
          title={tr("РЕЙТИНГ ПЕРСПЕКТИВНЫХ ИГРОКОВ", "PROSPECT RANKING")}
          extra={
            <div className="draft-filters">
              <input
                value={query}
                placeholder={tr("Поиск игрока…", "Search player…")}
                onChange={(event) => setQuery(event.target.value)}
              />
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              >
                <option>ALL</option>
                {["LW", "C", "RW", "D", "G"].map((pos) => (
                  <option key={pos}>{pos}</option>
                ))}
              </select>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                <option>ALL</option>
                {SCOUTING_REGIONS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
          }
        >
          <ProspectTable
            prospects={players}
            reports={draft.reports}
            shortlist={draft.shortlist}
            scoutingPoints={draft.scoutingPoints}
            canScout={draft.status === "scouting"}
            canPick={draft.status === "draft" && current?.team === game.user}
            tr={tr}
            onScout={(id) => edit((g) => scoutProspect(g, id))}
            onShortlist={(id) => edit((g) => toggleShortlist(g, id))}
            onPick={(id) => edit((g) => makeUserDraftPick(g, id))}
          />
        </Panel>
      )}

      {selected.length > 0 && (
        <Panel title={tr("ВЫБОРЫ ВАШЕГО КЛУБА", "YOUR CLUB'S PICKS")}>
          <div className="draft-pick-history">
            {selected.map((pick) => {
              const prospect = draft.prospects.find(
                (p) => p.player.id === pick.prospectId,
              )!;
              return (
                <div key={pick.overall}>
                  <b>#{pick.overall}</b>
                  <span>
                    <PlayerLink player={prospect.player} />
                  </span>
                  <small>
                    {prospect.player.pos} · {prospect.player.nation} ·{" "}
                    {tr("раунд", "round")} {pick.round}
                  </small>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </>
  );
}

function ProspectTable({
  prospects,
  reports,
  shortlist,
  scoutingPoints,
  canScout,
  canPick,
  tr,
  onScout,
  onShortlist,
  onPick,
}: {
  prospects: DraftProspect[];
  reports: Record<string, ScoutingReport>;
  shortlist: string[];
  scoutingPoints: number;
  canScout: boolean;
  canPick: boolean;
  tr: Translate;
  onScout: (id: string) => void;
  onShortlist: (id: string) => void;
  onPick: (id: string) => void;
}) {
  return (
    <div className="table-scroll draft-table-wrap">
      <table className="draft-table">
        <thead>
          <tr>
            <th>#</th>
            <th>{tr("ИГРОК", "PLAYER")}</th>
            <th>POS</th>
            <th>{tr("РЕГИОН", "REGION")}</th>
            <th>OVR</th>
            <th>POT</th>
            <th>{tr("УВЕРЕННОСТЬ", "CONFIDENCE")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {prospects.slice(0, 100).map((prospect, index) => {
            const player = prospect.player;
            const report = reports[player.id];
            const saved = shortlist.includes(player.id);
            return (
              <tr key={player.id}>
                <td className="draft-rank">{index + 1}</td>
                <td>
                  <button
                    className="prospect-name"
                    onClick={() => onShortlist(player.id)}
                  >
                    <i className={saved ? "saved" : ""}>★</i>
                    <span>
                      <b>{player.name}</b>
                      <small>
                        {player.age} · {player.nation} · {player.archetype}
                      </small>
                    </span>
                  </button>
                </td>
                <td>
                  <span className="position-pill">{player.pos}</span>
                </td>
                <td>{regionLabel(prospect.region, tr)}</td>
                <td className="scouted-value">{report.estimatedOvr}</td>
                <td className="potential-range">{range(report)}</td>
                <td>
                  <div className="confidence">
                    <i>
                      <em style={{ width: `${report.confidence}%` }} />
                    </i>
                    <b>{report.confidence}%</b>
                  </div>
                </td>
                <td>
                  {canPick ? (
                    <button
                      className="primary compact"
                      onClick={() => onPick(player.id)}
                    >
                      {tr("Выбрать", "Draft")}
                    </button>
                  ) : canScout ? (
                    <button
                      disabled={!scoutingPoints || report.confidence >= 100}
                      onClick={() => onScout(player.id)}
                    >
                      {tr("Изучить", "Scout")}
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Pipeline({
  players,
  tr,
}: {
  players: Game["teams"][number]["players"];
  tr: Translate;
}) {
  if (!players.length)
    return (
      <div className="draft-empty small">
        <h2>{tr("Система пока пуста", "Pipeline is empty")}</h2>
        <p>
          {tr(
            "Ваши выборы на драфте появятся здесь и будут развиваться между сезонами.",
            "Your draft picks will appear here and develop between seasons.",
          )}
        </p>
      </div>
    );
  return (
    <Panel title={tr("ПРОСПЕКТЫ С ПРАВАМИ КЛУБА", "CLUB-OWNED PROSPECTS")}>
      <div className="pipeline-grid">
        {[...players]
          .sort((a, b) => b.potential - a.potential)
          .map((player) => (
            <article key={player.id}>
              <span className="position-pill">{player.pos}</span>
              <small>
                {player.nation} · {player.age}
              </small>
              <h3>
                <PlayerLink player={player} />
              </h3>
              <p>{player.archetype}</p>
              <div>
                <b>
                  {player.ovr}
                  <small>OVR</small>
                </b>
                <b>
                  {player.potential}
                  <small>POT</small>
                </b>
              </div>
              <progress max="100" value={player.ovr} />
            </article>
          ))}
      </div>
    </Panel>
  );
}
