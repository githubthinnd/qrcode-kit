// Probes the npm registry for a package name and for names npm may treat as "too similar".
//   node scripts/check-name.mjs [name ...]      (default: the name in package.json)
//
// npm rejects a new name when, after removing punctuation (- . _) and case, it equals an
// existing package. A 404 for the exact name is therefore not enough. This script:
//   1. checks the exact name,
//   2. checks every single-separator variant of the punctuation-free form,
//   3. searches the registry and flags results whose normalised form is identical.
// It cannot reserve a name or prove that publishing will succeed; only `npm publish` can.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const defaults = [JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name];
const names = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaults;

const env = { ...process.env, npm_config_userconfig: '/dev/null' };
const npm = (args) => {
  try {
    return {
      ok: true,
      out: execFileSync('npm', args, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }),
    };
  } catch (error) {
    return { ok: false, out: `${error.stderr ?? ''}${error.stdout ?? ''}` };
  }
};
const normalise = (name) => name.toLowerCase().replace(/[-._]/g, '');
const exists = (name) => {
  const result = npm(['view', name, 'name', '--json']);
  if (result.ok) return true;
  if (/E404|404 Not Found/.test(result.out)) return false;
  throw new Error(
    `Could not query the registry for "${name}": ${result.out.trim().split('\n')[0]}`,
  );
};

let problems = 0;
for (const name of names) {
  const scoped = name.startsWith('@');
  const bare = scoped ? name.split('/')[1] : name;
  console.log(`\n${name}`);

  const taken = exists(name);
  console.log(`  exact name: ${taken ? 'TAKEN' : 'free (404)'}`);
  if (taken) problems++;

  if (scoped) {
    const scope = name.split('/')[0].slice(1);
    const scopeCheck = npm(['access', 'list', 'packages', scope]);
    console.log(
      `  scope @${scope}: ${/Scope not found/.test(scopeCheck.out) ? 'does NOT exist on npm (create the user/org first)' : 'exists'}`,
    );
    continue; // scoped names are not subject to the similarity rule
  }

  const flat = normalise(bare);
  const variants = new Set();
  for (let i = 1; i < flat.length; i++)
    for (const sep of ['-', '.', '_']) variants.add(flat.slice(0, i) + sep + flat.slice(i));
  variants.add(flat);
  variants.delete(bare);
  // Only probe the variants a person would plausibly have published: one separator, at a word-like boundary.
  const plausible = [...variants].filter((v) => /^[a-z0-9]+[-._][a-z0-9]+$/.test(v) || v === flat);
  const collisions = [];
  for (const variant of plausible) if (exists(variant)) collisions.push(variant);
  console.log(
    `  ${String(plausible.length)} single-separator variants probed: ${collisions.length === 0 ? 'none exist' : `EXIST: ${collisions.join(', ')}`}`,
  );
  problems += collisions.length;

  const search = npm(['search', bare, '--json', '--searchlimit=250']);
  let hits;
  try {
    hits = JSON.parse(search.out).filter((p) => normalise(p.name) === flat && p.name !== name);
  } catch {
    console.log('  search: could not parse results (skipped)');
    continue;
  }
  console.log(
    `  registry search: ${hits.length === 0 ? 'no package with the same punctuation-free name' : `COLLISION: ${hits.map((h) => h.name).join(', ')}`}`,
  );
  problems += hits.length;
}

console.log(
  problems === 0
    ? '\nNo collisions found. npm may still apply rules this script cannot see; only publishing proves availability.'
    : '\nCollisions or taken names found. Pick another name or a scoped name.',
);
process.exit(problems === 0 ? 0 : 1);
