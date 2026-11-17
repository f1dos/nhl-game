/**
 * Static localization audit: lists Cyrillic string literals / JSX text in
 * src/ that are neither paired with an English alternative (tr(ru, en),
 * t(ru, en), `ru ? "…" : "…"`) nor covered by the English runtime catalog.
 *
 *   npx tsx scripts/i18n-audit.ts [files...]
 */
import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { translateEnglish } from "../src/i18n/englishMatch";
import { buildCoreCatalog } from "../src/i18n/coreCatalog";

const core = buildCoreCatalog("en");
const cyr = /[А-Яа-яЁё]/;
const PAIR_FNS = new Set(["tr", "t", "tx", "L", "say", "bi", "lang"]);

function covered(text: string) {
  const key = text.replace(/\s+/g, " ").trim();
  if (!key) return true;
  const out = core[key] ?? translateEnglish(key);
  return !cyr.test(out);
}

function isPaired(node: ts.Node): boolean {
  let cur: ts.Node = node;
  for (let depth = 0; depth < 8 && cur.parent; depth++) {
    const parent = cur.parent;
    if (ts.isCallExpression(parent)) {
      const callee = parent.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : "";
      if (PAIR_FNS.has(name) && parent.arguments.length >= 2) return true;
      return false;
    }
    if (ts.isConditionalExpression(parent)) {
      const cond = parent.condition.getText();
      if (/\bru\b|language|isRu|russian/i.test(cond)) return true;
    }
    if (ts.isPropertyAssignment(parent)) {
      // { ru: "…", en: "…" } objects
      const name = parent.name.getText().replace(/["']/g, "");
      if (/^(ru|labelRu|groupRu|titleRu|textRu|bodyRu|nameRu)$/.test(name)) return true;
      return false;
    }
    if (ts.isArrayLiteralExpression(parent)) {
      // [ru, en] tuples
      const els = parent.elements;
      if (els.length === 2 && els[0] === cur && !cyr.test(els[1].getText())) return true;
    }
    if (ts.isJsxAttribute(parent) || ts.isJsxElement(parent) || ts.isBlock(parent)) return false;
    cur = parent;
  }
  return false;
}

export function auditFile(file: string) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const issues: { line: number; text: string }[] = [];
  const visit = (node: ts.Node) => {
    let text: string | undefined;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isJsxText(node)) text = node.text;
    else if (ts.isTemplateExpression(node))
      text = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join("…");
    if (text !== undefined && cyr.test(text)) {
      if (!isPaired(node) && !(!file.includes("engine") && (ts.isJsxText(node) || ts.isStringLiteral(node)) ? covered(text) : false))
        issues.push({
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          text: text.replace(/\s+/g, " ").trim().slice(0, 140),
        });
      if (ts.isTemplateExpression(node)) return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return issues;
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["src/engine", "src/ui"].flatMap((dir) =>
      readdirSync(dir)
        .filter((f) => /\.tsx?$/.test(f))
        .map((f) => join(dir, f)),
    );
let total = 0;
for (const file of files) {
  const issues = auditFile(file);
  if (!issues.length) continue;
  total += issues.length;
  console.log(`\n## ${file} (${issues.length})`);
  for (const issue of issues) console.log(`${issue.line}: ${issue.text}`);
}
console.log(`\nTOTAL ${total}`);
