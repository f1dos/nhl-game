import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const target = new URL("../src/data/scouting-leagues-2026-27.ts", import.meta.url);
const season = "2026/27";
const leagues = ["WHL", "USHL", "SHL", "Liiga"];
const config = {
  WHL: { client: "whl", key: "f1aa699db3d81487", leagueId: 7, siteId: 0 },
  USHL: { client: "ushl", key: "e828f89b243dc43f", leagueId: 1, siteId: 0 },
};
const sources = {
  WHL: "HockeyTech — Western Hockey League",
  USHL: "HockeyTech — United States Hockey League",
  SHL: "SHL official statistics",
  Liiga: "Liiga official API",
};
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const norm = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const number = (x) => Number(String(x ?? "").replace(/,/g, "")) || 0;
const idHash = (s) => [...String(s)].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const position = (v) => {
  const p = String(v?.code ?? v?.name ?? v ?? "C").toUpperCase();
  if (p === "G" || p === "GK" || p.includes("GOAL") || p.includes("MÅLVAKT") || p === "MV") return "G";
  if (p === "D" || p.includes("DEF") || p === "B" || p.includes("BACK")) return "D";
  if (p === "LW" || p.includes("LEFT_WING") || p === "VL") return "LW";
  if (p === "RW" || p.includes("RIGHT_WING") || p === "OL") return "RW";
  return "C";
};
const age = (dob) => {
  if (!dob) return 0;
  const d = new Date(dob);
  if (!Number.isFinite(d.getTime())) return 0;
  const at = new Date("2026-10-01T12:00:00Z");
  let years = at.getUTCFullYear() - d.getUTCFullYear();
  if (at.getUTCMonth() < d.getUTCMonth() || at.getUTCMonth() === d.getUTCMonth() && at.getUTCDate() < d.getUTCDate()) years--;
  return clamp(years, 15, 50);
};
const fetchText = (url) => execFileSync("curl", [
  "--location","--compressed","--fail","--silent","--show-error",
  "--connect-timeout","12","--max-time","35",
  "--user-agent","Mozilla/5.0 (compatible; NHLManager26/0.6; open roster sync)",
  url
], {encoding:"utf8",maxBuffer:35_000_000});
const get = (url) => {
  let text = fetchText(url).trim();
  if (text.startsWith("(") && text.endsWith(")")) text = text.slice(1,-1);
  return JSON.parse(text);
};
const hockey = (cfg, feed, view, params={}) => {
  const url = new URL("https://lscluster.hockeytech.com/feed/index.php");
  for (const [k,v] of Object.entries({feed,view,key:cfg.key,client_code:cfg.client,...params})) url.searchParams.set(k,String(v));
  return get(url.toString());
};
const locateArray = (obj, key) => {
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const nested = locateArray(item, key);
      if (nested.length) return nested;
    }
    return [];
  }
  if (!obj || typeof obj !== "object") return [];
  if (Array.isArray(obj[key])) return obj[key];
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const result = locateArray(value,key);
      if (result.length) return result;
    }
  }
  return [];
};
const collectPeople = (obj, pred, result=[], depth=0) => {
  if (!obj || typeof obj !== "object" || depth>9) return result;
  if (Array.isArray(obj)) { for (const child of obj) collectPeople(child,pred,result,depth+1); return result; }
  if (pred(obj)) result.push(obj);
  else for (const child of Object.values(obj)) if (child && typeof child==="object") collectPeople(child,pred,result,depth+1);
  return result;
};
const rated = (league, x) => {
  const gp = number(x.games ?? x.gp ?? x.gamesPlayed);
  const goals = number(x.goals ?? x.g);
  const assists = number(x.assists ?? x.a);
  const base = {WHL:54, USHL:53, SHL:71, Liiga:69}[league];
  const youth = x.age ? clamp(23-x.age,-6,7) : 0;
  const production = gp >= 3 ? clamp((goals + assists)/gp,0,2.2) : null;
  const skill = production === null ? 0
    : Math.round((production - (x.pos === "D" ? 0.22 : 0.36)) * (x.pos === "D" ? 14 : 12));
  // Provisional figures are league-relative game estimates, never official ratings.
  const ovr = clamp(Math.round(base + skill + (x.pos==="G"?-1:0) + Math.max(-2, Math.min(2,youth*.25))),45,89);
  const potential = clamp(ovr + Math.max(0,youth)*2 + (x.age && x.age <=20?5:0),ovr,96);
  return {...x, ovr, potential,model:production!==null?"stats":"provisional",
    ...(gp?{games:gp}:{}), ...(gp?{goals,assists}:{})};
};
async function hockeyPlayers(league) {
  const cfg = config[league];
  const seasonsPayload = hockey(cfg,"modulekit","seasons");
  const candidates = collectPeople(seasonsPayload,(x) =>
    (x.id!==undefined || x.season_id!==undefined) &&
    /2026\s*[-/]\s*2027|2026\s*[-/]\s*27/i.test([x.name,x.label,x.season_name,x.title,x.display_name].join(" ")) &&
    !/playoff|all.star|tournament|pre.season/i.test([x.name,x.label,x.title].join(" ")));
  const chosen = candidates.find((x)=>/regular|season/i.test([x.name,x.label,x.title].join(" "))) || candidates[0];
  if (!chosen) throw Error("2026/27 season not found in official HockeyTech seasons feed");
  console.log(league, "candidate seasons",JSON.stringify(candidates.slice(0,3)).slice(0,800));
  const seasonId = chosen.id ?? chosen.season_id;
  const teams = locateArray(hockey(cfg,"statviewfeed","teamsForSeason",{season:seasonId}),"teams").filter((x)=>number(x.id)>0);
  console.log(league, "season",seasonId,"team count", teams.length,"first",JSON.stringify(teams[0]).slice(0,500));
  if (teams.length<8) throw Error("Too few teams: "+teams.length);
  const players = new Map();
  for (const t of teams) {
    const raw = hockey(cfg,"statviewfeed","roster",{
      team_id:t.id, season_id:seasonId, league_id:cfg.leagueId, site_id:cfg.siteId, lang:"en",
    });
    if (t === teams[0]) console.log(league,"first roster payload",JSON.stringify(raw).slice(0,1100));
    const sections = locateArray(raw,"sections");
    for (const section of sections)
      for (const item of section.data ?? []) {
        const p = item.row ?? item;
        const pid = p?.player_id;
        const name = String(p?.name ?? "").trim();
        if (!pid || !name) continue;
        const x = { id:`${league.toLowerCase()}-${pid}`, name,
          club:String(t.name ?? ""),pos:position(p.position),number:number(p.tp_jersey_number),
          nation:String(p.nationality ?? p.nation ?? "—"),age:age(p.birthdate),
        };
        players.set(x.id,x);
      }
  }
  if (players.size < 75) throw Error("Insufficient real roster coverage: "+players.size);
  // Official league production differentiates individual OVR instead of using
  // nearly identical age-only estimates. A failed stats request never discards
  // verified roster identities.
  try {
    const stats=hockey(cfg,"statviewfeed","players",{
      season:seasonId,team:"all",position:"skaters",rookies:0,
      statsType:"standard",rosterstatus:"undefined",
      site_id:cfg.siteId,league_id:cfg.leagueId,lang:"en",
      first:0,limit:1000,sort:"points",division:-1,
    });
    const sections=locateArray(stats,"sections");
    let matched=0;
    for(const section of sections)
      for(const item of section.data ?? []) {
        const row=item.row ?? item;
        const player=players.get(league.toLowerCase()+"-"+row.player_id);
        const gp=number(row.games_played ?? row.gp);
        if(!player || !gp) continue;
        Object.assign(player,{games:gp,goals:number(row.goals),assists:number(row.assists)});
        matched++;
      }
    console.log(league,"stats matched",matched,"of",players.size);
  } catch(error) {console.warn(league,"stats unavailable",error.message);}
  return [...players.values()].map((x)=>rated(league,x));
}
async function liigaPlayers() {
  const url="https://liiga.fi/api/v2/players/info?fromSeason=2027&toSeason=2027&tournament=runkosarja";
  const payload = get(url);
  console.log("Liiga response",JSON.stringify(payload).slice(0,1200));
  const rows=collectPeople(payload,(x)=>Boolean(
    (x.id ?? x.playerId ?? x.player_id ?? x.fihaId) &&
    ((x.firstName ?? x.first_name) && (x.lastName ?? x.last_name)) &&
    (x.teamName ?? x.team_name ?? x.team ?? x.teamShortName)
  ));
  const statsMap=new Map();
  try {
    const statPayload=get("https://liiga.fi/api/v2/players/stats/summed/2027/2027/runkosarja/true?dataType=basicStats");
    const stats=Array.isArray(statPayload)?statPayload:collectPeople(statPayload,x =>
      (x.playerId ?? x.player_id ?? x.id) && (x.games ?? x.playedGames) !== undefined);
    for(const p of stats) {
      const id=p.playerId ?? p.player_id ?? p.id;
      if(id) statsMap.set(String(id),{
        games:number(p.games ?? p.playedGames ?? p.played_games),
        goals:number(p.goals),assists:number(p.assists)
      });
    }
    console.log("Liiga official season statistics",statsMap.size);
  } catch(e) { console.warn("Liiga stats unavailable",e.message); }
  const entries=new Map();
  for(const p of rows){
    const id=p.id ?? p.playerId ?? p.player_id ?? p.fihaId;
    const club=p.teamName ?? p.team_name ?? p.team?.name ?? p.team ?? p.teamShortName;
    const x={id:`liiga-${id}`,name:`${p.firstName ?? p.first_name} ${p.lastName ?? p.last_name}`,
      club:String(club),pos:position(p.role ?? p.position ?? p.roleCode),
      nation:String(p.nationality ?? p.nationalityCode ?? "FIN"),number:number(p.jersey ?? p.number),
      age:age(p.dateOfBirth ?? p.date_of_birth ?? p.birthDate),
    };
    entries.set(x.id, rated("Liiga",{...x,...(statsMap.get(String(id)) ?? {})}));
  }
  if(entries.size<100) throw Error("Liiga source yielded only "+entries.size+" roster identities");
  return [...entries.values()];
}
async function shlPlayers() {
  // SHL now publishes official current-season team rosters through its
  // sports-v2 API. The legacy stats-info modules often reply with empty 200s.
  const layout=get("https://www.shl.se/api/statistics-v2/layout-info");
  const groups=collectPeople(layout,x =>
    String(x.season?.name ?? "")==="2026/2027" &&
    x.series?.code==="SHL" &&
    x.gameType?.code==="regular" &&
    Array.isArray(x.teams)
  );
  const group=groups.find((x)=>x.teams?.length>=12);
  if(!group) throw Error("Official 2026/27 SHL regular-season team list unavailable");
  const players=new Map();
  for(const team of group.teams) {
    const name=String(team.teamNames?.long ?? team.name?.medium ?? team.teamNames?.full ?? "");
    if(!name || !team.uuid) continue;
    const sections=get("https://www.shl.se/api/sports-v2/athletes/by-team-uuid/"+encodeURIComponent(team.uuid));
    for(const section of Array.isArray(sections)?sections:[]) {
      for(const p of section.players ?? []) {
        const fullname=String(p.fullName ?? [p.firstName,p.lastName].filter(Boolean).join(" ")).trim();
        if(!fullname || !p.uuid) continue;
        const x={
          id:"shl-"+p.uuid,name:fullname,club:name,
          pos:position(p.positionCode ?? section.positionCode),
          number:number(p.jerseyNumber),
          nation:String(p.nationality ?? "—"),
          age:age(p.dateOfBirth),
        };
        players.set(x.id,rated("SHL",x));
      }
    }
  }
  if(players.size<200) throw Error("Insufficient official SHL roster coverage: "+players.size);
  return [...players.values()];
}
const sourceFile = await readFile(target, "utf8");
// Preserve previous real snapshots if a provider is temporarily unavailable.
// The generated assignment is JSON; never evaluate source code or silently
// erase leagues on a parsing error.
let old = {};
const marker = 'export const SCOUT_LEAGUE_PLAYERS: Record<Exclude<ScoutLeague,"OHL">, ScoutEntry[]> = ';
const at = sourceFile.indexOf(marker);
if (at >= 0) {
  const serialized = sourceFile.slice(at + marker.length).trim().replace(/;\s*$/, "");
  try {
    old = JSON.parse(serialized);
  } catch (error) {
    if (!/^\{\s*WHL:\s*\[\]/.test(serialized)) {
      throw new Error("Could not parse existing verified scouting snapshot", { cause: error });
    }
  }
}
const output={};const counts={};
for(const league of leagues){
  try {
    const players=league==="SHL"?await shlPlayers():
      league==="Liiga"?await liigaPlayers():await hockeyPlayers(league);
    output[league]=players;counts[league]=players.length;
    console.log(league,players.length,"verified official identities");
  } catch(e){
    console.warn(league,"sync unavailable:",e.message);
    output[league]=old[league] ?? [];
    counts[league]=output[league].length;
  }
}
if (!Object.values(counts).some((v)=>v>=50)) throw Error("No real league source could be synchronized; preserving file");
const meta={fetchedAt:new Date().toISOString(),season,sources:Object.fromEntries(leagues.map((x)=>[x,counts[x]?sources[x]:""])),counts};
const content=`// Generated by scripts/sync-scout-leagues.mjs. Player identities are sourced from league feeds.\nexport type ScoutLeague = "OHL" | "WHL" | "USHL" | "SHL" | "Liiga";\nexport interface ScoutEntry { id: string; name: string; club: string; pos: "LW"|"C"|"RW"|"D"|"G"; number: number; nation: string; age: number; ovr: number; potential: number; model: "stats" | "provisional" | "game"; games?: number; goals?: number; assists?: number; }\nexport const SCOUT_LEAGUE_META = ${JSON.stringify(meta,null,2)} as const;\nexport const SCOUT_LEAGUE_PLAYERS: Record<Exclude<ScoutLeague,"OHL">, ScoutEntry[]> = ${JSON.stringify(output,null,2)};\n`;
await writeFile(target,content);
console.log("synced scouting leagues",counts);
