import {DevelopmentDesk} from "./CareerDesk";
import { useState } from "react";
import { callUpFromFarm, sendToFarm } from "../engine/roster";
import { salaryTotal } from "../engine/contracts";
import type { Game, Player } from "../engine/types";
import { Panel, Rating } from "./components";
import { PotentialCell, PotentialLegend, potentialSortValue } from "./Potential";
import Select from "./Select";

export default function FarmCenter({
  game, edit, onPlayer,
}: { game: Game; edit: (fn: (game: Game) => void) => void; onPlayer: (player: Player) => void; }) {
  const ru = game.language === "ru";
  const team = game.teams.find((t) => t.id === game.user)!;
  const farm = team.farm ?? [];
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("ALL");
  const [sort, setSort] = useState<"ovr" | "potential" | "age">("ovr");
  const visible = farm.filter((p) =>
    (position === "ALL" || p.pos === position) &&
    (p.name + " " + (p.currentClub || "")).toLowerCase().includes(query.toLowerCase()),
  ).sort((a, b) => sort === "potential" ? potentialSortValue(game, b) - potentialSortValue(game, a) :
    sort === "age" ? a.age - b.age : b.ovr - a.ovr);

  return <section className="farm-below-roster">
    <div className="farm-heading">
      <div><span className="eyebrow">AHL · FARM SYSTEM</span>
        <h2>{ru ? "Фарм-клуб и резерв" : "AHL affiliate & reserve"}</h2>
        <p>{team.ahlAffiliate ?? (ru ? "Организационный резерв" : "Organizational reserve")} · {farm.length} {ru ? "игроков" : "players"}</p>
      </div>
      <div className="farm-finance"><span>{ru ? "ПОТОЛОК NHL" : "NHL CAP"}</span><b>${salaryTotal(team).toFixed(1)}M / ${game.rules.cap.toFixed(1)}M</b></div>
    </div>
    <DevelopmentDesk game={game} edit={edit}/>
    <Panel title={ru ? "ИГРОКИ AHL И ОРГАНИЗАЦИОННОГО РЕЗЕРВА" : "AHL & ORGANIZATIONAL RESERVE"}>
      <div className="scout-league-filters">
        <input aria-label="Farm player search" placeholder={ru ? "Поиск по фарму…" : "Search farm…"} value={query} onChange={(e) => setQuery(e.target.value)}/>
        <Select aria-label="Farm position" value={position} onChange={(e) => setPosition(e.target.value)}>
          <option value="ALL">{ru ? "Все позиции" : "All positions"}</option>
          {["LW","C","RW","D","G"].map((p) => <option key={p}>{p}</option>)}
        </Select>
        <Select aria-label="Farm sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="ovr">OVR ↓</option><option value="potential">POT ↓</option>
          <option value="age">{ru ? "Возраст ↑" : "Age ↑"}</option>
        </Select>
      </div>
      {farm.length ? <div className="table-scroll"><table className="organization-table">
        <thead><tr><th>#</th><th>{ru ? "ИГРОК" : "PLAYER"}</th><th>POS</th><th>{ru ? "ВОЗР." : "AGE"}</th><th>OVR</th><th>POT</th><th>{ru ? "КЛУБ / КОНТРАКТ" : "CLUB / CONTRACT"}</th><th /></tr></thead>
        <tbody>{visible.map((p) => <tr key={p.id}>
          <td>{p.number}</td><td><button className="identity-cell" onClick={() => onPlayer(p)}>
            {p.headshot && <img src={p.headshot} alt="" />}
            <span><b>{p.name}</b><small>{p.nation} · {p.archetype || p.league || ""}</small></span>
          </button></td><td><span className="position-pill">{p.pos}</span></td>
          <td>{p.age}</td><td><Rating value={p.ovr}/></td><td><PotentialCell player={p} game={game} compact /></td>
          <td>{p.currentClub || team.ahlAffiliate || "—"}<small>{p.contractType || "NHL"}</small></td>
          <td><button disabled={p.contractType === "AHL"} title={p.contractType === "AHL"
              ? (ru ? "Требуется контракт NHL/ELC" : "Requires an NHL/ELC deal") : ""}
              onClick={() => edit((g) => callUpFromFarm(g, p.id))}>
              {p.contractType === "AHL" ? (ru ? "Нужен контракт" : "NHL contract") : (ru ? "Вызвать" : "Recall")}
          </button></td></tr>)}</tbody>
      </table><PotentialLegend ru={ru} /></div> : <div className="empty compact-empty">{ru ? "Нет хоккеистов в резерве" : "No farm players"}</div>}
    </Panel>
    <p className="note">{ru
      ? "Вызов игрока с контрактом только AHL ограничен. Юниорские OHL/WHL/USHL и европейские SHL/Liiga находятся в отдельной вкладке «Юниоры и лиги»."
      : "AHL-only contracts are not eligible for NHL recall. Browse OHL/WHL/USHL and SHL/Liiga under Junior & European leagues."}</p>
  </section>;
}
