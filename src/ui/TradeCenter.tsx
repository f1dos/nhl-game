import {useState} from 'react';
import type {Game,Player} from '../engine/types';
import {evaluateTrade,executeTrade,tradeValue,payroll} from '../engine/trades';
import {Panel} from './components';
export default function TradeCenter({game,edit}:{game:Game;edit:(fn:(g:Game)=>void)=>void}){
 const [other,setOther]=useState(game.teams.find(t=>t.id!==game.user)!.id);
 const [give,setGive]=useState<string[]>([]),[take,setTake]=useState<string[]>([]);
 const a=game.teams.find(t=>t.id===game.user)!,b=game.teams.find(t=>t.id===other)!;
 const evaluation=evaluateTrade(game,other,give,take);
 const list=(players:Player[],selected:string[],set:(v:string[])=>void)=><table><thead><tr><th>Выбрать / Select</th><th>POS</th><th>OVR</th><th>AAV</th><th>Value</th></tr></thead><tbody>{players.map(p=><tr key={p.id}><td><label><input type="checkbox" checked={selected.includes(p.id)} onChange={()=>set(selected.includes(p.id)?selected.filter(id=>id!==p.id):[...selected,p.id])}/> {p.name}</label></td><td>{p.pos}</td><td>{p.ovr}</td><td>${p.salary}M</td><td>{tradeValue(p).toFixed(0)}</td></tr>)}</tbody></table>;
 return <><h1>Trade Center</h1><p>Обмены игроками · Player trades</p><select value={other} onChange={e=>{setOther(e.target.value);setTake([])}}>{game.teams.filter(t=>t.id!==game.user).map(t=><option key={t.id} value={t.id}>{t.city} {t.name}</option>)}</select><div className="overview-grid"><Panel title={`${a.id} · $${payroll(a.players).toFixed(2)}M`}>{list(a.players,give,setGive)}</Panel><Panel title={`${b.id} · $${payroll(b.players).toFixed(2)}M`}>{list(b.players,take,setTake)}</Panel></div><p role="status">{evaluation.reason}</p><button className="primary" disabled={!evaluation.accepted} onClick={()=>{edit(g=>executeTrade(g,other,give,take));setGive([]);setTake([])}}>Подтвердить обмен / Confirm trade</button><Panel title="История обменов / Trade history">{[...(game.transactions||[])].reverse().map((t,i)=><p key={i}>{t.year} · {t.message}</p>)}</Panel></>;
}
