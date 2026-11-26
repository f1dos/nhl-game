import { useRef, useState } from "react";
import type { Game, Team } from "../engine/types";
import { planNames } from "./BenchDesk";
type Prep = NonNullable<Game["matchPreparation"]>;
type Talk = NonNullable<Prep["talk"]>;
export default function MatchPreparation({
  opponent,
  prep,
  save,
  ru,
}: {
  opponent: Team;
  prep: Prep;
  save: (p: Prep) => void;
  ru: boolean;
}) {
  const t = (a: string, b: string) => (ru ? a : b),
    names = planNames(t);
  const dlg = useRef<HTMLDialogElement>(null),
    [tone, setTone] = useState<Talk["tone"]>(),
    [message, setMessage] = useState<Talk["message"]>();
  const goalie = opponent.players.find((p) => p.id === opponent.goalie);
  const units = opponent.lines
    .map((ids, i) => {
      const group = ids
        .map((id) => opponent.players.find((p) => p.id === id))
        .filter((p) => p && !p.injury);
      return {
        i,
        pass: Math.round(
          group.reduce((n, p) => n + (p!.attributes.passing ?? 0), 0) /
            Math.max(1, group.length),
        ),
        full: group.length === 3,
      };
    })
    .filter((u) => u.full)
    .sort((a, b) => b.pass - a.pass);
  const system = opponent.tactics.forecheck;
  const reports: {
    label: string;
    evidence: string;
    advice: string;
    plan: NonNullable<Prep["plan"]>;
  }[] = [
    {
      label: t("Первый пас из зоны", "Breaking their forecheck"),
      evidence: t("Форчек соперника", "Opposing forecheck") + " · " + system,
      plan: system === "2-1-2" ? "high" : "wide",
      advice:
        system === "2-1-2"
          ? t(
              "Два игрока пойдут в давление. Сохраните ближнюю поддержку над шайбой.",
              "Two forecheckers commit. Keep a short supporting outlet.",
            )
          : t(
              "Растяните встречающую группу по ширине. Потеря на фланге оставит дальнего крайнего за игрой.",
              "Stretch the first layer wide. A turnover can strand the far winger.",
            ),
    },
    ...(units[0]
      ? [
          {
            label: t("Опасное сочетание", "Passing threat"),
            evidence:
              "L" +
              (units[0].i + 1) +
              " · " +
              t("средняя оценка паса", "average passing") +
              " " +
              units[0].pass,
            plan: "high" as const,
            advice: t(
              "Их лучшая по пасу тройка может отрезать двух форвардов одной передачей. Оставьте третьего выше.",
              "Their best passing line can bypass two forwards at once. Keep the third forward high.",
            ),
          },
        ]
      : []),
    ...(goalie
      ? [
          {
            label: t("Игра у ворот", "Crease report"),
            evidence:
              goalie.name +
              " · " +
              t("контроль отскока", "rebound control") +
              " " +
              (goalie.attributes.reboundControl ?? "—"),
            plan: "slot" as const,
            advice:
              (goalie.attributes.reboundControl ?? 70) >= 75
                ? t(
                    "Вратарь хорошо гасит отскоки. Закройте обзор первым форвардом, второй ждёт передачу между кругами.",
                    "Strong rebound control. Screen with one forward and find the second between the dots.",
                  )
                : t(
                    "Отправьте одного на добивание. Защитники останутся высоко на случай подбора соперника.",
                    "Send one forward after rebounds. Keep the points high if the defence recovers.",
                  ),
          },
        ]
      : []),
  ];
  const tones = {
    trust: t("Я доверяю каждому из вас.", "I trust every player in this room."),
    challenge: t(
      "С первой смены заставьте их ошибаться.",
      "Make them earn every exit from the first shift.",
    ),
  };
  const cues = {
    support: t(
      "Дайте партнёру короткий пас.",
      "Give the puck carrier a short option.",
    ),
    attack: t(
      "Увидели свободный коридор — играйте вперёд.",
      "If the lane opens, move the puck forward.",
    ),
    safe: t(
      "Под давлением выбирайте чистую линию паса.",
      "Under pressure, find a clean passing lane.",
    ),
  };
  return (
    <section className="prep-desk">
      <header>
        <div>
          <small>{opponent.id}</small>
          <h3>{t("План на соперника", "Opponent game plan")}</h3>
        </div>
      </header>
      {reports.map((r) => (
        <article key={r.label}>
          <small>{r.label}</small>
          <h4>{r.evidence}</h4>
          <p>{r.advice}</p>
          <button
            aria-pressed={prep.plan === r.plan}
            onClick={() =>
              save({ ...prep, plan: prep.plan === r.plan ? undefined : r.plan })
            }
          >
            {prep.plan === r.plan ? "✓ " : "+ "}
            {names[r.plan]}
          </button>
        </article>
      ))}
      <article>
        <h4>{t("Установка на матч", "Team instructions")}</h4>
        <p>
          {t("Общий план пятёрок", "Even-strength plan")} ·{" "}
          {names[prep.plan ?? "auto"]}
        </p>
      </article>
      <article>
        <h4>{t("Раздевалка", "Dressing room")}</h4>
        {prep.talk && (
          <p>
            «{tones[prep.talk.tone]} {cues[prep.talk.message]}»
          </p>
        )}
        <button
          onClick={() => {
            setTone(prep.talk?.tone);
            setMessage(prep.talk?.message);
            dlg.current?.showModal();
          }}
        >
          {prep.talk
            ? t("Повторить установку", "Revisit team talk")
            : t("Обратиться к команде", "Address the team")}
        </button>
      </article>
      <dialog
        ref={dlg}
        className="room-dialog"
        aria-label={t("Собрание в раздевалке", "Dressing-room meeting")}
      >
        <h3>{t("Собрание в раздевалке", "Dressing-room meeting")}</h3>
        <p>{t("Как начать разговор?", "How do you open?")}</p>
        {(Object.keys(tones) as Talk["tone"][]).map((k) => (
          <button key={k} aria-pressed={tone === k} onClick={() => setTone(k)}>
            {tones[k]}
          </button>
        ))}
        {tone && (
          <>
            <p>
              {tone === "trust"
                ? t(
                    "Капитан кивает. «Как разыгрываем первые смены?»",
                    "The captain nods. “How do we play our first shifts?”",
                  )
                : t(
                    "Капитан поднимается. «Какой первый пас ищем после отбора?»",
                    "The captain stands. “What’s our first look after a recovery?”",
                  )}
            </p>
            {(Object.keys(cues) as Talk["message"][]).map((k) => (
              <button
                key={k}
                aria-pressed={message === k}
                onClick={() => setMessage(k)}
              >
                {cues[k]}
              </button>
            ))}
          </>
        )}
        <footer>
          <p>
            {t(
              "Игроки будут искать выбранный вариант паса в первые пять игровых минут.",
              "The team will look for this passing option in the opening five minutes.",
            )}
          </p>
          <button
            disabled={!tone || !message}
            onClick={() => {
              if (tone && message) save({ ...prep, talk: { tone, message } });
              dlg.current?.close();
            }}
          >
            {t("Завершить собрание", "Finish meeting")}
          </button>
          <button onClick={() => dlg.current?.close()}>
            {t("Отмена", "Cancel")}
          </button>
        </footer>
      </dialog>
    </section>
  );
}
