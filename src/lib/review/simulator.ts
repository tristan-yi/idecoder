import { transform, type Transform } from "sucrase";
import { WORKER_SOURCE } from "./runtime";
import type { SeedFile, SimOutcome, SimScenario, SimScenarioResult } from "./types";

const TIMEOUT_MS = 6000;

function compile(files: SeedFile[]) {
  const modules: Record<string, string> = {};
  for (const file of files) {
    if (!file.path.endsWith(".ts") && !file.path.endsWith(".tsx")) continue;
    const transforms: Transform[] = file.path.endsWith(".tsx")
      ? ["typescript", "jsx", "imports"]
      : ["typescript", "imports"];
    try {
      modules[file.path] = transform(file.contents, {
        transforms,
        filePath: file.path,
        jsxRuntime: "automatic",
        production: true,
      }).code;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${file.path}: ${message}`);
    }
  }
  return modules;
}

function failed(compileError: string): SimOutcome {
  return {
    ok: false,
    scenarios: [],
    logs: [],
    compileError,
    ranAt: Date.now(),
  };
}

export function runScenarios(
  files: SeedFile[],
  scenarios: SimScenario[],
): Promise<SimOutcome> {
  let modules: Record<string, string>;
  try {
    modules = compile(files);
  } catch (err) {
    return Promise.resolve(
      failed(err instanceof Error ? err.message : "Could not compile the codebase"),
    );
  }

  return new Promise((resolve) => {
    const blob = new Blob([WORKER_SOURCE], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);

    const finish = (outcome: SimOutcome) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(outcome);
    };

    const timer = setTimeout(() => {
      finish(failed("Timed out after 6s. Check for an unresolved promise or an infinite loop."));
    }, TIMEOUT_MS);

    worker.onmessage = (event) => {
      const data = event.data as {
        scenarios: SimScenarioResult[];
        logs: string[];
        compileError: string | null;
      };
      finish({
        ok: !data.compileError && data.scenarios.every((s) => s.pass),
        scenarios: data.scenarios,
        logs: data.logs,
        compileError: data.compileError,
        ranAt: Date.now(),
      });
    };

    worker.onerror = (event) => {
      finish(failed(event.message || "The simulator worker crashed"));
    };

    worker.postMessage({ modules, scenarios });
  });
}
