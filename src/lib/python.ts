/**
 * Runs Python in the browser with Pyodide (CPython compiled to WebAssembly).
 *
 * The runtime is a ~10MB download, so it is fetched from a CDN on first use
 * rather than bundled, and the interpreter is kept alive in a single worker
 * and reused across runs. Only a timeout tears it down, because Pyodide has no
 * way to interrupt a runaway loop without SharedArrayBuffer, which needs
 * cross-origin isolation headers this app does not set.
 *
 * The worker is a real same-origin *module* worker (public/pyodide-worker.js).
 * Pyodide 314+ throws "Classic web workers are not supported" if importScripts
 * exists, so this cannot be a Blob classic worker even if the CDN were reachable.
 */

export const PYODIDE_VERSION = "314.0.6";
export const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

const WORKER_PATH = "/pyodide-worker.js";

/** How long a single piece of user code may run once the interpreter is warm. */
const EXEC_TIMEOUT_MS = 10_000;
/** First-run budget for pulling ~10MB off the CDN and booting CPython. */
const LOAD_TIMEOUT_MS = 120_000;

export type PythonStage = "downloading" | "starting" | "ready" | "running";

export type PythonRun = {
  ok: boolean;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

type Pending = {
  resolve: (run: PythonRun) => void;
  onProgress?: (stage: PythonStage) => void;
  timer: ReturnType<typeof setTimeout> | null;
};

let worker: Worker | null = null;
let loadState: "cold" | "loading" | "ready" = "cold";
/** A run waiting on a reply. Warmups deliberately do not occupy this slot. */
let pending: Pending | null = null;
/** Where load progress goes when a warmup is in flight with no run behind it. */
let warmProgress: ((stage: PythonStage) => void) | null = null;

function workerUrl() {
  return `${WORKER_PATH}?indexURL=${encodeURIComponent(INDEX_URL)}`;
}

function teardown() {
  if (worker) worker.terminate();
  worker = null;
  loadState = "cold";
}

function settle(run: PythonRun) {
  const current = pending;
  pending = null;
  if (!current) return;
  if (current.timer) clearTimeout(current.timer);
  current.resolve(run);
}

function armExecTimer() {
  if (!pending) return;
  if (pending.timer) clearTimeout(pending.timer);
  pending.timer = setTimeout(() => {
    // The interpreter cannot be interrupted, so the whole worker goes and the
    // next run pays the startup cost again.
    teardown();
    settle({
      ok: false,
      stdout: "",
      stderr: `Timed out after ${EXEC_TIMEOUT_MS / 1000}s (possible infinite loop).`,
      timedOut: true,
    });
  }, EXEC_TIMEOUT_MS);
}

function spawn(): Worker {
  const next = new Worker(workerUrl(), { type: "module" });

  next.onmessage = (event: MessageEvent) => {
    const data = event.data || {};

    if (data.type === "progress") {
      const stage = data.stage as PythonStage;
      const report = pending?.onProgress ?? warmProgress;
      if (stage === "ready") {
        loadState = "ready";
        warmProgress = null;
        // Startup is done, so the run itself now gets the short leash.
        if (pending) {
          report?.("running");
          armExecTimer();
        } else {
          report?.("ready");
        }
      } else {
        loadState = "loading";
        report?.(stage);
      }
      return;
    }

    if (data.type === "warm") {
      loadState = "ready";
      warmProgress = null;
      return;
    }

    if (data.type === "done") {
      settle({
        ok: Boolean(data.ok),
        stdout: String(data.stdout ?? ""),
        stderr: String(data.stderr ?? ""),
      });
    }
  };

  next.onerror = (event) => {
    teardown();
    settle({
      ok: false,
      stdout: "",
      stderr: event.message || "The Python worker crashed.",
    });
  };

  return next;
}

function post(message: unknown, onProgress?: (stage: PythonStage) => void) {
  return new Promise<PythonRun>((resolve) => {
    if (pending) {
      resolve({ ok: false, stdout: "", stderr: "Python is already running." });
      return;
    }

    const wasReady = loadState === "ready";
    pending = { resolve, onProgress, timer: null };

    if (!worker) {
      loadState = "loading";
      worker = spawn();
    }

    if (wasReady) {
      onProgress?.("running");
      armExecTimer();
    } else {
      // Give the CDN download room; armExecTimer takes over once it is warm.
      pending.timer = setTimeout(() => {
        teardown();
        settle({
          ok: false,
          stdout: "",
          stderr: "Timed out loading the Python runtime. Check your connection and try again.",
        });
      }, LOAD_TIMEOUT_MS);
    }

    worker.postMessage(message);
  });
}

/**
 * Kicks off the CDN download early so the first Run does not sit there. This
 * does not take the run slot, so pressing Run mid-download still works: the
 * worker queues it behind the same load.
 */
export function warmPython(onProgress?: (stage: PythonStage) => void) {
  if (loadState !== "cold") return;
  loadState = "loading";
  warmProgress = onProgress ?? null;
  if (!worker) worker = spawn();
  worker.postMessage({ type: "warmup" });
}

export function runPython(
  code: string,
  onProgress?: (stage: PythonStage) => void,
): Promise<PythonRun> {
  return post({ type: "run", code }, onProgress);
}
