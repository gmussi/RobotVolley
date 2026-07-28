/**
 * Bot fleet supervisor.
 *
 * Forks N `bot.mjs` children — one process each, because the engine is a
 * module-level singleton — restarts them if they die, and folds their JSON log
 * lines into a periodic summary so a fleet of twenty is one line of output
 * rather than twenty streams.
 *
 *   npm run bots -- --count 8 --skill mixed
 *   npm run bots -- --count 2 --url ws://127.0.0.1:8787/ws --skill hard
 *
 * Configuration comes from flags, then the environment, then `.env`. See
 * docs/bots.md.
 */
import { fork } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const BOT = join(HERE, "bot.mjs");

// --------------------------------------------------------------- configuration

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq > 0) out[arg.slice(2, eq)] = arg.slice(eq + 1);
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) out[arg.slice(2)] = argv[++i];
    else out[arg.slice(2)] = "true";
  }
  return out;
}

/** Minimal .env reader — the bots run outside Vite, which usually does this. */
async function readDotEnv() {
  const env = {};
  for (const file of [".env", ".env.local"]) {
    let text;
    try {
      text = await readFile(join(REPO, file), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const args = parseArgs(process.argv.slice(2));
const dotenv = await readDotEnv();

const count = Math.max(1, Number(args.count ?? 4));
const skill = args.skill ?? "mixed";
const staggerMs = Number(args.stagger ?? 1500);
const summaryMs = Number(args.summary ?? 10_000);
const prefix = args.prefix ?? "bot";
const verbose = args.verbose === "true";
const url = args.url ?? process.env.BOT_MM_URL ?? dotenv.VITE_MATCHMAKING_URL ?? "";
const apiUrl = args.api ?? process.env.BOT_API_URL ?? dotenv.VITE_API_URL ?? "";
const botSecret = args.secret ?? process.env.BOT_SECRET ?? dotenv.BOT_SECRET ?? "";

if (!url) {
  console.error(
    "No matchmaking URL. Pass --url wss://…/ws, or set VITE_MATCHMAKING_URL in .env",
  );
  process.exit(2);
}
if (!botSecret) {
  console.error(
    "No BOT_SECRET. Pass --secret <value>, or set BOT_SECRET in .env — it must match\n" +
      "the worker secret (`npx wrangler secret put BOT_SECRET` in server/).",
  );
  process.exit(2);
}

// ------------------------------------------------------------------- the fleet

/** @type {Map<string, {child: any, state: string, restarts: number, matches: number, wins: number, errors: number, since: number}>} */
const fleet = new Map();
const waits = [];
let shuttingDown = false;

function record(label) {
  if (!fleet.has(label)) {
    fleet.set(label, {
      child: null, state: "starting", restarts: -1,
      matches: 0, wins: 0, errors: 0, since: Date.now(),
    });
  }
  return fleet.get(label);
}

function onBotEvent(label, msg) {
  const b = record(label);
  switch (msg.ev) {
    case "start":
      b.skill = msg.skill;
      break;
    case "queueing":
      b.state = "queued";
      b.since = Date.now();
      break;
    case "match_start":
      b.state = "playing";
      b.since = Date.now();
      if (typeof msg.waitedMs === "number") waits.push(msg.waitedMs);
      break;
    case "match_end":
      b.matches++;
      if (msg.won) b.wins++;
      b.state = "finishing";
      break;
    case "match_abandoned":
      b.abandoned = (b.abandoned ?? 0) + 1;
      b.state = "idle";
      console.error(
        `[${label}] abandoned a match after ${Math.round((msg.afterMs ?? 0) / 1000)}s ` +
          `at ${msg.score?.join("-") ?? "?"}`,
      );
      break;
    case "disconnected":
    case "cancelled":
      b.state = "idle";
      break;
    case "error":
      b.errors++;
      // Errors are the one thing never worth hiding behind a summary.
      console.error(`[${label}] error: ${msg.message ?? msg.where ?? "unknown"}`);
      break;
    default:
      break;
  }
  if (verbose) console.log(`[${label}] ${msg.ev} ${JSON.stringify({ ...msg, ev: undefined, bot: undefined, t: undefined })}`);
}

function spawnBot(index) {
  const label = `${prefix}-${index}`;
  const b = record(label);
  b.restarts++;

  const child = fork(BOT, [], {
    cwd: REPO,
    stdio: ["ignore", "pipe", "inherit", "ipc"],
    env: {
      ...process.env,
      BOT_LABEL: label,
      BOT_INDEX: String(index),
      BOT_MM_URL: url,
      BOT_API_URL: apiUrl,
      BOT_SECRET: botSecret,
      BOT_SKILL: skill,
    },
  });
  b.child = child;
  b.state = "starting";

  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        onBotEvent(label, JSON.parse(line));
      } catch {
        console.log(`[${label}] ${line}`);
      }
    }
  });

  child.on("exit", (code, signal) => {
    b.child = null;
    b.state = "dead";
    if (shuttingDown) return;
    // Exit code 2 is a configuration error — restarting cannot fix it.
    if (code === 2) {
      console.error(`[${label}] exited with a configuration error; not restarting`);
      return;
    }
    const delay = Math.min(30_000, 2000 * 2 ** Math.min(b.restarts, 4));
    console.error(
      `[${label}] exited (${signal ?? code}); restarting in ${Math.round(delay / 1000)}s`,
    );
    setTimeout(() => {
      if (!shuttingDown) spawnBot(index);
    }, delay);
  });

  return child;
}

// -------------------------------------------------------------------- summary

function summarise() {
  const bots = [...fleet.values()];
  const by = (state) => bots.filter((b) => b.state === state).length;
  const total = (key) => bots.reduce((n, b) => n + b[key], 0);
  const avgWait = waits.length
    ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length / 1000)
    : null;

  console.log(
    [
      new Date().toISOString().slice(11, 19),
      `${bots.length} bots`,
      `queued ${by("queued")}`,
      `playing ${by("playing")}`,
      `dead ${by("dead")}`,
      `matches ${total("matches")}`,
      `wins ${total("wins")}`,
      `errors ${total("errors")}`,
      avgWait == null ? "wait —" : `avg wait ${avgWait}s`,
    ].join("  |  "),
  );
  // Keep the wait average recent rather than lifetime.
  if (waits.length > 200) waits.splice(0, waits.length - 100);
}

// ------------------------------------------------------------------- shutdown

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\nStopping ${fleet.size} bots…`);
  for (const b of fleet.values()) b.child?.kill(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
  // Give them a moment to leave the queue cleanly, then insist.
  setTimeout(() => {
    for (const b of fleet.values()) b.child?.kill("SIGKILL");
    summarise();
    process.exit(0);
  }, 3000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ----------------------------------------------------------------------- go

console.log(
  `Starting ${count} bot${count === 1 ? "" : "s"} (skill: ${skill}) against ${url}`,
);

// Nothing here is unref'd: these timers are what keep the supervisor alive
// between bot events, and an unref'd one lets Node decide the fleet is over.
for (let i = 0; i < count; i++) {
  // Staggered so a cold fleet doesn't arrive as one thundering herd — and so
  // the pairing sweep sees a queue that grows the way a real one does.
  setTimeout(() => {
    if (!shuttingDown) spawnBot(i);
  }, i * staggerMs);
}

setInterval(summarise, summaryMs);
