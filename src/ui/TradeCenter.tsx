import { portraitUrl } from "./portrait";
import { counterOffer, marketBrief } from "../engine/careerDesk";
import clubMarks from "../assets/scoreboard-crests.json";
import { useState, type CSSProperties } from "react";
import { RequestBadge } from "./PlayerRequests";
import { Check, IdCard, Plus, Send, X } from "lucide-react";
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
import TeamPicker from "./TeamPicker";

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
  const [counter, setCounter] = useState<ReturnType<typeof counterOffer>>();
  const [pick, setPick] = useState<ReturnType<typeof counterOffer>>();
  const [quoted, setQuoted] = useState("");
  const signature = JSON.stringify([other, give, take, givePicks, takePicks]);
  const brief = marketBrief(game, partner);
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
                  className={`trade-player-card pos-${player.pos} ${selected.includes(player.id) ? "selected" : ""}`}
                  onClick={() => toggle(player.id, selected, setSelected)}
                >
                  <span className="trade-avatar" aria-hidden>
                    {portraitUrl(player) ? (
                      <img src={portraitUrl(player)} alt="" loading="lazy" />
                    ) : (
                      <i>{player.number || player.pos}</i>
                    )}
                    <em>{player.pos}</em>
                  </span>
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
        <TeamPicker
          ru={ru}
          teams={game.teams.filter((team) => team.id !== game.user)}
          value={other}
          onChange={(id) => {
            setOther(id);
            clear();
          }}
          extra={(team) => {
            const needs = (game.teamNeeds?.[team.id] ?? [])
              .map((need) => need.position)
              .slice(0, 3);
            const rec = `${team.record.w}-${team.record.l}-${team.record.otl}`;
            return needs.length
              ? `${rec} · ${tr("ищет", "needs")} ${needs.join("/")}`
              : rec;
          }}
        />
      </div>
      <section className="partner-sheet" style={{"--partner":partner.color} as CSSProperties}>
        <header className="partner-club">
          <img alt="" src={(clubMarks as Record<string,string>)[partner.id] ?? partner.logoUrl} width={72} height={72}/>
          <div><small>{tr("Партнёр по обмену","Trade partner")}</small>
            <h2><ClubLink team={partner}/></h2>
            <span>{partner.record.pts} {tr("очк.","PTS")} · {partner.record.gp} {tr("матч.","GP")} · {tr("Средний возраст","Average age")} {brief.age.toFixed(1)}</span>
          </div>
        </header>
        <div className="partner-priority"><small>{tr("Приоритет усиления","Target position")}</small>
          <h3><b>{brief.need.position}</b>{brief.youth ? tr("Молодой игрок","Developing player") : tr("Игрок основы","Immediate contributor")}</h3>
          <p>{brief.need.reason}</p>
          {(game.teamNeeds?.[other] ?? []).length > 1 && <p>{tr("Также ищут","Also seeking")} · {(game.teamNeeds?.[other] ?? []).filter(v=>v.position!==brief.need.position).map(v=>v.position).join(", ")}</p>}
        </div>
        <div className="partner-budget"><small>{tr("Свободно под потолком","Available cap space")}</small><strong>${brief.space.toFixed(2)}<em>M</em></strong>
          <meter aria-label={tr("Использовано под потолком","Cap used")} min={0} max={game.rules.cap} value={game.rules.cap-brief.space}/>
          <p>{tr("Потолок зарплат","Salary cap")} · ${game.rules.cap.toFixed(1)}M</p>
        </div>
        {rival && <p className="partner-rival">{rival.label} · {tr("Соперник потребует премию за обмен.","A rival will demand a premium.")}</p>}
          {(game.gmDiscussions ?? []).some((v) => v.club === other) && (
            <details>
              <summary>
                {tr("История переговоров", "Negotiation history")}
              </summary>
              {(game.gmDiscussions ?? [])
                .filter((v) => v.club === other)
                .slice(-5)
                .reverse()
                .map((v, i) => (
                  <p key={i}>
                    <b>
                      {v.date} ·{" "}
                      {v.accepted
                        ? tr("Согласовано", "Approved")
                        : tr("Отказ", "Declined")}
                    </b>
                    <br />
                    {v.offered.join(", ") || "—"} ⇄{" "}
                    {v.requested.join(", ") || "—"}
                  </p>
                ))}
            </details>
          )}
        {reply && quoted === signature && (
          <div
            className={`gm-reply ${evaluation.accepted ? "accepted" : "rejected"}`}
          >
            {evaluation.accepted ? <Check size={21}/> : <X size={21}/>}
            <div role="status"><b>{evaluation.accepted ? tr("Предложение принято","Offer accepted") : tr("Партнёр отклонил предложение","Offer declined")}</b><p>{evaluation.accepted ? tr("Условия согласованы. Обмен можно оформить.", "Terms agreed. The trade is ready to complete.") : reply}</p></div>
            {[counter, pick].map(
              (c, i) =>
                c && (
                  <button
                    key={i}
                    onClick={() => {
                      if (c.player) setGive([...give, c.player]);
                      else if (c.pick) setGivePicks([...givePicks, c.pick]);
                      setReply(undefined);
                    }}
                  >
                    {i
                      ? tr("Добавить пик", "Include pick")
                      : tr("Добавить игрока", "Include player")}{" "}
                    · {c.name}
                  </button>
                ),
            )}
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
              onClick={() => {
                setReply(evaluation.reason);
                setQuoted(signature);
                setCounter(
                  counterOffer(game, other, give, take, assets, "player"),
                );
                setPick(counterOffer(game, other, give, take, assets, "pick"));
                edit((g) => {
                  const log = (g.gmDiscussions ??= []);
                  const entry = {
                    club: other,
                    date: g.calendar?.date ?? String(g.year),
                    offered: outgoing,
                    requested: incoming,
                    accepted: evaluation.accepted,
                  };
                  if (JSON.stringify(log.at(-1)) !== JSON.stringify(entry))
                    log.push(entry);
                });
              }}
            >
              <Send size={15} /> {tr("Отправить GM", "Send to GM")}
            </button>
            <button
              disabled={!evaluation.accepted || !reply || quoted !== signature}
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
      <details className="agent-meeting">
        <summary>{tr("Обмены в этом сезоне","Trades this season")}</summary>
        {(game.transactions ?? []).filter(t=>t.year===game.year && t.kind==="trade").length
          ? (game.transactions ?? []).filter(t=>t.year===game.year && t.kind==="trade").slice().reverse().map((t,i)=>
            <p key={i}><time>{t.date ?? t.year}</time> · {t.message}</p>)
          : <p>{tr("В журнале пока нет зарегистрированных обменов.","No trades recorded in this log yet.")}</p>}
      </details>
      <p className="note">
        {tr(
          "Прямые денежные выплаты не используются как обычный актив NHL. Сделка проверяется на потолок зарплат, структуру составов и права на пики.",
          "Cash payments are not used as a regular NHL asset. The deal is checked against the salary cap, roster structure and pick ownership.",
        )}
      </p>
    </div>
  );
}
