/**
 * Runs the Python harness through real Pyodide (CPython on WebAssembly), using
 * the same stdout-capture and runPythonAsync calls as the browser worker in
 * src/lib/python.ts. The browser worker additionally loads Pyodide from a CDN
 * via importScripts, which this cannot exercise.
 *
 * Requires: npm install --no-save pyodide@<same version as PYODIDE_VERSION>
 * Usage: npx tsx scripts/check-pyodide.ts
 */
import { buildHarness, parseResults, MARKER } from "../src/lib/harness";
import { tidyPythonTrace } from "../src/lib/py-error";
import { PYODIDE_VERSION } from "../src/lib/python";
import { SAMPLE_PROBLEMS } from "../src/lib/samples";
import type { TestCase, TestResult } from "../src/lib/types";

/**
 * Deliberately not a static import. Pyodide is only needed by this one script,
 * so it stays out of package.json and the specifier is assembled at runtime to
 * keep `tsc --noEmit` and `next build` working without it installed.
 */
type PyProxy = { destroy: () => void };
type PyodideInterface = {
  runPython: (code: string) => PyProxy;
  runPythonAsync: (code: string, options?: { globals?: PyProxy }) => Promise<unknown>;
};
type PyodideModule = {
  loadPyodide: (options: {
    stdout?: (line: string) => void;
    stderr?: (line: string) => void;
  }) => Promise<PyodideInterface>;
  version?: string;
};

