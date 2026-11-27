import { useMemo, useState } from "react";
import type { Game, Player } from "../engine/types";
import { askingSalary } from "../engine/contracts";
import { PlayerLink } from "./links";
import { formatPotential, scoutedPotentialFor } from "../engine/potential";

const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
type Entry = { player: Player; club: string; level: string };

export default function PlayerDirectory({ game, onNegotiate }: {
  game: Game;
  onNegotiate?: (player: Player) => void;
}) {
  const ru = game.language === "ru";
  const tr = (r: string, e: string) => ru ? r : e;
  const [query,setQuery] = useState("");
  const [position,setPosition] = useState("");
  const [level,setLevel] = useState("");
  const [order,setOrder] = useState("rating");
  const [limit,setLimit] = useState(25);
  const market = !!onNegotiate;
  const rows = useMemo(() => {
    const entries = new Map<string,Entry>();
    function add(players: Player[] | undefined, club: string, level: string) {
      for (const player of players ?? []) if (!entries.has(player.id)) entries.set(player.id,{player,club,level});
    }
    if (!market) for (const team of game.teams) {
      add(team.players,`${team.id} · ${team.name}`,"NHL");
      add(team.farm,team.name,"AHL");
      add(team.prospects,team.name,"RES");
    }
    add(game.freeAgents,"","UFA");
    if (!market) {
      for (const entry of game.internationalMarket ?? []) add([entry.player],entry.club,entry.league);
      for (const entry of game.draft?.prospects ?? []) if (!entry.draftedBy) add([entry.player],"","DRAFT");
      add(game.juniorPlayers,"","JR");
    }
    return [...entries.values()];
  },[game,market]);
  const levels = [...new Set(rows.map(x=>x.level))];
  const needle = normalize(query);
  const filtered = rows.filter(({player:p,club,level:league}) =>
    (!level || league === level) && (!position || p.pos === position) &&
    normalize([p.name,club,league,p.nation].join(" ")).includes(needle));
  const cost = (p:Player) => market ? askingSalary(p,game,game.user) : p.salary;
  filtered.sort((a,b) => (order === "age" ? a.player.age-b.player.age :
    order === "salary" ? cost(a.player)-cost(b.player) : b.player.ovr-a.player.ovr) || a.player.name.localeCompare(b.player.name));
  function change(set:(v:string)=>void,v:string) {set(v);setLimit(25)}
  return <section className="player-directory">
    {market ? <h2>{tr("Рынок свободных агентов","Free agent market")}</h2> : <h1>{tr("Поиск игроков","Player search")}</h1>}
    <div className="directory-tools">
      <label>{tr("Поиск","Search")}<input type="search" value={query} placeholder={tr("Фамилия, клуб или страна","Name, club or country")} onChange={e=>change(setQuery,e.target.value)}/></label>
      <label>{tr("Позиция","Position")}<select value={position} onChange={e=>change(setPosition,e.target.value)}><option value="">{tr("Все позиции","All positions")}</option>{["C","LW","RW","D","G"].map(v=><option key={v}>{v}</option>)}</select></label>
      {!market && <label>{tr("Лига / статус","League / status")}<select value={level} onChange={e=>change(setLevel,e.target.value)}><option value="">{tr("Весь мир","Worldwide")}</option>{levels.map(v=><option key={v}>{v}</option>)}</select></label>}
      <label>{tr("Сортировка","Sort by")}<select value={order} onChange={e=>change(setOrder,e.target.value)}><option value="rating">{tr("Сильнейшие","Highest rating")}</option><option value="age">{tr("Самые молодые","Youngest")}</option><option value="salary">{tr("По зарплате ↑","Lowest salary")}</option></select></label>
    </div>
    <p aria-live="polite">{tr("Найдено игроков","Players found")} · {filtered.length}</p>
    {!!filtered.length && <div className="table-scroll"><table><thead><tr><th>{tr("Хоккеист","Player")}</th><th>{tr("Возраст","Age")}</th><th>OVR</th><th>{tr("Потенциал","Potential")}</th><th>{market ? tr("Запрос / год","Asking AAV") : tr("Клуб / статус","Club / status")}</th>{market && <th/>}</tr></thead><tbody>
      {filtered.slice(0,limit).map(({player:p,club,level})=><tr key={p.id}><td><small>{p.pos}</small> <PlayerLink player={p}/></td><td>{p.age}</td><td><b>{p.ovr}</b></td><td>{formatPotential(scoutedPotentialFor(game,p))}</td><td>{market ? "$"+cost(p).toFixed(2)+"M" : [club,level].filter(Boolean).join(" · ")}</td>{market && <td><button onClick={()=>onNegotiate?.(p)}>{tr("Переговоры","Negotiate")}</button></td>}</tr>)}
    </tbody></table></div>}
    {filtered.length>limit && <button onClick={()=>setLimit(limit+25)}>{tr("Показать ещё","Show more")}</button>}
  </section>;
}
