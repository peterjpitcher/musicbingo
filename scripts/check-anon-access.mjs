#!/usr/bin/env node

/**
 * Guards what Supabase's public anon key can reach in the live database.
 *
 * The reviewed state lives in `supabase/anon-access-allowlist.mjs`. This script
 * reads the live catalogue and fails when the database grants anon anything that
 * file does not allow.
 *
 *   npm run check:anon-access
 *
 * WHY A SCRIPT AND NOT A TEST
 *   This repository has no test runner that could host a database check without
 *   dragging production credentials into `npm run verify`, and adding one for a
 *   single guard is not worth it. A script is opt-in by nature: it says what it
 *   did, and it exits zero and explains itself when there is nothing to connect
 *   to, so it can sit in a pipeline without turning red on every machine that
 *   has no database URL.
 *
 * WHY .mjs
 *   Everything in `scripts/` is a plain ES module, this repository has no
 *   TypeScript runner in its dependencies, and `.nvmrc` pins Node 20.9, which
 *   cannot strip types. Plain JavaScript keeps the guard runnable on the Node the
 *   repository already requires, with nothing new installed.
 *
 * IT CANNOT CHANGE ANYTHING
 *   One SELECT, and the session is forced read-only through PGOPTIONS, so a
 *   mistake here cannot write to the database it is inspecting. psql is used
 *   rather than a driver because this repository has no Postgres client in its
 *   dependencies and adding one to run a single query would be the wrong trade.
 *
 * CONNECTING
 *   Set SUPABASE_DB_URL to the project's direct Postgres URL, from the Supabase
 *   dashboard under Project Settings, Database. DATABASE_URL is accepted as an
 *   alias. Either may live in `.env.local`, which this script reads and which git
 *   ignores. Without one the script exits zero and says it skipped.
 *
 * USAGE
 *   node scripts/check-anon-access.mjs                     Live check.
 *   node scripts/check-anon-access.mjs --self-test         Prove the comparison
 *                                                          rules with fixtures.
 *                                                          Needs no database.
 *   node scripts/check-anon-access.mjs --print-query       Print the read-only
 *                                                          SQL, to paste into the
 *                                                          Supabase SQL editor.
 *   node scripts/check-anon-access.mjs --catalogue-file f  Diff a saved reading
 *                                                          of that query instead
 *                                                          of connecting.
 *
 * EXIT CODES
 *   0  no drift, or no database configured, or a self-test that passed.
 *   1  drift found, or the allowlist file breaks its own rules.
 *   2  the check was asked to run and could not.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ANON_ALLOWLIST,
  ANON_CATALOGUE_QUERY,
  ANON_REVIEW_NOTES,
  describeAnonAccessFindings,
  diffAnonAccess,
  validateAllowlist,
} from '../supabase/anon-access-allowlist.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST_PATH = 'supabase/anon-access-allowlist.mjs';

// ---------------------------------------------------------------------------
// Finding a connection string, without printing it.
// ---------------------------------------------------------------------------

const CONNECTION_KEYS = ['SUPABASE_DB_URL', 'DATABASE_URL'];

/**
 * Read a connection string out of `.env.local` if the environment has none.
 * Only the two keys above are read and the value is never printed. Missing or
 * unreadable files are not an error: this is a convenience, not a requirement.
 */
function connectionFromEnvFile() {
  for (const name of ['.env.local', '.env']) {
    let contents;
    try {
      contents = readFileSync(resolve(REPO_ROOT, name), 'utf8');
    } catch {
      continue;
    }
    for (const line of contents.split('\n')) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match || !CONNECTION_KEYS.includes(match[1])) continue;
      const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
      if (value) return value;
    }
  }
  return '';
}

