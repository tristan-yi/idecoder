/**
 * Smoke-checks the in-browser runners without a browser.
 *
 * The Python harness is plain CPython, so it is exercised with the local
 * `python3` (Pyodide 314.x is CPython 3.14). The TypeScript path is exercised
 * by running sucrase over the harness and evaluating it the same way the
 * browser worker does.
 *
 * Usage: npx tsx scripts/check-runners.ts
 */
import { execFileSync } from "node:child_process";
import { transform } from "sucrase";
import { buildHarness, parseResults, MARKER } from "../src/lib/harness";
import { SAMPLE_PROBLEMS } from "../src/lib/samples";
import type { TestCase, TestResult } from "../src/lib/types";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`);
  }
}

function runPython(source: string): { stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("python3", ["-c", source], {
      encoding: "utf8",
      timeout: 30_000,
    });
    return { stdout, stderr: "" };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? e.message ?? "error" };
  }
}

/** Mirrors what the browser JS worker does: new Function with a console shim. */
function runJs(source: string): { stdout: string; stderr: string } {
  const logs: string[] = [];
  const errors: string[] = [];
  const cons = {
    log: (...a: unknown[]) =>
      logs.push(
        a.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" "),
      ),
    error: (...a: unknown[]) => errors.push(a.map(String).join(" ")),
    warn: (...a: unknown[]) => logs.push(a.map(String).join(" ")),
    info: (...a: unknown[]) => logs.push(a.map(String).join(" ")),
  };
  try {
    new Function("console", source)(cons);
  } catch (err) {
    errors.push(String(err));
  }
  return { stdout: logs.join("\n"), stderr: errors.join("\n") };
}

function resultsFor(
  language: "python" | "typescript" | "javascript",
  userCode: string,
  functionName: string,
  tests: TestCase[],
): { results: TestResult[] | null; stderr: string } {
  const source = buildHarness(language, userCode, functionName, tests);
  if (language === "python") {
    const { stdout, stderr } = runPython(source);
    return { results: parseResults(stdout).results, stderr };
  }
  const js =
    language === "typescript"
      ? transform(source, {
          transforms: ["typescript"],
          disableESTransforms: true,
        }).code
      : source;
  const { stdout, stderr } = runJs(js);
  return { results: parseResults(stdout).results, stderr };
}

// ---------------------------------------------------------------- Python: correct vs wrong

const PYTHON_SOLUTIONS: Record<string, { good: string; bad: string }> = {
  "two-sum": {
    good: `class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
        return []`,
    // Off by one on the second index.
    bad: `class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i + 1]
            seen[n] = i
        return []`,
  },
  "valid-parentheses": {
    good: `class Solution:
    def isValid(self, s):
        pairs = {")": "(", "]": "[", "}": "{"}
        stack = []
        for ch in s:
            if ch in pairs:
                if not stack or stack.pop() != pairs[ch]:
                    return False
            else:
                stack.append(ch)
        return not stack`,
    // Forgets that leftovers on the stack mean unclosed brackets.
    bad: `class Solution:
    def isValid(self, s):
        pairs = {")": "(", "]": "[", "}": "{"}
        stack = []
        for ch in s:
            if ch in pairs:
                if not stack or stack.pop() != pairs[ch]:
                    return False
            else:
                stack.append(ch)
        return True`,
  },
  "buy-sell": {
    good: `class Solution:
    def maxProfit(self, prices):
        best = 0
        low = prices[0]
        for p in prices[1:]:
            low = min(low, p)
            best = max(best, p - low)
        return best`,
    // Uses the global max/min, allowing a sell before the buy.
    bad: `class Solution:
    def maxProfit(self, prices):
        return max(prices) - min(prices)`,
  },
};

console.log("Python harness (via local python3)");
for (const [key, solutions] of Object.entries(PYTHON_SOLUTIONS)) {
  const problem = SAMPLE_PROBLEMS[key];
  const all = [...problem.exampleTests, ...problem.hiddenTests];

  const good = resultsFor("python", solutions.good, problem.functionName, all);
  check(
    `${problem.title}: correct solution passes all ${all.length}`,
    good.results !== null && good.results.every((r) => r.pass),
    good.results
      ? `failing: ${JSON.stringify(good.results.filter((r) => !r.pass))}`
      : `no results. stderr: ${good.stderr.slice(0, 300)}`,
  );

  const bad = resultsFor("python", solutions.bad, problem.functionName, all);
  check(
    `${problem.title}: wrong solution reports failures`,
    bad.results !== null && bad.results.some((r) => !r.pass),
    bad.results ? "every case passed, harness is not discriminating" : "no results",
  );
}

// ---------------------------------------------------------------- Python: error reporting

console.log("\nPython error handling");
{
  const problem = SAMPLE_PROBLEMS["two-sum"];
  const throwing = `class Solution:
    def twoSum(self, nums, target):
        raise ValueError("boom")`;
  const { results } = resultsFor(
    "python",
    throwing,
    problem.functionName,
    problem.exampleTests,
  );
  check(
    "raising solution fails every case with a traceback",
    results !== null &&
      results.every(
        (r) =>
          !r.pass &&
          typeof r.error === "string" &&
          r.error.includes("boom") &&
          (r.error.includes("Traceback") || r.error.includes("solution.py")),
      ),
    JSON.stringify(results),
  );

  const missing = `def somethingElse(a, b):
    return []`;
  const missingRun = resultsFor(
    "python",
    missing,
    problem.functionName,
    problem.exampleTests,
  );
  check(
    "missing function name produces a helpful NameError",
    missingRun.results !== null &&
      missingRun.results.every(
        (r) => !r.pass && (r.error ?? "").includes("twoSum"),
      ),
    JSON.stringify(missingRun.results),
  );

  const syntax = `class Solution:
    def twoSum(self, nums, target)
        return []`;
  const syntaxRun = resultsFor(
    "python",
    syntax,
    problem.functionName,
    problem.exampleTests,
  );
  check(
    "syntax error surfaces on stderr and yields no results",
    syntaxRun.results === null && syntaxRun.stderr.length > 0,
    `results=${JSON.stringify(syntaxRun.results)} stderr=${syntaxRun.stderr.slice(0, 200)}`,
  );
}

// ---------------------------------------------------------------- Python: JSON equality semantics

console.log("\nPython/JSON equality");
type EqCase = {
  label: string;
  ret: string;
  expected: unknown;
  shouldPass: boolean;
};
const EQ_CASES: EqCase[] = [
  { label: "tuple vs JSON array", ret: "(0, 1)", expected: [0, 1], shouldPass: true },
  { label: "list vs JSON array", ret: "[0, 1]", expected: [0, 1], shouldPass: true },
  { label: "float 5.0 vs int 5", ret: "5.0", expected: 5, shouldPass: true },
  { label: "int 5 vs int 5", ret: "5", expected: 5, shouldPass: true },
  { label: "wrong order fails", ret: "[1, 0]", expected: [0, 1], shouldPass: false },
  { label: "True vs true", ret: "True", expected: true, shouldPass: true },
  { label: "True is not 1", ret: "True", expected: 1, shouldPass: false },
  { label: "1 is not true", ret: "1", expected: true, shouldPass: false },
  { label: "None vs null", ret: "None", expected: null, shouldPass: true },
  { label: "None is not 0", ret: "None", expected: 0, shouldPass: false },
  {
    label: "nested dict key order ignored",
    ret: '{"b": 2, "a": 1}',
    expected: { a: 1, b: 2 },
    shouldPass: true,
  },
  {
    label: "nested lists compare deeply",
    ret: "[[1, 2], [3]]",
    expected: [[1, 2], [3]],
    shouldPass: true,
  },
  {
    label: "nested list mismatch fails",
    ret: "[[1, 2], [4]]",
    expected: [[1, 2], [3]],
    shouldPass: false,
  },
  { label: "string vs number fails", ret: '"5"', expected: 5, shouldPass: false },
  { label: "length mismatch fails", ret: "[0]", expected: [0, 1], shouldPass: false },
];

for (const eq of EQ_CASES) {
  const code = `def probe():\n    return ${eq.ret}`;
  const { results, stderr } = resultsFor("python", code, "probe", [
    { args: [], expected: eq.expected },
  ]);
  const got = results?.[0]?.pass;
  check(
    `${eq.label} -> ${eq.shouldPass ? "pass" : "fail"}`,
    got === eq.shouldPass,
    `got ${JSON.stringify(got)} results=${JSON.stringify(results)} stderr=${stderr.slice(0, 200)}`,
  );
}

// ---------------------------------------------------------------- Python: bare Run mode

console.log("\nPython bare Run (no tests)");
{
  const source = buildHarness("python", 'print("hello from python")', "twoSum", null);
  const { stdout } = runPython(source);
  check(
    "print output is captured and has no results marker",
    stdout.includes("hello from python") && !stdout.includes(MARKER),
    JSON.stringify(stdout),
  );
}

// ---------------------------------------------------------------- TypeScript + JavaScript

console.log("\nTypeScript via sucrase, and JavaScript");
{
  const problem = SAMPLE_PROBLEMS["two-sum"];
  const all = [...problem.exampleTests, ...problem.hiddenTests];

  const tsGood = `function twoSum(nums: number[], target: number): number[] {
  const seen = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const need: number = target - nums[i];
    if (seen.has(need)) return [seen.get(need)!, i];
    seen.set(nums[i], i);
  }
  return [];
}`;
  const tsRun = resultsFor("typescript", tsGood, problem.functionName, all);
  check(
    "TypeScript correct solution passes all cases",
    tsRun.results !== null && tsRun.results.every((r) => r.pass),
    `${JSON.stringify(tsRun.results)} stderr=${tsRun.stderr.slice(0, 200)}`,
  );

  const tsBad = tsGood.replace("return [seen.get(need)!, i]", "return [seen.get(need)!, i + 1]");
  const tsBadRun = resultsFor("typescript", tsBad, problem.functionName, all);
  check(
    "TypeScript wrong solution reports failures",
    tsBadRun.results !== null && tsBadRun.results.some((r) => !r.pass),
    JSON.stringify(tsBadRun.results),
  );

  const tsClass = `class Solution {
  twoSum(nums: number[], target: number): number[] {
    const seen: Record<number, number> = {};
    for (let i = 0; i < nums.length; i++) {
      const need = target - nums[i];
      if (need in seen) return [seen[need], i];
      seen[nums[i]] = i;
    }
    return [];
  }
}`;
  const tsClassRun = resultsFor("typescript", tsClass, problem.functionName, all);
  check(
    "TypeScript Solution class is found and passes",
    tsClassRun.results !== null && tsClassRun.results.every((r) => r.pass),
    `${JSON.stringify(tsClassRun.results)} stderr=${tsClassRun.stderr.slice(0, 200)}`,
  );

  const jsGood = `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
    seen.set(nums[i], i);
  }
  return [];
}`;
  const jsRun = resultsFor("javascript", jsGood, problem.functionName, all);
  check(
    "JavaScript still passes all cases (no regression)",
    jsRun.results !== null && jsRun.results.every((r) => r.pass),
    `${JSON.stringify(jsRun.results)} stderr=${jsRun.stderr.slice(0, 200)}`,
  );

  const jsBad = jsGood.replace("return [seen.get(target - nums[i]), i]", "return [0, 0]");
  const jsBadRun = resultsFor("javascript", jsBad, problem.functionName, all);
  check(
    "JavaScript wrong solution reports failures",
    jsBadRun.results !== null && jsBadRun.results.some((r) => !r.pass),
    JSON.stringify(jsBadRun.results),
  );
}

console.log("\nClass / design-problem harness (CoderPad-style)");
{
  const doc = `class Document:
    def __init__(self):
        self.text = ""
    def apply(self, chunk):
        self.text += chunk
        return self.text`;

  const ctor = resultsFor("python", doc, "Document", [
    { args: [], expected: null },
    { args: [], expected: null },
    { args: [], expected: null },
  ]);
  check(
    "Python Document() vs expected null passes (constructor is not compared as the instance)",
    ctor.results !== null && ctor.results.length === 3 && ctor.results.every((r) => r.pass && r.actual === null),
    JSON.stringify(ctor.results),
  );

  const leftover = `class Solution:
    pass

