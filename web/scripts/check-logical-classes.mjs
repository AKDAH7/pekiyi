#!/usr/bin/env node
/**
 * Fails if any physical-direction Tailwind utility class appears in web/.
 * The app must be RTL-correct, so logical utilities (ps-/pe-/ms-/me-/start-/
 * end-/text-start/text-end/border-s/border-e/rounded-s/rounded-e) are required
 * instead of pl-/pr-/ml-/mr-/left-/right-/text-left/text-right/border-l/
 * border-r/rounded-l/rounded-r.
 *
 * One narrow exception: components that accept an explicit, literal `side`
 * value ("left" | "right") — Sidebar, Sheet, dropdown/tooltip positioners —
 * legitimately use `left-`/`right-` utilities gated behind a
 * `data-[side=left]:` / `data-[side=right]:` (or `group-data-[side=...]:`)
 * modifier. That modifier selects on the literal side the component was
 * asked to render on (a geometry decision), not on reading direction, so it
 * is not a logical-class violation and shadcn's own `--rtl` generator
 * produces it. Any other occurrence is a real bug.
 */

import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const SCAN_GLOBS = ["**/*.ts", "**/*.tsx"];
const IGNORE = [
  "**/node_modules/**",
  "**/.next/**",
  "**/dist/**",
  "scripts/check-logical-classes.mjs",
];

const DISALLOWED_BASE_PATTERNS = [
  /^-?pl-/,
  /^-?pr-/,
  /^-?ml-/,
  /^-?mr-/,
  /^-?left-/,
  /^-?right-/,
  /^text-left$/,
  /^text-right$/,
  /^border-l(?:-|$)/,
  /^border-r(?:-|$)/,
  /^rounded-l(?:-|$)/,
  /^rounded-r(?:-|$)/,
];

const SIDE_VALUE_EXCEPTION = /side=(left|right)\]/;

// Matches the contents of string/template literals that look like class
// lists: className="...", cn(...), clsx(...), cva(...) all end up as plain
// quoted strings containing space-separated utility tokens.
const STRING_LITERAL_RE = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;

/** Splits a Tailwind class token into its modifier chain and base utility,
 * respecting bracketed arbitrary values (which may contain `:`). */
function splitModifiers(token) {
  const modifiers = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    else if (ch === ":" && depth === 0) {
      modifiers.push(token.slice(start, i + 1));
      start = i + 1;
    }
  }

  return { modifiers, base: token.slice(start) };
}

function checkToken(token) {
  if (!token) return null;
  const { modifiers, base } = splitModifiers(token);

  const isSideGated = modifiers.some((mod) => SIDE_VALUE_EXCEPTION.test(mod));
  if (isSideGated) return null;

  const isViolation = DISALLOWED_BASE_PATTERNS.some((pattern) => pattern.test(base));
  return isViolation ? token : null;
}

function checkFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const violations = [];

  for (const match of content.matchAll(STRING_LITERAL_RE)) {
    const literal = match[2];
    if (!literal.includes("-")) continue;

    for (const token of literal.split(/\s+/)) {
      const violation = checkToken(token);
      if (violation) {
        const line = content.slice(0, match.index).split("\n").length;
        violations.push({ line, token: violation });
      }
    }
  }

  return violations;
}

const files = globSync(SCAN_GLOBS, { cwd: ROOT, ignore: IGNORE, absolute: true });

let hasViolations = false;

for (const file of files) {
  const violations = checkFile(file);
  if (violations.length === 0) continue;

  hasViolations = true;
  const relativePath = path.relative(ROOT, file);
  for (const { line, token } of violations) {
    console.error(`${relativePath}:${line}  physical-direction class "${token}"`);
  }
}

if (hasViolations) {
  console.error(
    "\nPhysical-direction Tailwind classes found. Use logical utilities instead " +
      "(ps-/pe-, ms-/me-, start-/end-, text-start/text-end, border-s/border-e, " +
      "rounded-s/rounded-e). See CLAUDE.md.",
  );
  process.exit(1);
} else {
  console.log(`check-logical-classes: OK (${files.length} files scanned)`);
}
