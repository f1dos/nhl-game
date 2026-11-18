import { useState } from "react";
import { RequestBadge } from "./PlayerRequests";
import { Check, IdCard, MessageSquare, Plus, Send, X } from "lucide-react";
import type { Game, Player, Team } from "../engine/types";
import {
  evaluateTrade,
  executeTrade,
  payroll,
  tradeValue,
} from "../engine/trades";
import { rivalryBetween } from "../engine/franchiseWorld";
import { Rating } from "./components";
import { ClubLink, PlayerLink } from "./links";

type Edit = (fn: (game: Game) => void) => void;
type RosterTab = "nhl" | "ahl" | "picks";

export default function TradeCenter({
  game,
  edit,
}: {
  game: Game;
  edit: Edit;
}) {
  const [other, setOther] = useState(
    game.teams.find((team) => team.id !== game.user)!.id,
  );
  const [give, setGive] = useState<string[]>([]);
  const [take, setTake] = useState<string[]>([]);
  const [givePicks, setGivePicks] = useState<string[]>([]);
  const [takePicks, setTakePicks] = useState<string[]>([]);
  const [leftTab, setLeftTab] = useState<RosterTab>("nhl");
  const [rightTab, setRightTab] = useState<RosterTab>("nhl");
  const [reply, setReply] = useState<string>();
  const ru = game.language === "ru";
  const tr = (russian: string, english: string) => (ru ? russian : english);
  const user = game.teams.find((team) => team.id === game.user)!;
  const partner = game.teams.find((team) => team.id === other)!;
  const rival = rivalryBetween(game, game.user, other);
  const assets = { givePicks, takePicks };
  const evaluation = evaluateTrade(game, other, give, take, assets);
  const toggle = (
    id: string,
    selected: string[],
    setSelected: (value: string[]) => void,
  ) =>
    setSelected(
      selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id],
    );
  const clear = () => {
    setGive([]);
    setTake([]);
    setGivePicks([]);
    setTakePicks([]);
    setReply(undefined);
  };
  const selectedNames = (team: Team, ids: string[], pickIds: string[]) => [
    ...[...team.players, ...(team.farm ?? [])]
      .filter((player) => ids.includes(player.id))
      .map((player) => player.name),
    ...(game.draftAssets ?? [])
      .filter((pick) => pickIds.includes(pick.id))
      .map((pick) => `${pick.year} R${pick.round}`),
  ];
  const assetColumn = (
    team: Team,
    selected: string[],
    setSelected: (value: string[]) => void,
    pickSelected: string[],
    setPickSelected: (value: string[]) => void,
    tab: RosterTab,
    setTab: (value: RosterTab) => void,
  ) => {
    const players: Player[] = tab === "ahl" ? (team.farm ?? []) : team.players;
    const picks = (game.draftAssets ?? []).filter(
      (pick) => pick.currentTeam === team.id,
    );
    return (
      <section className="trade-assets-column">
        <header>
          <ClubLink team={team} crest={44}>
            {""}
          </ClubLink>
          <div>
            <b>
              <ClubLink team={team} />
            </b>
            <small>
              ${payroll(team.players).toFixed(1)}M / $
              {game.rules.cap.toFixed(1)}M
            </small>
          </div>
        </header>
        <nav>
          {(["nhl", "ahl", "picks"] as RosterTab[]).map((value) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
            >
              {value === "picks" ? tr("ДРАФТ", "PICKS") : value.toUpperCase()}{" "}
              <span>
                {value === "nhl"
                  ? team.players.length
                  : value === "ahl"
                    ? (team.farm?.length ?? 0)
                    : picks.length}
              </span>
            </button>
          ))}
        </nav>
        <div className="trade-asset-scroll">
          {tab === "picks"
            ? picks.map((pick) => (
                <button
                  key={pick.id}
                  className={`trade-pick-card ${pickSelected.includes(pick.id) ? "selected" : ""}`}
                  onClick={() => toggle(pick.id, pickSelected, setPickSelected)}
                >
                  <span>{pick.year}</span>
                  <b>{ru ? `${pick.round}-й раунд` : `Round ${pick.round}`}</b>
                  <small>
                    {pick.originalTeam} · value {pick.value}
                  </small>
                  {pickSelected.includes(pick.id) ? (
                    <Check size={15} />
                  ) : (
                    <Plus size={15} />
                  )}
                </button>
              ))
            : players.map((player) => (
                <button
                  key={player.id}
                  className={`trade-player-card ${selected.includes(player.id) ? "selected" : ""}`}
                  onClick={() => toggle(player.id, selected, setSelected)}
                >
                  <span className="trade-number">{player.number}</span>
                  <span>
                    <b>
                      {player.name}{" "}
                      <PlayerLink player={player} className="trade-card-link">
                        <IdCard size={13} />
                      </PlayerLink>
                    </b>
                    <small>
                      {player.pos} · {player.age} {tr("лет", "yrs")} · $
                      {player.salary}M
                      <RequestBadge game={game} playerId={player.id} />
                    </small>
                  </span>
                  <Rating value={player.ovr} />
                  <em>{tradeValue(player).toFixed(0)}</em>
                  {selected.includes(player.id) ? (
                    <Check size={15} />
                  ) : (
                    <Plus size={15} />
                  )}
                </button>
              ))}
        </div>
      </section>
    );
  };
  const outgoing = selectedNames(user, give, givePicks);
  const incoming = selectedNames(partner, take, takePicks);
  return (
    <div className="trade-workbench">
      <div className="page-intro">
        <div>
          <span className="eyebrow">TRADE DESK · GM-TO-GM</span>
          <h1>{tr("Переговорная по обменам", "Trade negotiation room")}</h1>
          <p>
            {tr(
              "Игроки NHL, активы фарма и драфт-пики в одном предложении.",
              "NHL players, farm assets and draft picks in a single offer.",
            )}
          </p>
        </div>
        <select
          value={other}
          onChange={(event) => {
            setOther(event.target.value);
            clear();
          }}
        >
          {game.teams
            .filter((team) => team.id !== game.user)
            .map((team) => (
              <option key={team.id} value={team.id}>
                {team.city} {team.name}
              </option>
            ))}
        </select>
      </div>
      <section className="trade-gm-room">
        <div className="gm-identity">
          <ClubLink team={partner} crest={52}>
            {""}
          </ClubLink>
          <div>
            <small>{tr("ЛИНИЯ СВЯЗИ ОТКРЫТА", "LINE OPEN")}</small>
            <b>
              {tr("Генеральный менеджер", "General manager")} · {partner.id}
            </b>
            <span>
              {tr("Ищет:", "Looking for:")}{" "}
              {(game.teamNeeds?.[other] ?? [])
                .map((need) => need.position)
                .join(", ") ||
                tr("лучший доступный актив", "best available asset")}
            </span>
          </div>
        </div>
        <div className="gm-dialogue">
          <MessageSquare size={18} />
          <p>
            {rival ? (
              <>
                <b>
                  {tr(
                    "Переговоры будут тяжёлыми.",
                    "This will be a tough negotiation.",
                  )}
                </b>{" "}
                {rival.label}:{" "}
                {tr(
                  "за сделку с принципиальным соперником потребуется существенная премия.",
                  "a deal with a rival will require a significant premium.",
                )}
              </>
            ) : (
              tr(
                "Покажите структуру предложения. Я оценю ценность, контрактный баланс и наши потребности.",
                "Show me the structure of the offer. I will weigh value, contract balance and our needs.",
              )
            )}
          </p>
        </div>
        {reply && (
          <div
            className={`gm-reply ${evaluation.accepted ? "accepted" : "rejected"}`}
          >
            <b>
              {evaluation.accepted
                ? tr("Предложение принято", "Offer accepted")
                : tr("GM отклонил предложение", "The GM rejected the offer")}
            </b>
            <span>{reply}</span>
          </div>
        )}
      </section>
      <div className="trade-builder">
        {assetColumn(
          user,
          give,
          setGive,
          givePicks,
          setGivePicks,
          leftTab,
          setLeftTab,
        )}
        <section className="trade-offer-card">
          <header>
            <small>{tr("ТЕКУЩЕЕ ПРЕДЛОЖЕНИЕ", "CURRENT OFFER")}</small>
            <button aria-label="Clear trade" onClick={clear}>
              <X size={16} />
            </button>
          </header>
          <div>
            <span>
              {user.id} {tr("ОТДАЁТ", "SEND")}
            </span>
            {outgoing.length ? (
              outgoing.map((name) => <b key={name}>{name}</b>)
            ) : (
              <i>{tr("Активы не выбраны", "No assets selected")}</i>
            )}
          </div>
          <hr />
          <div>
            <span>
              {partner.id} {tr("ОТДАЁТ", "SEND")}
            </span>
            {incoming.length ? (
              incoming.map((name) => <b key={name}>{name}</b>)
            ) : (
              <i>{tr("Активы не выбраны", "No assets selected")}</i>
            )}
          </div>
          <footer>
            <button
              className="primary"
              disabled={!outgoing.length || !incoming.length}
              onClick={() => setReply(evaluation.reason)}
            >
              <Send size={15} /> {tr("Отправить GM", "Send to GM")}
            </button>
            <button
              disabled={!evaluation.accepted || !reply}
              onClick={() => {
                edit((current) =>
                  executeTrade(current, other, give, take, assets),
                );
                clear();
              }}
            >
              {tr("Оформить сделку", "Complete trade")}
            </button>
          </footer>
        </section>
        {assetColumn(
          partner,
          take,
          setTake,
          takePicks,
          setTakePicks,
          rightTab,
          setRightTab,
        )}
      </div>
      <p className="note">
        {tr(
          "Прямые денежные выплаты не используются как обычный актив NHL. Сделка проверяется на потолок зарплат, структуру составов и права на пики.",
          "Cash payments are not used as a regular NHL asset. The deal is checked against the salary cap, roster structure and pick ownership.",
        )}
      </p>
    </div>
  );
}
