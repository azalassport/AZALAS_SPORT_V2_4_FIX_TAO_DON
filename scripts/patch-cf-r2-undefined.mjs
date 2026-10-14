/**
 * AZALAS temporary compatibility fix for:
 * https://github.com/cloudflare/workers-sdk/issues/16103
 * Upstream proposed patch: https://github.com/cloudflare/workers-sdk/pull/16107
 *
 * cf@1.0.0-beta.16 bundles a config comparator that treats omitted optional
 * R2 "jurisdiction: undefined" fields as destructive deletions.
 *
 * This applies ONLY the upstream normalization of undefined-valued REMOTE
 * fields. The Cloudflare strict deployment guard stays enabled, so real
 * binding changes still fail. It intentionally fails closed if the published
 * CLI implementation no longer matches the expected code.
 *
 * No application code, database, secrets, bucket data, or source config changes.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PATCH_ID = "azalasRemoveUndefinedFromRemoteConfig";
const EXPECTED_VERSION = "1.0.0-beta.16";
const mode = process.argv[2] ?? "--check";

if (mode !== "--check" && mode !== "--apply") {
  throw new Error("Usage: node scripts/patch-cf-r2-undefined.mjs --check|--apply");
}

function removeUndefined(value) {
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefined(item)])
    );
  }
  return value;
}

// These local assertions protect against accidentally discarding real changes.
assert.deepEqual(
  removeUndefined([{ binding: "R2", bucket_name: "bucket", jurisdiction: undefined }]),
  [{ binding: "R2", bucket_name: "bucket" }]
);
assert.deepEqual(
  removeUndefined([{ binding: "R2", bucket_name: "different-bucket", jurisdiction: "eu" }]),
  [{ binding: "R2", bucket_name: "different-bucket", jurisdiction: "eu" }]
);
assert.deepEqual(removeUndefined({ nested: { missing: undefined, retained: null } }), {
  nested: { retained: null }
});

const require = createRequire(import.meta.url);
const packagePath = require.resolve("cf/package.json");
const cfPackage = JSON.parse(readFileSync(packagePath, "utf8"));
if (cfPackage.version !== EXPECTED_VERSION) {
  throw new Error(
    `Expected cf@${EXPECTED_VERSION}, found cf@${cfPackage.version}. ` +
    "Do not patch a new CLI version. Reassess the upstream fix first."
  );
}

const distDirectory = join(dirname(packagePath), "dist");
if (!existsSync(distDirectory)) {
  throw new Error("cf/dist was not found; no changes made.");
}

function findScripts(dir, output = []) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const filename = join(dir, item.name);
    if (item.isDirectory()) {
      findScripts(filename, output);
    } else if (item.isFile() && /\.(?:mjs|cjs|js)$/.test(item.name)) {
      output.push(filename);
    }
  }
  return output;
}

const helper = `function ${PATCH_ID}(value) {
  if (Array.isArray(value)) return value.map(${PATCH_ID});
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, fieldValue]) => fieldValue !== undefined)
        .map(([key, fieldValue]) => [key, ${PATCH_ID}(fieldValue)])
    );
  }
  return value;
}

`;

// Match only the comparator's remote override assignment, not any other use.
const ASSIGNMENT = /\bnormalizedRemote\s*\[\s*key\s*\]\s*=\s*value\s*;/;
const found = [];
const alreadyPatched = [];
for (const filename of findScripts(distDirectory)) {
  const source = readFileSync(filename, "utf8");
  if (source.includes(`function ${PATCH_ID}(`)) {
    alreadyPatched.push(filename);
    continue;
  }

  const fnPos = source.indexOf("function normalizeRemoteConfigAsResolvedLocal(");
  if (fnPos === -1) continue;

  const remotePos = source.indexOf("Object.entries(remoteConfig).forEach", fnPos);
  if (remotePos === -1 || remotePos > fnPos + 2500) continue;

  const windowEnd = Math.min(source.length, remotePos + 1200);
  const snippet = source.slice(remotePos, windowEnd);
  const match = ASSIGNMENT.exec(snippet);
  if (!match) continue;

  const targetStart = remotePos + match.index;
  found.push({ filename, source, fnPos, targetStart, oldText: match[0] });
}

if (alreadyPatched.length === 1 && found.length === 0) {
  console.log("Cloudflare R2 comparator fix already present. Strict guard remains enabled.");
  process.exit(0);
}

if (found.length !== 1 || alreadyPatched.length !== 0) {
  throw new Error(
    `Expected exactly one known cf comparator target, found ${found.length} ` +
    `(already patched: ${alreadyPatched.length}). No changes made. ` +
    "Do not disable strict to bypass this error."
  );
}

const item = found[0];
console.log("Identified cf comparator implementation:", item.filename);
if (mode === "--check") {
  console.log("Patch compatibility check passed. No file changed.");
  process.exit(0);
}

// Apply the same normalization as the upstream Cloudflare PR while keeping
// every other branch of the original strict configuration comparator intact.
const replacement = item.oldText.replace(
  /value\s*;$/,
  `${PATCH_ID}(value);`
);
if (replacement === item.oldText) {
  throw new Error("Comparator assignment format changed; no changes made.");
}

let edited =
  item.source.slice(0, item.targetStart) +
  replacement +
  item.source.slice(item.targetStart + item.oldText.length);

const functionPosition = edited.indexOf("function normalizeRemoteConfigAsResolvedLocal(");
if (functionPosition === -1) {
  throw new Error("Comparator function disappeared before patch; no changes made.");
}
edited = edited.slice(0, functionPosition) + helper + edited.slice(functionPosition);

// Final invariants: exactly one helper declaration and targeted assignment.
assert.equal(edited.split(`function ${PATCH_ID}(`).length, 2);
assert.ok(edited.includes(`normalizedRemote[key] = ${PATCH_ID}(value);`));
writeFileSync(item.filename, edited, "utf8");

console.log(
  "Applied scoped Cloudflare upstream fix to installed cf CLI only. " +
  "No source config changed; strict validation remains enabled."
);