${doc}`;
  const leftoverRun = resultsFor("python", leftover, "Document", [
    { args: [], expected: null },
  ]);
  check(
    "Python prefers a class named Document over an empty Solution leftover",
    leftoverRun.results !== null && leftoverRun.results.every((r) => r.pass),
    JSON.stringify(leftoverRun.results),
  );

  const seq = resultsFor("python", doc, "Document", [
    {
      args: [
        ["Document", "apply", "apply"],
        [[], ["a"], ["b"]],
      ],
      expected: [null, "a", "ab"],
    },
  ]);
  check(
    "Python LeetCode-style command sequence keeps one instance",
    seq.results !== null &&
      seq.results[0]?.pass === true &&
      JSON.stringify(seq.results[0]?.actual) === JSON.stringify([null, "a", "ab"]),
    JSON.stringify(seq.results),
  );

  const seqFail = resultsFor("python", doc, "Document", [
    {
      args: [
        ["Document", "apply"],
        [[], ["a"]],
      ],
      expected: [null, "zzz"],
    },
  ]);
  check(
    "Python sequence mismatch fails the apply step, not the constructor",
    seqFail.results !== null &&
      seqFail.results[0]?.pass === false &&
      seqFail.results[0]?.steps?.[0]?.pass === true &&
      seqFail.results[0]?.steps?.[1]?.pass === false,
    JSON.stringify(seqFail.results),
  );

  const methodOnDoc = resultsFor(
    "python",
    doc,
    "apply",
    [{ args: ["hi"], expected: "hi" }],
  );
  check(
    "Python finds apply on Document when functionName is the method",
    methodOnDoc.results !== null && methodOnDoc.results.every((r) => r.pass),
    JSON.stringify(methodOnDoc.results),
  );

  const jsDoc = `class Document {
  constructor() { this.text = ""; }
  apply(chunk) { this.text += chunk; return this.text; }
}`;
  const jsCtor = resultsFor("javascript", jsDoc, "Document", [
    { args: [], expected: null },
  ]);
  check(
    "JavaScript class constructor vs null passes",
    jsCtor.results !== null && jsCtor.results.every((r) => r.pass && r.actual === null),
    JSON.stringify(jsCtor.results),
  );

  const jsSeq = resultsFor("javascript", jsDoc, "Document", [
    {
      args: [
        ["Document", "apply", "apply"],
        [[], ["a"], ["b"]],
      ],
      expected: [null, "a", "ab"],
    },
  ]);
  check(
    "JavaScript command sequence keeps one instance",
    jsSeq.results !== null && jsSeq.results[0]?.pass === true,
    JSON.stringify(jsSeq.results),
  );

  const pmPy = `class PermissionManager:
    def __init__(self, teams, folders, files):
        self.users = set()
        for t in teams:
            uuid, folder_ids, file_ids, user_ids = t
            self.users.update(user_ids)
        self.folders = folders
        self.files = files
    def owns(self, user_id):
        return user_id in self.users`;
  const teams = [["t1", ["f1"], ["x"], ["A"]]];
  const folders = [["f1"]];
  const files = [["x"]];

  const pmSeq = resultsFor("python", pmPy, "PermissionManager", [
    {
      args: [
        ["PermissionManager", "owns"],
        [[[teams, folders, files], "A"], ["A"]],
      ],
      expected: [null, true],
    },
  ]);
  check(
    "Python unpacks PermissionManager([[teams, folders, files], user_id]) to three constructor lists",
    pmSeq.results !== null &&
      pmSeq.results[0]?.pass === true &&
      JSON.stringify(pmSeq.results[0]?.actual) === JSON.stringify([null, true]),
    JSON.stringify(pmSeq.results),
  );

  const pmCtor = resultsFor("python", pmPy, "PermissionManager", [
    { args: [[teams, folders, files], "A"], expected: null },
  ]);
  check(
    "Python non-sequence packed constructor plus leftover user_id still constructs",
    pmCtor.results !== null && pmCtor.results.every((r) => r.pass && r.actual === null),
    JSON.stringify(pmCtor.results),
  );

  const pmSpread = resultsFor("python", pmPy, "PermissionManager", [
    {
      args: [
        ["PermissionManager", "owns"],
        [[teams, folders, files], ["A"]],
      ],
      expected: [null, true],
    },
  ]);
  check(
    "Python PermissionManager(teams, folders, files) still works when already spread",
    pmSpread.results !== null && pmSpread.results[0]?.pass === true,
    JSON.stringify(pmSpread.results),
  );

  const pmJs = `class PermissionManager {
  constructor(teams, folders, files) {
    this.users = new Set();
    for (const t of teams) {
      const [uuid, folder_ids, file_ids, user_ids] = t;
      for (const u of user_ids) this.users.add(u);
    }
    this.folders = folders;
    this.files = files;
  }
  owns(user_id) { return this.users.has(user_id); }
}`;
  const pmJsSeq = resultsFor("javascript", pmJs, "PermissionManager", [
    {
      args: [
        ["PermissionManager", "owns"],
        [[[teams, folders, files], "A"], ["A"]],
      ],
      expected: [null, true],
    },
  ]);
  check(
    "JavaScript unpacks PermissionManager([[teams, folders, files], user_id]) to three constructor lists",
    pmJsSeq.results !== null && pmJsSeq.results[0]?.pass === true,
    JSON.stringify(pmJsSeq.results),
  );
}

console.log(
  failures === 0
    ? "\nAll runner checks passed."
    : `\n${failures} check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
