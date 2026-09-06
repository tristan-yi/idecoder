/**
 * Drives the real same-origin worker at public/pyodide-worker.js outside a
 * browser.
 *
 * This is the piece the other checks cannot reach: it evaluates that file
 * verbatim in a sandbox that provides the handful of worker globals it uses
 * (self, postMessage, importScripts, fetch, location.search), and pulls
 * Pyodide from the same CDN URL the browser would. It verifies the message
 * protocol, the progress events, and per-run namespace isolation.
 *
 * It does NOT verify real Worker plumbing or the main-thread timeout logic,
 * both of which need an actual browser.
 *
 * Usage: npx tsx scripts/check-python-worker.ts
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { buildHarness, parseResults } from "../src/lib/harness";
import { INDEX_URL, PYODIDE_VERSION } from "../src/lib/python";
import { SAMPLE_PROBLEMS } from "../src/lib/samples";
import type { TestResult } from "../src/lib/types";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`);
  }
}

type WorkerMessage =
  | { type: "progress"; stage: string }
  | { type: "warm" }
  | { type: "done"; ok: boolean; stdout: string; stderr: string };

const cacheDir = mkdtempSync(join(tmpdir(), "idecoder-pyodide-"));

// Pyodide loads its wasm through a dynamic import(), which a vm context only
// allows if it is given a loader.
const RUN_OPTS = {
  importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
} as const;

/** importScripts is synchronous, so the script is fetched with curl up front. */
function fetchSync(url: string): string {
  const file = join(cacheDir, url.split("/").pop() || "script.js");
  if (!existsSync(file)) {
    execFileSync("curl", ["-fsSL", "-o", file, url], { timeout: 60_000 });
  }
  return readFileSync(file, "utf8");
}

const messages: WorkerMessage[] = [];
let onMessageHandler: ((event: { data: unknown }) => unknown) | null = null;
let resolveNext: (() => void) | null = null;

const selfShim: Record<string, unknown> = {
  postMessage: (message: WorkerMessage) => {
    messages.push(message);
    if (message.type === "done" || message.type === "warm") resolveNext?.();
  },
  importScripts: (url: string) => {
    vm.runInContext(fetchSync(url), context, { filename: url, ...RUN_OPTS });
  },
  location: {
    href: `http://localhost:3002/pyodide-worker.js?indexURL=${encodeURIComponent(INDEX_URL)}`,
    search: `?indexURL=${encodeURIComponent(INDEX_URL)}`,
  },
};

const sandbox: Record<string, unknown> = {
  self: selfShim,
  console,
  fetch,
  Headers,
  Request,
  Response,
  URL,
  URLSearchParams,
  TextEncoder,
  TextDecoder,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  crypto,
  performance,
  process,
  Blob,
  AbortController,
};
sandbox.globalThis = sandbox;
sandbox.importScripts = selfShim.importScripts;
sandbox.postMessage = selfShim.postMessage;

const context = vm.createContext(sandbox);

// Mirror assignments to `self.x` onto the sandbox global, the way a real worker
// scope does, so `self.loadPyodide = ...` inside pyodide.js is visible.
Object.defineProperty(selfShim, "loadPyodide", {
  get: () => sandbox.loadPyodide,
  set: (value) => {
    sandbox.loadPyodide = value;
  },
  configurable: true,
});

function send(data: unknown): Promise<WorkerMessage[]> {
  const before = messages.length;
  return new Promise((resolve, reject) => {
    resolveNext = () => {
      resolveNext = null;
      resolve(messages.slice(before));
    };
    const timer = setTimeout(() => {
      resolveNext = null;
      reject(new Error("worker did not reply within 180s"));
    }, 180_000);
    const settle = resolveNext;
    resolveNext = () => {
      clearTimeout(timer);
      settle?.();
    };
    void Promise.resolve(onMessageHandler?.({ data })).catch(reject);
  });
}

