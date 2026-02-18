#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const nextArgs = process.argv.slice(2);
if (!nextArgs.length) {
  console.error("Usage: node scripts/next-with-localstorage.mjs <next-args...>");
  process.exit(1);
}

const existingNodeOptions = process.env.NODE_OPTIONS?.trim() ?? "";
const localStorageFlag = "--localstorage-file=.next/node-localstorage.json";
const nodeOptions = existingNodeOptions.includes("--localstorage-file")
  ? existingNodeOptions
  : `${existingNodeOptions} ${localStorageFlag}`.trim();

const child = spawn(process.execPath, [nextBin, ...nextArgs], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
