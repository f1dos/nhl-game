import assert from "node:assert/strict";
import test from "node:test";
import { translateEnglish } from "../src/i18n/englishMatch";

test("English mode translates generated inbox and matchday copy", () => {
  const examples = [
    ["Медицинский отчёт: недоступны 3", "Medical report: 3 unavailable"],
    [
      "Adam Sykora, Sean Durzi. Проверьте состав и варианты замены из AHL.",
      "Adam Sykora, Sean Durzi. Review the lineup and AHL replacement options.",
    ],
    ["Предсезонный матч: BOS @ NYR", "Preseason game: BOS @ NYR"],
    [
      "ANA меняет курс: wild-card-hunt",
      "ANA changes direction: wild-card-hunt",
    ],
    ["11 игроков AHL близки к NHL", "11 AHL players are close to the NHL"],
    ["Фанаты +1 · руководство +1 · команда -1", "Fans +1 · board +1 · team -1"],
  ];
  for (const [source, expected] of examples)
    assert.equal(translateEnglish(source), expected);
});

test("post-match press conference has bundled English copy", () => {
  for (const source of [
    "ПОСЛЕМАТЧЕВАЯ ПРЕСС-КОНФЕРЕНЦИЯ",
    "Последнее слово после игры",
    "Взять ответственность",
    "Разобрать детали",
    "Потребовать большего",
    "Отметить спецбригады",
    "Похвалить характер",
    "Ответить жёстко",
  ])
    assert.doesNotMatch(translateEnglish(source), /[А-Яа-яЁё]/);
});
