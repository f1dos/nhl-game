import {useState} from 'react';
import type {Game,Player} from '../engine/types';
import {askingSalary,salaryTotal,signContract} from '../engine/contracts';
import {Panel} from './components';
export default function ContractCenter({game,edit}:{game:Game;edit:(fn:(g:Game)=>void)=>void}){
 const team=game.teams.find(t=>t.id===game.user)!;
 const [selected,setSelected]=useState<string>('');
 const [years,setYears]=useState(2),[salary,setSalary]=useState(1);
 const [message,setMessage]=useState('');
 const ru=game.language==='ru';
 const players=[...team.players.filter(p=>p.years===1),...(game.freeAgents||[])];
 const player=players.find(p=>p.id===selected);
 const choose=(p:Player)=>{setSelected(p.id);setSalary(askingSalary(p));setMessage('');};
 return <><h1>{ru?'Контракты и свободные агенты':'Contracts & free agency'}</h1>
 <p>{ru?'Демонстрационные правила: 1–7 лет, минимум $0.8M, максимум 20% потолка на игрока.':'Demo rules: 1–7 years, $0.8M minimum, 20% of cap per player maximum.'}</p>
 <p>{team.id} · ${salaryTotal(team).toFixed(2)}M / ${game.rules.cap}M</p>
 <Panel title={ru?'Переговоры':'Negotiations'}><div className="settings-actions">
 <select aria-label="Contract player" value={selected} onChange={e=>{const p=players.find(p=>p.id===e.target.value);if(p)choose(p);}}><option value="">{ru?'Выберите игрока':'Choose player'}</option>{players.map(p=><option key={p.id} value={p.id}>{p.name} · {p.pos} · {p.ovr} OVR</option>)}</select>
 <label>{ru?'Лет':'Years'} <input aria-label="Contract years" type="number" min="1" max="7" value={years} onChange={e=>setYears(+e.target.value)}/></label>
 <label>AAV $M <input aria-label="Contract salary" type="number" min="0.8" step="0.05" value={salary} onChange={e=>setSalary(+e.target.value)}/></label>
 <button disabled={!player} onClick={()=>{if(!player)return;const preview=structuredClone(game);try{signContract(preview,game.user,player.id,years,salary);edit(g=>signContract(g,g.user,player.id,years,salary));setMessage(ru?'Контракт подписан':'Contract signed');setSelected('');}catch(e){setMessage((e as Error).message);}}}>{ru?'Предложить контракт':'Offer contract'}</button>
 </div><p role="status">{message}</p>{player&&<p>{ru?'Требование':'Asking price'}: ${askingSalary(player).toFixed(2)}M · {ru?'Общая сумма':'Total'}: ${(years*salary).toFixed(2)}M</p>}</Panel>
 <Panel title={ru?'Истекающие соглашения и рынок':'Expiring deals & market'}><div className="table-scroll"><table><thead><tr><th>PLAYER</th><th>POS</th><th>AGE</th><th>OVR</th><th>AAV</th><th>STATUS</th></tr></thead><tbody>{players.map(p=><tr key={p.id} onClick={()=>choose(p)}><td><button onClick={()=>choose(p)}>{p.name}</button></td><td>{p.pos}</td><td>{p.age}</td><td>{p.ovr}</td><td>${askingSalary(p).toFixed(2)}M</td><td>{team.players.includes(p)?'EXPIRING':'FREE AGENT'}</td></tr>)}</tbody></table></div></Panel>
 <Panel title={ru?'История контрактов':'Contract history'}>{(game.contractHistory||[]).slice(-40).reverse().map((h,i)=><p key={i}>{h.year} · {h.team} · {h.player} · {h.years} yr / ${h.salary}M</p>)}</Panel>
 <p>{ru?'Продления применяются сразу. При смене сезона помощник автоматически заполняет минимальный состав всех клубов, включая ваш. UFA/RFA и полная CBA-модель ещё не реализованы.':'Renewals apply immediately. At rollover an assistant fills the minimum roster for every club, including yours. UFA/RFA and full CBA rules are not implemented.'}</p></>;
}
