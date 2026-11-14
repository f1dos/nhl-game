import { useState } from "react";
import type { Game, Player } from "../engine/types";
import { askingSalary, salaryTotal, signContract } from "../engine/contracts";
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
  const ru = game.language === "ru";
  const market = [
    ...team.players.filter((p) => p.years === 1),
    ...(game.freeAgents || []),
  ];
  const player = market.find((p) => p.id === selected);
  const choose = (p: Player) => {
    setSelected(p.id);
    setSalary(askingSalary(p, game, game.user));
    setMessage("");
  };
  const roster = [...team.players, ...(team.farm ?? [])];
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
      <Panel title={ru ? "Переговоры" : "Negotiations"}>
        <div className="settings-actions">
          <select
            aria-label="Contract player"
            value={selected}
            onChange={(e) => {
              const p = market.find((p) => p.id === e.target.value);
              if (p) choose(p);
            }}
          >
            <option value="">{ru ? "Выберите игрока" : "Choose player"}</option>
            {market.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.pos} · {p.ovr} OVR
              </option>
            ))}
          </select>
          <label>
            {ru ? "Лет" : "Years"}{" "}
            <input
              aria-label="Contract years"
              type="number"
              min="1"
              max="7"
              value={years}
              onChange={(e) => setYears(+e.target.value)}
            />
          </label>
          <label>
            AAV $M{" "}
            <input
              aria-label="Contract salary"
              type="number"
              min="0.8"
              step="0.05"
              value={salary}
              onChange={(e) => setSalary(+e.target.value)}
            />
          </label>
          <button
            disabled={!player}
            onClick={() => {
              if (!player) return;
              const preview = structuredClone(game);
              try {
                signContract(preview, game.user, player.id, years, salary);
                edit((g) => signContract(g, g.user, player.id, years, salary));
                setMessage(ru ? "Контракт подписан" : "Contract signed");
                setSelected("");
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            {ru ? "Предложить контракт" : "Offer contract"}
          </button>
        </div>
        <p role="status">{message}</p>
        {player && (
          <p>
            {ru ? "Требование" : "Asking price"}: $
            {askingSalary(player, game, game.user).toFixed(2)}M ·{" "}
            {ru ? "Общая сумма" : "Total"}: ${(years * salary).toFixed(2)}M
          </p>
        )}
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
