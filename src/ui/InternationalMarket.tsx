import { useState } from "react";
import type { Game, InternationalRole } from "../engine/types";
import {
  contactInternationalPlayer,
  evaluateInternationalOffer,
  scoutInternationalPlayer,
  submitInternationalOffer,
} from "../engine/international";
import { Panel, Rating } from "./components";
import { PlayerLink } from "./links";

export default function InternationalMarket({
  game,
  edit,
}: {
  game: Game;
  edit: (fn: (g: Game) => void) => void;
}) {
  const ru = game.language === "ru";
  const [selected, setSelected] = useState(
    game.internationalMarket?.[0]?.player.id ?? "",
  );
  const [salary, setSalary] = useState(1.2);
  const [years, setYears] = useState(2);
  const [bonus, setBonus] = useState(0.25);
  const [fee, setFee] = useState(0);
  const [role, setRole] = useState<InternationalRole>("rotation");
  const [developmentPlan, setDevelopmentPlan] = useState(true);
  const [message, setMessage] = useState("");
  const candidates = game.internationalMarket ?? [];
  const candidate = candidates.find((x) => x.player.id === selected);
  const offer = game.internationalOffers?.find(
    (x) => x.playerId === selected && x.team === game.user,
  );
  const terms = {
    salary,
    years,
    signingBonus: bonus,
    transferFee: fee,
    role,
    developmentPlan,
  };
  const act = (fn: (g: Game) => void, success: string) => {
    try {
      const preview = structuredClone(game);
      fn(preview);
      edit(fn);
      setMessage(success);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  let evaluation: ReturnType<typeof evaluateInternationalOffer> | undefined;
  if (candidate?.contactedBy === game.user)
    try {
      evaluation = evaluateInternationalOffer(game, selected, terms);
    } catch {
      /* form explains invalid terms on submit */
    }
  return (
    <Panel title={ru ? "МЕЖДУНАРОДНЫЙ РЫНОК" : "INTERNATIONAL MARKET"}>
      <p>
        {ru
          ? "Реалистичный процесс: скаутинг → разрешение агента → предложение → ожидание решения. Учитываются действующий контракт, трансферная компенсация, зарплата, срок, бонус, обещанная роль, конкуренция в составе, сила клуба, адаптация и другие предложения."
          : "Realistic flow: scout → agent permission → formal offer → wait for a decision. Current contract, transfer fee, AAV, term, bonus, promised role, roster competition, club strength, adaptation and competing offers all matter."}
      </p>
      <div className="international-layout">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>PLAYER</th>
                <th>LEAGUE</th>
                <th>AGE</th>
                <th>OVR</th>
                <th>POT</th>
                <th>{ru ? "КОНТРАКТ" : "STATUS"}</th>
                <th>{ru ? "СКАУТИНГ" : "SCOUTED"}</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((x) => (
                <tr
                  key={x.player.id}
                  className={selected === x.player.id ? "selected" : ""}
                  onClick={() => {
                    setSelected(x.player.id);
                    setSalary(x.desiredSalary);
                    setYears(x.desiredYears);
                    setRole(x.desiredRole);
                    setMessage("");
                  }}
                >
                  <td>
                    <button className="text-button">{x.player.name}</button>
                    <small>{x.club}</small>
                  </td>
                  <td>{x.league}</td>
                  <td>{x.player.age}</td>
                  <td>
                    <Rating value={x.player.ovr} />
                  </td>
                  <td>{x.player.potential}</td>
                  <td>
                    {x.transferStatus}
                    <br />
                    <small>{x.contractUntil}</small>
                  </td>
                  <td>{x.scouted}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {candidate && (
          <aside className="international-offer">
            <h3>
              <PlayerLink player={candidate.player} />
            </h3>
            <p>
              {candidate.league} · {candidate.club}
              <br />
              {candidate.competingOffers}{" "}
              {ru ? "конкурирующих клубов" : "competing clubs"} ·{" "}
              {ru ? "риск адаптации" : "adaptation risk"}{" "}
              {candidate.adaptationRisk}%
            </p>
            <div className="settings-actions">
              <button
                onClick={() =>
                  act(
                    (g) => scoutInternationalPlayer(g, selected),
                    ru ? "Отчёт улучшен" : "Report improved",
                  )
                }
              >
                {ru ? "Скаутировать (4 очка)" : "Scout (4 points)"}
              </button>
              <button
                disabled={candidate.contactedBy === game.user}
                onClick={() =>
                  act(
                    (g) => contactInternationalPlayer(g, selected),
                    ru ? "Агент готов к переговорам" : "Agent opened talks",
                  )
                }
              >
                {candidate.contactedBy === game.user
                  ? ru
                    ? "Контакт установлен"
                    : "Contacted"
                  : ru
                    ? "Связаться с агентом"
                    : "Contact agent"}
              </button>
            </div>
            <label>
              AAV $M{" "}
              <input
                type="number"
                min="0.8"
                step="0.05"
                value={salary}
                onChange={(e) => setSalary(+e.target.value)}
              />
            </label>
            <label>
              {ru ? "Лет" : "Years"}{" "}
              <input
                type="number"
                min="1"
                max="3"
                value={years}
                onChange={(e) => setYears(+e.target.value)}
              />
            </label>
            <label>
              {ru ? "Подписной бонус, $M" : "Signing bonus, $M"}{" "}
              <input
                type="number"
                min="0"
                step="0.05"
                value={bonus}
                onChange={(e) => setBonus(+e.target.value)}
              />
            </label>
            <label>
              {ru ? "Трансферная компенсация, $M" : "Transfer fee, $M"}{" "}
              <input
                type="number"
                min="0"
                step="0.1"
                value={fee}
                onChange={(e) => setFee(+e.target.value)}
              />
            </label>
            <label>
              {ru ? "Обещанная роль" : "Promised role"}{" "}
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as InternationalRole)}
              >
                <option value="depth">Depth</option>
                <option value="rotation">Rotation</option>
                <option value="top-six">Top six</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={developmentPlan}
                onChange={(e) => setDevelopmentPlan(e.target.checked)}
              />{" "}
              {ru
                ? "Персональный план адаптации и развития"
                : "Personal adaptation and development plan"}
            </label>
            {evaluation && (
              <p>
                {ru ? "Оценка привлекательности" : "Offer appeal"}:{" "}
                <b>{evaluation.score}</b>/100 ·{" "}
                {ru ? "минимальная компенсация" : "required fee"} $
                {evaluation.requiredFee.toFixed(2)}M
              </p>
            )}
            <button
              className="primary"
              disabled={candidate.contactedBy !== game.user}
              onClick={() =>
                act(
                  (g) => submitInternationalOffer(g, selected, terms),
                  ru
                    ? "Предложение отправлено; решение через два тура"
                    : "Offer sent; decision in two rounds",
                )
              }
            >
              {ru ? "Отправить официальное предложение" : "Submit formal offer"}
            </button>
            <p role="status">
              {message ||
                (offer
                  ? `${offer.status.toUpperCase()} · ${offer.message}`
                  : "")}
            </p>
          </aside>
        )}
      </div>
    </Panel>
  );
}