async function main() {
  console.log(`Evaluating public/pyodide-worker.js (Pyodide v${PYODIDE_VERSION} from jsDelivr)`);

  const workerPath = join(process.cwd(), "public/pyodide-worker.js");
  check("public/pyodide-worker.js exists", existsSync(workerPath));
  const source = readFileSync(workerPath, "utf8");
  check(
    "the worker reads indexURL from the query string (version stays in python.ts)",
    source.includes("indexURL") &&
      source.includes("URLSearchParams") &&
      INDEX_URL.includes(PYODIDE_VERSION),
  );
  check(
    "the worker dynamically imports pyodide.mjs (classic importScripts is unsupported in Pyodide 314)",
    source.includes("pyodide.mjs") && source.includes("import("),
  );

  const pythonTs = readFileSync(join(process.cwd(), "src/lib/python.ts"), "utf8");
  check(
    "python.ts spawns a module worker",
    pythonTs.includes('type: "module"'),
  );

  vm.runInContext(source, context, {
    filename: "pyodide-worker.js",
    ...RUN_OPTS,
  });
  onMessageHandler = selfShim.onmessage as typeof onMessageHandler;
  check("worker registers an onmessage handler", typeof onMessageHandler === "function");
  if (typeof onMessageHandler !== "function") {
    process.exit(1);
  }

  // ---------------------------------------------------- warmup and progress

  console.log("\nWarmup and progress reporting");
  const started = Date.now();
  const warm = await send({ type: "warmup" });
  const stages = warm
    .filter((m): m is { type: "progress"; stage: string } => m.type === "progress")
    .map((m) => m.stage);
  console.log(`  (loaded from CDN in ${Date.now() - started}ms)`);

  const done = warm.find((m) => m.type === "done") as
    | { type: "done"; ok: boolean; stderr: string }
    | undefined;
  const nodeCannotLoadWasm =
    done?.ok === false && /ERR_MODULE_NOT_FOUND|https:|Cannot find module/.test(done.stderr ?? "");

  check(
    "starts with a downloading progress event",
    stages[0] === "downloading",
    `got ${JSON.stringify(stages)}`,
  );

  if (!nodeCannotLoadWasm) {
    check(
      "dynamic import of pyodide.mjs exposes loadPyodide",
      stages[1] === "starting",
      `got ${JSON.stringify(stages)}`,
    );
  }

  if (nodeCannotLoadWasm) {
    // Pyodide boots its wasm with a dynamic import of an https URL. Browsers
    // do that natively; Node cannot. Everything past this point needs either a
    // browser or the npm package, so scripts/check-pyodide.ts covers the
    // interpreter and harness behaviour instead.
    check(
      "a runtime that fails to load reports a clean error instead of hanging",
      done !== undefined && done.ok === false && done.stderr.includes("Could not load the Python runtime"),
      JSON.stringify(done),
    );
    console.log(
      "\n  -- stopping here: Node cannot import Pyodide's wasm over https.\n" +
        "     Verified above: url substitution, worker protocol, CDN fetch, failure reporting.\n" +
        "     Interpreter and harness behaviour is covered by scripts/check-pyodide.ts.",
    );
    console.log(
      failures === 0
        ? "\nAll worker checks that are possible in Node passed."
        : `\n${failures} check(s) FAILED.`,
    );
    process.exit(failures === 0 ? 0 : 1);
  }

  check(
    "reports downloading -> starting -> ready, in order",
    stages.join(",") === "downloading,starting,ready",
    `got ${JSON.stringify(stages)}`,
  );
  check(
    "acknowledges the warmup with a warm message",
    warm.some((m) => m.type === "warm"),
    JSON.stringify(warm),
  );

  // ---------------------------------------------------- a real Test run

  console.log("\nRunning the harness through the worker");
  const twoSum = SAMPLE_PROBLEMS["two-sum"];
  const good = `class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
        return []`;
  const all = [...twoSum.exampleTests, ...twoSum.hiddenTests];

  async function runCode(userCode: string, tests: typeof all | null) {
    const source = buildHarness("python", userCode, twoSum.functionName, tests);
    const replies = await send({ type: "run", code: source });
    const done = replies.find((m) => m.type === "done") as
      | { type: "done"; ok: boolean; stdout: string; stderr: string }
      | undefined;
    return {
      done,
      results: parseResults(done?.stdout ?? "").results as TestResult[] | null,
    };
  }

  {
    const run = await runCode(good, all);
    check(
      `correct solution passes all ${all.length} cases via the worker`,
      run.done?.ok === true &&
        run.results !== null &&
        run.results.length === all.length &&
        run.results.every((r) => r.pass),
      `done=${JSON.stringify(run.done)} results=${JSON.stringify(run.results)}`,
    );
  }

  {
    const run = await runCode(
      `class Solution:
    def twoSum(self, nums, target):
        return [0, 1]`,
      all,
    );
    check(
      "wrong solution genuinely fails via the worker",
      run.results !== null && run.results.some((r) => !r.pass),
      JSON.stringify(run.results),
    );
  }

  {
    // Bare Run mode: no harness, just user code.
    const run = await runCode('print("hi from the worker")', null);
    check(
      "bare Run captures stdout",
      run.done?.ok === true && run.done.stdout.includes("hi from the worker"),
      JSON.stringify(run.done),
    );
  }

  {
    const run = await runCode("raise ValueError('worker boom')", null);
    check(
      "an exception comes back as ok:false with the message",
      run.done?.ok === false && run.done.stderr.includes("worker boom"),
      JSON.stringify(run.done),
    );
  }

  // ---------------------------------------------------- isolation across worker runs

  console.log("\nIsolation across runs in one worker");
  {
    await runCode(good, all);
    const orphan = await runCode("x = 1", all);
    check(
      "the previous run's Solution class does not leak into the next run",
      orphan.results !== null && orphan.results.every((r) => !r.pass),
      JSON.stringify(orphan.results),
    );

    const recovered = await runCode(good, all);
    check(
      "the worker still works correctly after a failing run",
      recovered.results !== null && recovered.results.every((r) => r.pass),
      JSON.stringify(recovered.results),
    );
  }

  console.log(
    failures === 0
      ? "\nAll worker checks passed."
      : `\n${failures} check(s) FAILED.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
