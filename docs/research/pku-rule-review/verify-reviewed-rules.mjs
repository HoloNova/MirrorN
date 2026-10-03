import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const rules = read('rules.reviewed.json');
const bindings = read('bindings.reviewed.json');
const samples = read('samples.reviewed.json');
const evidence = read('metadata-evidence.json');
const ecosystems = JSON.parse(
  readFileSync(new URL('../../../data/ecosystem-taxonomy.json', import.meta.url), 'utf8'),
);
const inventory = JSON.parse(
  readFileSync(new URL('../../../data/site-inventories/pku.json', import.meta.url), 'utf8'),
);
const ecosystemIds = new Set(ecosystems.map((e) => e.id));
const repoIds = new Set(inventory.repositories.map((r) => r.id));
assert.equal(new Set(rules.rules.map((r) => r.id)).size, rules.rules.length);
let checked = 0;
const match = (rule, filename) => {
  const hits = rule.filenameCandidates
    .map((p) => ({ id: p.id, match: new RegExp(p.pattern).exec(filename) }))
    .filter((p) => p.match);
  assert.ok(hits.length <= 1, `${rule.id}: ambiguous envelope ${filename}`);
  return hits[0];
};
for (const rule of rules.rules) {
  assert.equal(rule.status, 'draft', 'Research must not activate production rules');
  assert.ok(ecosystemIds.has(rule.ecosystemId), `Unknown ecosystem ${rule.ecosystemId}`);
  for (const p of rule.filenameCandidates) {
    assert.ok(p.pattern.startsWith('^') && p.pattern.endsWith('$'));
    new RegExp(p.pattern);
  }
  if (rule.decision !== 'implement_candidate') continue;
  const b = bindings.bindings.find((b) => b.ruleId === rule.id);
  assert.ok(b && b.siteId === 'pku' && repoIds.has(b.repoId));
  assert.ok(b.rootPath.startsWith(`${b.repoId}/`));
  assert.ok(!b.rootPath.split('/').includes('..'));
  const fixtures = samples.cases.find((c) => c.ruleId === rule.id);
  assert.ok(fixtures?.positives.length, `No real positive: ${rule.id}`);
  for (const p of fixtures.positives) {
    const listing = evidence.records.find((r) => r.url === p.evidenceUrl);
    const entry = listing?.entries?.find((e) => e.name === p.filename);
    assert.ok(entry && ['file', 'other'].includes(entry.type), `No file witness: ${p.filename}`);
    assert.ok(p.evidenceUrl.startsWith(`https://mirrors.pku.edu.cn/files/${b.rootPath}`));
    const expectedUrl = new URL(
      encodeURIComponent(p.filename),
      p.evidenceUrl.replace('/files/', '/'),
    );
    assert.equal(p.downloadUrl, expectedUrl.href);
    const hit = match(rule, p.filename);
    assert.ok(hit, `Positive missed: ${p.filename}`);
    assert.equal(hit.id, p.expectedPattern);
    assert.deepEqual(JSON.parse(JSON.stringify(hit.match.groups)), p.expectedCaptures);
    checked++;
  }
  for (const n of fixtures.negatives) {
    assert.ok(
      evidence.records.some(
        (r) => r.url === n.evidenceUrl && r.entries?.some((e) => e.name === n.filename),
      ),
    );
    assert.equal(match(rule, n.filename), undefined, `Companion/source accepted: ${n.filename}`);
    checked++;
  }
}
for (const c of samples.regression) {
  const rule = rules.rules.find((r) => r.id === c.ruleId);
  assert.ok(rule);
  const hit = match(rule, c.filename);
  if (c.expectedCaptures === null)
    assert.equal(hit, undefined, `Regression rejected sample accepted: ${c.filename}`);
  else {
    assert.ok(hit, `Regression positive missed: ${c.filename}`);
    for (const [key, value] of Object.entries(c.expectedCaptures))
      assert.equal(hit.match.groups[key], value, `${c.filename}:${key}`);
  }
  checked++;
}
for (const repo of inventory.repositories) {
  const url = `https://mirrors.pku.edu.cn/files${repo.path}`;
  assert.ok(
    evidence.records.some((r) => r.url === url && r.status === 'listing'),
    `Root not verified: ${repo.id}`,
  );
}
assert.ok(evidence.requests <= 80);
assert.ok(evidence.bytes <= 8 * 1024 ** 2);
console.log(
  `Review-only checks passed: ${samples.cases.length} profiles; ${checked} filename assertions; 40 root witnesses; ${evidence.requests} metadata requests, ${evidence.bytes} bytes.`,
);
console.log(
  'Not a production classifier, update/deletion gate, prerequisite check, or proof of installation. No production rules activated.',
);
