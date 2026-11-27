import type { Game } from "../engine/types";
import { LOTTERY_WEIGHTS, openDraft } from "../engine/draft";
import marks from "../assets/scoreboard-crests.json";
const logos: Record<string,string> = marks;

export default function DraftLottery({game,edit}:{game:Game;edit:(fn:(g:Game)=>void)=>void}) {
  const draft=game.draft!, draw=draft.lottery!, stage=draw.revealed;
  const t=(ru:string,en:string)=>game.language==="ru"?ru:en;
  const team=(id:string)=>game.teams.find(c=>c.id===id)!;
  const holder=(id:string)=>game.draftAssets?.find(p=>p.year===draft.year && p.round===1 && p.originalTeam===id)?.currentTeam ?? id;
  return <section className="draft-lottery">
    <header><p>NHL ENTRY DRAFT · {draft.year}</p><h1>{t("Драфт-лотерея","Draft lottery")}</h1>
    <span>{t("16 клубов вне плей-офф. Два розыгрыша. Подъём до десяти позиций.","16 non-playoff clubs. Two draws. A jump of up to ten places.")}</span></header>
    <div className="lottery-stage" aria-live="polite">{draw.winners.map((id,i)=>{
      const club=team(holder(id));
      return <article key={i} data-open={i<stage}><small>{t("РОЗЫГРЫШ","DRAW")} 0{i+1}</small>
        {i<stage ? <><img width={62} height={62} src={logos[club.id]} alt={club.id}/><h2>{club.name}</h2><span>#{draw.seeds.indexOf(id)+1} → #{draw.order.indexOf(id)+1}{club.id!==id && " · "+id}</span></> :
        <><b aria-hidden="true">?</b><span>{t("Результат закрыт","Awaiting reveal")}</span></>}</article>;
    })}</div>
    <button className="primary" onClick={()=>edit(g=>{
      if(g.draft?.status!=="scouting" || !g.draft.lottery) return;
      if(g.draft.lottery.revealed<2) g.draft.lottery.revealed++; else openDraft(g);
    })}>{stage===2?t("Открыть драфт","Open draft"):stage===0?t("Открыть первый конверт","Reveal first draw"):t("Открыть второй конверт","Reveal second draw")}</button>
    <h2>{stage===2?t("Порядок первого раунда","First-round order"):t("Участники жеребьёвки","Lottery field")}</h2>
    <div className="lottery-grid">{(stage===2?draw.order:draw.seeds).slice(0,16).map((id,i)=>{
      const club=team(holder(id));
      return <div key={id} data-own={club.id===game.user}><b>{String(i+1).padStart(2,"0")}</b><img width={26} height={26} src={logos[club.id]} alt=""/><span>{club.name}{club.id!==id && <small>{t("Право выбора","Pick from")} · {id}</small>}</span>
        <strong>{stage===2 ? "#"+(draw.seeds.indexOf(id)+1)+" → #"+(i+1) : (LOTTERY_WEIGHTS[i]/10)+"%"}</strong></div>;
    })}</div>
    {stage<2 && <small>{t("Процент показывает шанс выиграть первый розыгрыш.","Percentages show the chance of winning the first draw.")}</small>}
  </section>;
}
