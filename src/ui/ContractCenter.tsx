import { useState } from "react";
import type { Game, Player } from "../engine/types";
import { askingSalary, salaryTotal, signContract } from "../engine/contracts";
import { advanceDay, ensureManagementState } from "../engine/management";
import {
  OFFER_ROLES, desiredFreeAgentRole, desiredFreeAgentYears, freeAgentInterest,
  proposeFreeAgentContract, withdrawFreeAgentOffer,
  type PromisedRole, type FreeAgentOffer,
} from "../engine/freeAgency";
import { Panel } from "./components";
import InternationalMarket from "./InternationalMarket";

export default function ContractCenter({
  game,
  edit,
}: {
  game: Game;
  edit: (fn: (g: Game) => void) => void;
}) {
  const team = game.teams.find((t) => t.id === game.user)!;
  const [selected, setSelected] = useState("");
  const [years, setYears] = useState(2);
  const [salary, setSalary] = useState(1);
  const [message, setMessage] = useState("");
  const [role, setRole] = useState<PromisedRole>("middle-six");
  const ru = game.language === "ru";
  ensureManagementState(game);
  const market = [
    ...team.players.filter((p) => p.years === 1),
    ...(game.freeAgents || []),
  ];
  const player = market.find((p) => p.id === selected);
  const choose = (p: Player) => {
    setSelected(p.id);
    setSalary(askingSalary(p, game, game.user));
    setYears(team.players.some(member => member.id === p.id) ? 2 : desiredFreeAgentYears(p));
    setRole(desiredFreeAgentRole(p));
    setMessage("");
  };
  const roster = [...team.players, ...(team.farm ?? [])];
  const renewing = !!player && team.players.some(p=>p.id===player.id);
  const offers = [...(game.freeAgentOffers ?? [])].filter(o=>o.teamId===game.user).reverse();
  const latest = offers.find(o => o.playerId===selected && ["pending","countered"].includes(o.status));
  const activeCount = offers.filter(o => o.status==="pending").length;
  const ruStatus: Record<FreeAgentOffer["status"], [string,string]> = {
    pending:["На рассмотрении","Under review"],countered:["Встречное предложение","Counteroffer"],
    accepted:["Подписан","Signed"],rejected:["Отказ","Declined"],
    "signed-elsewhere":["Подписал другой клуб","Signed elsewhere"],
    withdrawn:["Отозвано","Withdrawn"],expired:["Истекло","Expired"],
  };
  const offerName = (offer: FreeAgentOffer) => {
    const p = market.find(x=>x.id===offer.playerId) ??
      team.players.find(x=>x.id===offer.playerId) ??
      game.teams.flatMap(x=>x.players).find(x=>x.id===offer.playerId);
    return p?.name ?? offer.playerId;
  };
  const agentExplanation = (offer: FreeAgentOffer) => {
    const map: Record<string,[string,string]> = {
      reviewing:["Агент рассматривает условия и интерес других клубов.","Agent is evaluating the terms and competing interest."],
      salary:["Агент просит увеличить зарплату.","The agent requests a higher salary."],
      role:["Игрок хочет более значимую роль в команде.","The player wants a more prominent role."],
      term:["Игрок рассчитывает на более долгий контракт.","The player requests a longer agreement."],
      "club-fit":["Игрок не видит клуб подходящим для своей карьеры.","The player does not see your club as the right career fit."],
      accepted:["Соглашение зарегистрировано. Хоккеист перешёл в клуб.","The contract is signed and the player joined your roster."],
      competitor:["Другой клуб убедил игрока принять его предложение.","A competing club convinced the player to sign elsewhere."],
      cap:["Невозможно завершить сделку из-за ограничений состава или потолка.","The roster or cap restrictions blocked the signing."],
      unavailable:["Игрок больше не является свободным агентом.","The player is no longer available."],
      withdrawn:["Предложение отозвано.","The offer was withdrawn."],
      expired:["Срок действия встречного предложения закончился.","The counteroffer expired."],
    };
    return (map[offer.agentResponse] ?? map.reviewing)[ru?0:1];
  };
  const verified = roster.filter(
    (p) => p.contractSource === "puckpedia",
  ).length;
  return (
    <>
      <h1>{ru ? "Контракты и свободные агенты" : "Contracts & free agency"}</h1>
      <p>
        {ru
          ? "AAV — стоимость одного сезона. Общая сумма — оставшееся обязательство с сезона 2026/27, а не историческая начальная стоимость сделки."
          : "AAV is the annual cost. Total is the remaining commitment from 2026/27, not the original historical contract value."}
      </p>
      <div className="metrics">
        <div className="metric">
          <small>PAYROLL</small>
          <b>${salaryTotal(team).toFixed(2)}M</b>
        </div>
        <div className="metric">
          <small>{ru ? "ПРОВЕРЕНО" : "VERIFIED"}</small>
          <b>
            {verified}/{roster.length}
          </b>
        </div>
        <div className="metric">
          <small>CAP SPACE</small>
          <b>${(game.rules.cap - salaryTotal(team)).toFixed(2)}M</b>
        </div>
      </div>
      <Panel title={ru ? "КОНТРАКТНЫЕ ПЕРЕГОВОРЫ" : "CONTRACT NEGOTIATIONS"}>
        <p className="free-agent-intro">{ru
          ? "Продления контрактов текущих игроков сохраняют прежнюю модель. Предложения свободным агентам теперь проходят через реальный игровой календарь: они могут отказать, выдвинуть встречные условия или выбрать другой клуб."
          : "Current-player extensions retain the existing rules. Free-agent offers now progress through the game calendar: players can decline, counter, or choose another club."}</p>
        <div className="free-agent-form">
          <label>
            <span>{ru ? "ХОККЕИСТ" : "PLAYER"}</span>
            <select aria-label="Contract player" value={selected} onChange={(e) => {
              const p = market.find(p=>p.id===e.target.value);
              if (p) choose(p); else setSelected("");
            }}>
              <option value="">{ru ? "Выберите игрока" : "Choose player"}</option>
              <optgroup label={ru ? "Продления" : "Extensions"}>
                {team.players.filter(p=>p.years===1).map(p=>
                  <option key={p.id} value={p.id}>{p.name} · {p.pos} · {p.ovr} OVR</option>)}
              </optgroup>
              <optgroup label={ru ? "Свободные агенты" : "Free agents"}>
                {(game.freeAgents ?? []).map(p=>
                  <option key={p.id} value={p.id}>{p.name} · {p.pos} · {p.ovr} OVR</option>)}
              </optgroup>
            </select>
          </label>
          <label>
            <span>{ru ? "ЛЕТ" : "YEARS"}</span>
            <input aria-label="Contract years" type="number" min="1" max="7"
              value={years} onChange={e=>setYears(+e.target.value)}/>
          </label>
          <label>
            <span>AAV · $M</span>
            <input aria-label="Contract salary" type="number" min="0.8" step="0.05"
              value={salary} onChange={e=>setSalary(+e.target.value)}/>
          </label>
          {!renewing && <label>
            <span>{ru ? "ОБЕЩАННАЯ РОЛЬ" : "PROMISED ROLE"}</span>
            <select aria-label="Promised player role" value={role}
              onChange={e=>setRole(e.target.value as PromisedRole)}>
              {OFFER_ROLES.map(key=><option key={key} value={key}>{key.toUpperCase()}</option>)}
            </select>
          </label>}
        </div>
        {player && <div className="free-agent-expectations">
          <span>{ru ? "Запрос по зарплате" : "Asking AAV"}: <b>${askingSalary(player, game, game.user).toFixed(2)}M</b></span>
          <span>{ru ? "Желаемый срок" : "Desired term"}: <b>{desiredFreeAgentYears(player)} {ru ? "г." : "yrs"}</b></span>
          {!renewing && <>
            <span>{ru ? "Желаемая роль" : "Preferred role"}: <b>{desiredFreeAgentRole(player)}</b></span>
            <span>{ru ? "Интерес к клубу" : "Club interest"}: <b>{freeAgentInterest(game, player, team)}/100</b></span>
          </>}
        </div>}
        {latest && <div className="free-agent-response">
          <strong>{ruStatus[latest.status][ru?0:1]} · {offerName(latest)}</strong>
          <p>{agentExplanation(latest)}</p>
          {latest.status==="pending" && <p>{ru ? "Ожидаемый ответ" : "Expected decision"}: {latest.decisionDate}</p>}
          {latest.status==="countered" && <div className="free-agent-counter">
            <span>${latest.counterSalary?.toFixed(2)}M · {latest.counterYears} {ru ? "лет" : "years"} · {latest.counterRole}</span>
            <button onClick={()=>{
              setSalary(latest.counterSalary ?? salary);
              setYears(latest.counterYears ?? years);
              setRole(latest.counterRole ?? role);
              setMessage(ru?"Условия агента подставлены. Отправь новое предложение.":"Counter terms loaded. Submit a revised offer.");
            }}>{ru ? "Использовать условия агента" : "Use agent's terms"}</button>
          </div>}
        </div>}
        <div className="free-agent-actions">
          <button disabled={!player || latest?.status==="pending"}
            onClick={()=>{
              if(!player) return;
              try{
                const preview=structuredClone(game);
                if(renewing) signContract(preview, game.user, player.id, years, salary);
                else proposeFreeAgentContract(preview, player.id, years, salary, role);
                edit(g=>{
                  if(renewing) signContract(g,g.user,player.id,years,salary);
                  else proposeFreeAgentContract(g,player.id,years,salary,role);
                });
                setMessage(renewing
                  ? (ru?"Контракт подписан":"Contract signed")
                  : (ru?"Предложение отправлено агенту. Ответ поступит через несколько игровых дней.":"Offer sent to the agent. Expect an answer in a few in-game days."));
                if(renewing)setSelected("");
              }catch(e){setMessage((e as Error).message);}
            }}>
            {renewing
              ? (ru?"Предложить контракт":"Offer contract")
              : (ru?"Отправить предложение агенту":"Submit offer to agent")}
          </button>
          {latest && ["pending","countered"].includes(latest.status) &&
            <button onClick={()=>{edit(g=>withdrawFreeAgentOffer(g,latest.id));setMessage(ru?"Предложение отозвано":"Offer withdrawn");}}>
              {ru?"Отозвать":"Withdraw"}
            </button>}
          {activeCount>0 && <button className="free-agent-next-day"
              onClick={()=>edit(g=>advanceDay(g))}>
            {ru?"Следующий день →":"Advance one day →"}
          </button>}
        </div>
        <p role="status">{message}</p>
      </Panel>
      <Panel title={ru ? "ПЕРЕПИСКА С АГЕНТАМИ" : "AGENT CORRESPONDENCE"}>
        <div className="free-agent-history">
          {offers.length ? offers.slice(0,35).map(offer=><div key={offer.id} className="free-agent-history-row">
            <div>
              <strong>{offerName(offer)}</strong>
              <small>{offer.submittedDate} · ${offer.salary.toFixed(2)}M / {offer.years} {ru?"г.":"yrs"} · {offer.role}</small>
              <p>{agentExplanation(offer)}</p>
              {offer.competingTeamId && <small>{ru?"Выбрал клуб":"Joined"}: {offer.competingTeamId}</small>}
            </div>
            <div className="free-agent-history-controls">
              <span className={`agent-status ${offer.status}`}>{ruStatus[offer.status][ru?0:1]}</span>
              {offer.status==="countered" && market.some(p=>p.id===offer.playerId) &&
                <button onClick={()=>{
                  const p=market.find(x=>x.id===offer.playerId)!;
                  choose(p);
                  setYears(offer.counterYears??p.years);
                  setSalary(offer.counterSalary??askingSalary(p,game,game.user));
                  setRole(offer.counterRole??desiredFreeAgentRole(p));
                }}>{ru?"Ответить":"Respond"}</button>}
            </div>
          </div>)
          : <p className="note">{ru?"Пока нет предложений. Начните переговоры с доступным свободным агентом.":"No offers yet. Select an available free agent to start negotiating."}</p>}
        </div>
      </Panel>
      <Panel title={ru ? "Контракты организации" : "Organization contracts"}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>PLAYER</th>
                <th>POS</th>
                <th>AAV</th>
                <th>{ru ? "ОСТАЛОСЬ" : "LEFT"}</th>
                <th>{ru ? "ОСТАТОК" : "REMAINING"}</th>
                <th>{ru ? "ИСТЕКАЕТ" : "EXPIRY"}</th>
                <th>{ru ? "ИСТОЧНИК" : "SOURCE"}</th>
              </tr>
            </thead>
            <tbody>
              {roster
                .sort((a, b) => b.salary - a.salary)
                .map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.pos}</td>
                    <td>${p.salary.toFixed(2)}M</td>
                    <td>{p.years}</td>
                    <td>
                      $
                      {(p.contractRemainingValue ?? p.salary * p.years).toFixed(
                        2,
                      )}
                      M
                    </td>
                    <td>
                      {p.contractExpiryYear ?? game.year + p.years}{" "}
                      {p.contractStatus ?? "—"}
                    </td>
                    <td>
                      <span
                        className={
                          p.contractSource === "puckpedia"
                            ? "source-badge verified"
                            : "source-badge"
                        }
                      >
                        {p.contractSource === "puckpedia"
                          ? "PUCKPEDIA"
                          : ru
                            ? "ИГРОВОЙ"
                            : "GAME"}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <InternationalMarket game={game} edit={edit} />
      <Panel title={ru ? "История контрактов" : "Contract history"}>
        {(game.contractHistory || [])
          .slice(-40)
          .reverse()
          .map((h, i) => (
            <p key={i}>
              {h.year} · {h.team} · {h.player} · {h.years} yr / ${h.salary}M AAV
            </p>
          ))}
      </Panel>
      <p className="note">
        {ru
          ? "Источник проверенных значений: публичные таблицы PuckPedia. Покрытие стартовых составов лиги — 766 из 794 (96,5%). Несовпавшие и будущие сделки помечены как игровые. Удержание зарплаты и полная CBA-модель пока не реализованы."
          : "Verified values use public PuckPedia tables. Opening-roster coverage is 766 of 794 (96.5%). Unmatched and future deals are marked as game-generated. Salary retention and full CBA rules are not modeled yet."}
      </p>
    </>
  );
}