async function importPyodide(): Promise<PyodideModule> {
  const specifier = ["pyo", "dide"].join("");
  try {
    return (await import(specifier)) as PyodideModule;
  } catch {
    console.error(
      `Pyodide is not installed. This check needs the interpreter locally:\n` +
        `  npm install --no-save pyodide@${PYODIDE_VERSION}\n` +
        `It is intentionally not a project dependency: the app loads Pyodide from a CDN at runtime.`,
    );
    process.exit(2);
  }
}

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`);
  }
}

// Mirrors the worker: buffers whatever Pyodide hands to the stdout/stderr hooks.
let out: string[] = [];
let err: string[] = [];

async function exec(
  py: PyodideInterface,
  code: string,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  out = [];
  err = [];
  // Same fresh-namespace-per-run rule as the worker in src/lib/python.ts.
  const ns = py.runPython("{'__name__': '__main__'}");
  try {
    await py.runPythonAsync(code, { globals: ns });
    return { ok: true, stdout: out.join("\n"), stderr: err.join("\n") };
  } catch (runError) {
    const message =
      runError instanceof Error ? runError.message : String(runError);
    return {
      ok: false,
      stdout: out.join("\n"),
      stderr: tidyPythonTrace(`${err.join("\n")}\n${message}`),
    };
  } finally {
    ns.destroy();
  }
}

async function resultsFor(
  py: PyodideInterface,
  userCode: string,
  functionName: string,
  tests: TestCase[],
): Promise<{ results: TestResult[] | null; stderr: string; stdout: string }> {
  const source = buildHarness("python", userCode, functionName, tests);
  const run = await exec(py, source);
  return {
    results: parseResults(run.stdout).results,
    stderr: run.stderr,
    stdout: run.stdout,
  };
}

async function main() {
  const pyodide = await importPyodide();
  const pkgVersion = pyodide.version ?? "unknown";

  console.log(`Pyodide package ${pkgVersion} (app pins v${PYODIDE_VERSION})`);
  check(
    "installed Pyodide matches the version the app loads from the CDN",
    pkgVersion === PYODIDE_VERSION,
    `package=${pkgVersion} app=${PYODIDE_VERSION}`,
  );

  const started = Date.now();
  const py = await pyodide.loadPyodide({
    stdout: (line: string) => out.push(line),
    stderr: (line: string) => err.push(line),
  });
  console.log(`  (interpreter booted in ${Date.now() - started}ms)\n`);

  // ---------------------------------------------------- stdout capture

  console.log("Interpreter and stdout capture");
  {
    const run = await exec(py, 'print("hello from pyodide")\nprint("second line")');
    check(
      "print output reaches the stdout hook, line by line",
      run.ok && run.stdout.includes("hello from pyodide") && run.stdout.includes("second line"),
      JSON.stringify(run),
    );

    const boom = await exec(py, 'raise ValueError("kaboom")');
    check(
      "an uncaught exception is reported as a failure with the message",
      !boom.ok && boom.stderr.includes("kaboom"),
      JSON.stringify(boom),
    );

    const survives = await exec(py, 'print("still alive")');
    check(
      "the interpreter is reusable after an exception",
      survives.ok && survives.stdout.includes("still alive"),
      JSON.stringify(survives),
    );
  }

  // ---------------------------------------------------- Test and Submit, correct vs wrong

  console.log("\nTest and Submit through real Pyodide");
  const twoSum = SAMPLE_PROBLEMS["two-sum"];
  const good = `class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
        return []`;
  const bad = `class Solution:
    def twoSum(self, nums, target):
        return [0, 1]`;

  {
    // Test = example cases only.
    const run = await resultsFor(py, good, twoSum.functionName, twoSum.exampleTests);
    check(
      `Test: correct solution passes all ${twoSum.exampleTests.length} example cases`,
      run.results !== null &&
        run.results.length === twoSum.exampleTests.length &&
        run.results.every((r) => r.pass),
      `${JSON.stringify(run.results)} stderr=${run.stderr.slice(0, 300)}`,
    );

    // Submit = example + hidden.
    const all = [...twoSum.exampleTests, ...twoSum.hiddenTests];
    const submit = await resultsFor(py, good, twoSum.functionName, all);
    check(
      `Submit: correct solution passes all ${all.length} cases (example + hidden)`,
      submit.results !== null &&
        submit.results.length === all.length &&
        submit.results.every((r) => r.pass),
      `${JSON.stringify(submit.results)} stderr=${submit.stderr.slice(0, 300)}`,
    );

    const wrong = await resultsFor(py, bad, twoSum.functionName, all);
    const failed = wrong.results?.filter((r) => !r.pass) ?? [];
    check(
      "Submit: hardcoded wrong solution genuinely fails",
      failed.length > 0,
      `results=${JSON.stringify(wrong.results)}`,
    );
    check(
      "failing cases carry the actual value for the diff view",
      failed.length > 0 && failed.every((r) => r.actual !== undefined),
      JSON.stringify(failed.slice(0, 2)),
    );
  }

  // ---------------------------------------------------- the other two samples

  for (const key of ["valid-parentheses", "buy-sell"] as const) {
    const problem = SAMPLE_PROBLEMS[key];
    const all = [...problem.exampleTests, ...problem.hiddenTests];
    const solution =
      key === "valid-parentheses"
        ? `class Solution:
    def isValid(self, s):
        pairs = {")": "(", "]": "[", "}": "{"}
        stack = []
        for ch in s:
            if ch in pairs:
                if not stack or stack.pop() != pairs[ch]:
                    return False
            else:
                stack.append(ch)
        return not stack`
        : `class Solution:
    def maxProfit(self, prices):
        best, low = 0, prices[0]
        for p in prices[1:]:
            low = min(low, p)
            best = max(best, p - low)
        return best`;

    const run = await resultsFor(py, solution, problem.functionName, all);
    check(
      `${problem.title}: correct solution passes all ${all.length}`,
      run.results !== null && run.results.every((r) => r.pass),
      `${JSON.stringify(run.results)} stderr=${run.stderr.slice(0, 300)}`,
    );
  }

  // ---------------------------------------------------- plain function, no Solution class

  console.log("\nShapes of user code");
  {
    const bare = `def twoSum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
    return []`;
    const run = await resultsFor(py, bare, twoSum.functionName, twoSum.exampleTests);
    check(
      "a bare top-level function is found and passes",
      run.results !== null && run.results.every((r) => r.pass),
      `${JSON.stringify(run.results)} stderr=${run.stderr.slice(0, 300)}`,
    );
  }
  {
    // The starter code the app ships has an empty method body.
    const starter = twoSum.starterCode.python ?? "";
    const run = await resultsFor(py, starter, twoSum.functionName, twoSum.exampleTests);
    check(
      "untouched starter code fails cleanly instead of hanging or crashing",
      run.results === null && run.stderr.length > 0,
      `results=${JSON.stringify(run.results)} stderr=${run.stderr.slice(0, 200)}`,
    );
  }
  {
    const printing = `def twoSum(nums, target):
    print("debugging", nums)
    return [0, 1]`;
    const run = await resultsFor(py, printing, twoSum.functionName, [
      { args: [[2, 7], 9], expected: [0, 1] },
    ]);
    const cleaned = parseResults(run.stdout).cleaned;
    check(
      "user print output is kept separate from the results marker",
      run.results !== null &&
        run.results[0].pass &&
        cleaned.includes("debugging") &&
        !cleaned.includes(MARKER),
      `cleaned=${JSON.stringify(cleaned)} results=${JSON.stringify(run.results)}`,
    );
  }

  // ---------------------------------------------------- isolation between runs

  console.log("\nIsolation between runs (interpreter is reused)");
  {
    // Define a Solution class, then run code that does not define one at all.
    await resultsFor(py, good, twoSum.functionName, twoSum.exampleTests);
    const orphan = await resultsFor(py, 'x = 1', twoSum.functionName, twoSum.exampleTests);
    check(
      "a previous run's Solution class does not satisfy a later run",
      orphan.results !== null && orphan.results.every((r) => !r.pass),
      `results=${JSON.stringify(orphan.results)}`,
    );

    // A stale bare function must not leak either.
    await resultsFor(
      py,
      `def twoSum(nums, target):\n    return [0, 1]`,
      twoSum.functionName,
      [{ args: [[2, 7], 9], expected: [0, 1] }],
    );
    const orphan2 = await resultsFor(py, "y = 2", twoSum.functionName, [
      { args: [[2, 7], 9], expected: [0, 1] },
    ]);
    check(
      "a previous run's bare function does not satisfy a later run",
      orphan2.results !== null && orphan2.results.every((r) => !r.pass),
      `results=${JSON.stringify(orphan2.results)}`,
    );

    // And imports still work inside a fresh namespace.
    const withImport = await resultsFor(
      py,
      `from typing import List\nimport math\n\n\nclass Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        assert math.floor(1.5) == 1\n        seen = {}\n        for i, n in enumerate(nums):\n            if target - n in seen:\n                return [seen[target - n], i]\n            seen[n] = i\n        return []`,
      twoSum.functionName,
      twoSum.exampleTests,
    );
    check(
      "imports and typing hints work inside the per-run namespace",
      withImport.results !== null && withImport.results.every((r) => r.pass),
      `${JSON.stringify(withImport.results)} stderr=${withImport.stderr.slice(0, 300)}`,
    );
  }

  console.log(
    failures === 0
      ? "\nAll Pyodide checks passed."
      : `\n${failures} check(s) FAILED.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
