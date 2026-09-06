import type { LanguageId, TestCase } from "./types";

const MARKER = "__IDECODER_RESULTS__";

export { MARKER };

function testsLiteral(tests: TestCase[]) {
  return JSON.stringify(tests);
}

export function buildHarness(
  language: LanguageId,
  userCode: string,
  functionName: string,
  tests: TestCase[] | null,
): string {
  if (!tests) return userCode;

  if (language === "python") {
    return `${userCode}

import json as __json


def __idc_eq(a, b):
    """Compare a Python return value against a value parsed from JSON.

    Tuples and lists both correspond to a JSON array, and ints and floats are
    one type in JSON, so those are treated as equal when the contents match.
    Bools stay distinct from numbers even though Python says True == 1.
    """
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if a is None or b is None:
        return a is None and b is None
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        if a == b:
            return True
        return abs(a - b) <= 1e-9 * max(1.0, abs(a), abs(b))
    if isinstance(a, str) or isinstance(b, str):
        return a == b
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(__idc_eq(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return set(a.keys()) == set(b.keys()) and all(__idc_eq(a[k], b[k]) for k in a)
    if isinstance(a, (set, frozenset)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(any(__idc_eq(x, y) for x in a) for y in b)
    return a == b


def __idc_jsonable(value):
    """json.dumps chokes on tuples-as-keys, sets and custom objects."""
    if isinstance(value, (set, frozenset)):
        return [__idc_jsonable(v) for v in value]
    if isinstance(value, tuple):
        return [__idc_jsonable(v) for v in value]
    if isinstance(value, list):
        return [__idc_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): __idc_jsonable(v) for k, v in value.items()}
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    return str(value)


__tests = __json.loads(${JSON.stringify(testsLiteral(tests))})
__results = []
for __i, __t in enumerate(__tests):
    try:
        if "Solution" in globals():
            __target = getattr(Solution(), ${JSON.stringify(functionName)})
        elif ${JSON.stringify(functionName)} in globals():
            __target = globals()[${JSON.stringify(functionName)}]
        else:
            raise NameError(
                "Could not find ${functionName}. Define a function called ${functionName} or a Solution class with a ${functionName} method."
            )
        __actual = __target(*__t["args"])
        __results.append({
            "index": __i,
            "pass": __idc_eq(__actual, __t["expected"]),
            "actual": __idc_jsonable(__actual),
            "expected": __t["expected"],
            "error": None,
        })
    except Exception as __e:
        __results.append({
            "index": __i,
            "pass": False,
            "actual": None,
            "expected": __t["expected"],
            "error": "{0}: {1}".format(type(__e).__name__, __e),
        })
print(${JSON.stringify(MARKER)} + __json.dumps(__results))
`;
  }

  if (language === "javascript" || language === "typescript") {
    return `${userCode}

const __tests = ${testsLiteral(tests)};
const __results = [];
function __invoke(args) {
  if (typeof ${functionName} === "function") return ${functionName}(...args);
  if (typeof Solution !== "undefined") return new Solution()[${JSON.stringify(functionName)}](...args);
  throw new Error("Could not find ${functionName}. Export a function or a Solution class.");
}
for (let __i = 0; __i < __tests.length; __i++) {
  const __t = __tests[__i];
  try {
    const __actual = __invoke(__t.args);
    const __pass = JSON.stringify(__actual) === JSON.stringify(__t.expected);
    __results.push({ index: __i, pass: __pass, actual: __actual, expected: __t.expected, error: null });
  } catch (__e) {
    __results.push({ index: __i, pass: false, actual: null, expected: __t.expected, error: String(__e) });
  }
}
console.log(${JSON.stringify(MARKER)} + JSON.stringify(__results));
`;
  }

  return userCode;
}

export function parseResults(stdout: string) {
  const idx = stdout.lastIndexOf(MARKER);
  if (idx === -1) return { cleaned: stdout.trim(), results: null as null };
  const before = stdout.slice(0, idx).trim();
  const jsonPart = stdout.slice(idx + MARKER.length).trim().split("\n")[0];
  try {
    return { cleaned: before, results: JSON.parse(jsonPart) };
  } catch {
    return { cleaned: stdout.trim(), results: null };
  }
}