function connectionString() {
  for (const key of CONNECTION_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return connectionFromEnvFile();
}

function psqlAvailable() {
  const probe = spawnSync('psql', ['--version'], { encoding: 'utf8' });
  return probe.status === 0;
}

// ---------------------------------------------------------------------------
// Reading the live catalogue.
// ---------------------------------------------------------------------------

function readLiveCatalogue(connection) {
  const result = spawnSync(
    'psql',
    ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', ANON_CATALOGUE_QUERY, connection],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        // Belt and braces: this session cannot write, whatever the query says.
        PGOPTIONS: '-c default_transaction_read_only=on',
        PGCONNECT_TIMEOUT: '15',
      },
    },
  );

  if (result.error) throw new Error(`could not run psql: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `psql exited ${result.status} while reading the anon catalogue.\n${result.stderr?.trim() ?? ''}`,
    );
  }

  const output = result.stdout.trim();
  if (!output) {
    throw new Error('psql returned no rows for the anon catalogue query, which should be impossible');
  }
  return JSON.parse(output);
}

function readCatalogueFile(path) {
  const parsed = JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'));
  // Accept either the bare array or a psql/SQL-editor row wrapping it.
  if (Array.isArray(parsed)) {
    if (parsed.length === 1 && parsed[0] && Array.isArray(parsed[0].reachable)) {
      return parsed[0].reachable;
    }
    return parsed;
  }
  if (parsed && Array.isArray(parsed.reachable)) return parsed.reachable;
  throw new Error(
    `${path} does not hold a catalogue reading. Expected the JSON array the query returns, optionally wrapped in a row with a "reachable" column.`,
  );
}

// ---------------------------------------------------------------------------
// The comparison rules, proven with fixtures. Without these, a run on a machine
// with no database configured would prove nothing at all.
// ---------------------------------------------------------------------------

function selfTest() {
  const fixtureAllowlist = [
    { kind: 'table', name: 'brands', privileges: ['SELECT'], why: 'fixture' },
  ];
  const fixtureForbidden = [
    { kind: 'function', name: 'prune_session_events', privileges: null, why: 'fixture: destructive' },
    { kind: 'table', name: 'live_sessions', privileges: ['SELECT'], why: 'fixture: holds host secrets' },
  ];

  // A live state that matches the allowlist passes.
  {
    const { findings, stale } = diffAnonAccess(
      [{ kind: 'table', name: 'brands', privileges: ['SELECT'] }],
      fixtureAllowlist,
      fixtureForbidden,
    );
    assert.deepEqual(findings, []);
    assert.deepEqual(stale, []);
  }

  // An object anon reaches that is not allowlisted fails, and is named.
  {
    const { findings } = diffAnonAccess(
      [
        { kind: 'table', name: 'brands', privileges: ['SELECT'] },
        { kind: 'table', name: 'session_events', privileges: ['SELECT'] },
      ],
      fixtureAllowlist,
      fixtureForbidden,
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0].problem, 'unlisted');
    assert.equal(findings[0].name, 'session_events');
    assert.ok(describeAnonAccessFindings(findings).includes('session_events'));
  }

  // A listed object whose privileges widened fails on the extra privileges only.
  {
    const { findings } = diffAnonAccess(
      [{ kind: 'table', name: 'brands', privileges: ['SELECT', 'UPDATE', 'DELETE'] }],
      fixtureAllowlist,
      fixtureForbidden,
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0].problem, 'widened');
    assert.deepEqual(findings[0].extraPrivileges, ['DELETE', 'UPDATE']);
  }

  // An empty allowlist means every reachable object is drift. This is the exact
  // shape this project is in, so it is the case worth proving.
  {
    const { findings } = diffAnonAccess(
      [{ kind: 'table', name: 'brands', privileges: ['SELECT'] }],
      [],
      [],
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0].problem, 'unlisted');
  }

  // A function overload cannot hide behind a sibling with the same name.
  {
    const { findings } = diffAnonAccess(
      [
        { kind: 'function', name: 'f(a uuid)', privileges: ['EXECUTE'] },
        { kind: 'function', name: 'f(a uuid, b uuid)', privileges: ['EXECUTE'] },
      ],
      [{ kind: 'function', name: 'f(a uuid)', privileges: ['EXECUTE'], why: 'fixture' }],
      [],
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0].name, 'f(a uuid, b uuid)');
  }

  // A forbidden object reads as an incident, whichever overload it arrives as.
  {
    const { findings } = diffAnonAccess(
      [{ kind: 'function', name: 'prune_session_events(retain_days integer)', privileges: ['EXECUTE'] }],
      [],
      fixtureForbidden,
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0].forbidden, 'fixture: destructive');
    assert.ok(describeAnonAccessFindings(findings).includes('INCIDENT'));
  }

  // An allowlist entry the database no longer grants is reported, not failed.
  {
    const { findings, stale } = diffAnonAccess([], fixtureAllowlist, fixtureForbidden);
    assert.deepEqual(findings, []);
    assert.deepEqual(stale, ['table brands']);
  }

  // The allowlist cannot bless a forbidden object, at object or privilege level.
  {
    assert.equal(validateAllowlist([], fixtureForbidden).length, 0);
    assert.equal(
      validateAllowlist(
        [{ kind: 'function', name: 'prune_session_events(retain_days integer)', privileges: ['EXECUTE'], why: 'someone tried' }],
        fixtureForbidden,
      ).length,
      1,
    );
    assert.equal(
      validateAllowlist(
        [{ kind: 'table', name: 'live_sessions', privileges: ['SELECT'], why: 'someone tried' }],
        fixtureForbidden,
      ).length,
      1,
    );
    // The same table with a privilege the rule does not name is allowed through.
    assert.equal(
      validateAllowlist(
        [{ kind: 'table', name: 'live_sessions', privileges: ['MAINTAIN'], why: 'harmless' }],
        fixtureForbidden,
      ).length,
      0,
    );
  }

  // An entry with no reason, or no privileges, is rejected.
  {
    assert.equal(validateAllowlist([{ kind: 'table', name: 'x', privileges: ['SELECT'], why: '  ' }], []).length, 1);
    assert.equal(validateAllowlist([{ kind: 'table', name: 'x', privileges: [], why: 'ok' }], []).length, 1);
  }

  console.log('self-test: the comparison rules behave, across 10 fixtures.');
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--print-query')) {
    console.log(ANON_CATALOGUE_QUERY);
    return 0;
  }

  // The allowlist has to obey its own rules before its verdict means anything.
  // This needs no database, so it runs first and always.
  const problems = validateAllowlist();
  if (problems.length > 0) {
    console.error(`${ALLOWLIST_PATH} breaks its own rules:\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    return 1;
  }

  if (args.includes('--self-test')) {
    selfTest();
    return 0;
  }

  const fileIndex = args.indexOf('--catalogue-file');
  let reachable;

  if (fileIndex !== -1) {
    const path = args[fileIndex + 1];
    if (!path) {
      console.error('--catalogue-file needs a path to a saved reading of the catalogue query.');
      return 2;
    }
    reachable = readCatalogueFile(path);
    console.log(`anon-access: read a saved catalogue from ${path}.`);
  } else {
    const connection = connectionString();

    if (!connection) {
      console.log(
        [
          'anon-access: skipped, because no database connection is configured.',
          '',
          `  The reviewed state is committed in ${ALLOWLIST_PATH} and was not checked`,
          '  against the live database on this run.',
          '',
          '  To run it, set SUPABASE_DB_URL to the project\'s direct Postgres URL, from',
          '  the Supabase dashboard under Project Settings, Database. It can go in',
          '  .env.local, which git ignores. DATABASE_URL works too.',
          '',
          '  Without a connection there is nothing to compare, so this is a pass rather',
          '  than a failure. Run --self-test to prove the comparison rules offline.',
        ].join('\n'),
      );
      return 0;
    }

    if (!psqlAvailable()) {
      console.error(
        [
          'anon-access: a connection is configured but psql is not on PATH, so the live',
          'catalogue could not be read. This is a failure rather than a skip, because the',
          'check was asked to run and did not.',
          '',
          '  brew install libpq        (then add it to PATH)',
          '  apt-get install postgresql-client',
        ].join('\n'),
      );
      return 2;
    }

    reachable = readLiveCatalogue(connection);
  }

  console.log(`anon-access: anon can reach ${reachable.length} object(s) in schema public.`);

  const { findings, stale } = diffAnonAccess(reachable);

  for (const key of stale) {
    console.log(
      `anon-access: ${key} is allowlisted but anon no longer reaches it. The database got tighter; trim ${ALLOWLIST_PATH}.`,
    );
  }

  if (findings.length > 0) {
    console.error('');
    console.error(describeAnonAccessFindings(findings));
    return 1;
  }

  console.log(`anon-access: no drift. The live database matches ${ALLOWLIST_PATH}.`);
  for (const note of ANON_REVIEW_NOTES) {
    console.log(`anon-access: note. ${note}`);
  }
  if (ANON_ALLOWLIST.length === 0) {
    console.log(
      'anon-access: the allowlist is empty and the database agrees. anon reaches nothing in schema public.',
    );
  }
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`anon-access: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
