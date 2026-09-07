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

  const name = JSON.stringify(functionName);

  if (language === "python") {
    return `${userCode}

import inspect as __inspect
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


def __idc_call(name, args):
    try:
        inner = ", ".join(__json.dumps(__idc_jsonable(a)) for a in args)
    except Exception:
        inner = "..."
    return "{0}({1})".format(name, inner)


def __idc_user_classes():
    found = []
    for key, value in list(globals().items()):
        if key.startswith("_") or key in ("json", "inspect"):
            continue
        if __inspect.isclass(value) and getattr(value, "__module__", "") == "__main__":
            found.append(value)
    return found


def __idc_has_method(cls, name):
    raw = vars(cls).get(name)
    return callable(raw)


def __idc_resolve():
    name = ${name}
    obj = globals().get(name)
    if __inspect.isclass(obj):
        return ("class", obj)
    if __inspect.isfunction(obj):
        return ("fn", obj)
    solution = globals().get("Solution")
    if __inspect.isclass(solution) and __idc_has_method(solution, name):
        return ("method", solution)
    for cls in __idc_user_classes():
        if __idc_has_method(cls, name):
            return ("method", cls)
    raise NameError(
        "Could not find {0}. Define a function called {0}, a class called {0}, or a class with an {0} method.".format(name)
    )


def __idc_is_sequence(args, expected, cls):
    """LeetCode/CoderPad design tests: [commands, argLists] -> [results]."""
    if not (isinstance(args, list) and len(args) == 2):
        return False
    cmds, argv = args
    if not (isinstance(cmds, list) and cmds and all(isinstance(c, str) for c in cmds)):
        return False
    if not (isinstance(argv, list) and len(argv) == len(cmds)):
        return False
    if not all(isinstance(a, list) for a in argv):
        return False
    if not (isinstance(expected, list) and len(expected) == len(cmds)):
        return False
    first = cmds[0]
    return first == cls.__name__ or globals().get(first) is cls


def __idc_run_class(cls, args, expected):
    if __idc_is_sequence(args, expected, cls):
        cmds, argv = args
        instance = None
        steps = []
        for i, cmd in enumerate(cmds):
            call_args = argv[i]
            step_error = None
            try:
                if i == 0:
                    instance = cls(*call_args)
                    actual = None
                    label = cls.__name__
                else:
                    actual = getattr(instance, cmd)(*call_args)
                    label = cmd
            except Exception as err:
                actual = None
                step_error = "{0}: {1}".format(type(err).__name__, err)
                label = cls.__name__ if i == 0 else cmd
            want = expected[i]
            ok = step_error is None and __idc_eq(actual, want)
            steps.append({
                "call": __idc_call(label, call_args),
                "expected": want,
                "actual": __idc_jsonable(actual),
                "pass": ok,
                "error": step_error,
            })
            if step_error:
                break
        passed = all(step["pass"] for step in steps) and len(steps) == len(cmds)
        note = None
        if not passed:
            note = (
                "Class tests run like CoderPad/LeetCode: "
                + cls.__name__
                + "() is the constructor (expected null), then methods are called on that same instance."
            )
        return {
            "actual": [step["actual"] for step in steps],
            "pass": passed,
            "call": " / ".join(step["call"] for step in steps),
            "steps": steps,
            "note": note,
            "error": next((step["error"] for step in steps if step["error"]), None),
        }

    instance = cls(*args)
    # A constructor's value is the object. Design-problem tests expect null
    # for that step, the way CoderPad and LeetCode do.
    if expected is None:
        return {
            "actual": None,
            "pass": True,
            "call": __idc_call(cls.__name__, args),
            "steps": [{
                "call": __idc_call(cls.__name__, args),
                "expected": None,
                "actual": None,
                "pass": True,
                "error": None,
            }],
            "note": cls.__name__ + "() constructed an instance; constructor steps expect null.",
            "error": None,
        }
    return {
        "actual": instance,
        "pass": __idc_eq(instance, expected),
        "call": __idc_call(cls.__name__, args),
        "steps": None,
        "note": None,
        "error": None,
    }


__tests = __json.loads(${JSON.stringify(testsLiteral(tests))})
__results = []
for __i, __t in enumerate(__tests):
    __args = __t.get("args") or []
    __expected = __t.get("expected")
    try:
        __kind, __obj = __idc_resolve()
        __call = __idc_call(${name}, __args)
        __steps = None
        __note = None
        __err = None
        if __kind == "class":
            __ran = __idc_run_class(__obj, __args, __expected)
            __actual = __ran["actual"]
            __ok = __ran["pass"]
            __call = __ran["call"]
            __steps = __ran["steps"]
            __note = __ran["note"]
            __err = __ran["error"]
        elif __kind == "fn":
            __actual = __obj(*__args)
            __ok = __idc_eq(__actual, __expected)
        else:
            __actual = getattr(__obj(), ${name})(*__args)
            __ok = __idc_eq(__actual, __expected)
            __call = __idc_call(__obj.__name__ + "()." + ${name}, __args)
        __results.append({
            "index": __i,
            "pass": __ok,
            "actual": __idc_jsonable(__actual),
            "expected": __expected,
            "error": __err,
            "call": __call,
            "steps": __steps,
            "note": None if __ok else __note,
        })
    except Exception as __e:
        __results.append({
            "index": __i,
            "pass": False,
            "actual": None,
            "expected": __expected,
            "error": "{0}: {1}".format(type(__e).__name__, __e),
            "call": __idc_call(${name}, __args),
            "steps": None,
            "note": None,
        })
print(${JSON.stringify(MARKER)} + __json.dumps(__results))
`;
  }

  if (language === "javascript" || language === "typescript") {
    return `${userCode}

const __tests = ${testsLiteral(tests)};
const __results = [];
const __idcName = ${name};

function __idcEq(a, b) {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return a === b;
  if (typeof a === "boolean" || typeof b === "boolean") return a === b;
  if (typeof a === "number" && typeof b === "number") {
    if (a === b) return true;
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (typeof a === "string" || typeof b === "string") return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => __idcEq(x, b[i]));
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;
  if (typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && __idcEq(a[k], b[k]));
  }
  return false;
}

function __idcCall(name, args) {
  try {
    return name + "(" + args.map((a) => JSON.stringify(a)).join(", ") + ")";
  } catch {
    return name + "(...)";
  }
}

function __idcIsClass(fn) {
  if (typeof fn !== "function") return false;
  const src = Function.prototype.toString.call(fn);
  if (/^\\s*class\\s/.test(src)) return true;
  const proto = fn.prototype;
  if (!proto || proto === Object.prototype) return false;
  return Object.getOwnPropertyNames(proto).some((k) => k !== "constructor");
}

function __idcIsSequence(args, expected, cls) {
  if (!Array.isArray(args) || args.length !== 2) return false;
  const cmds = args[0];
  const argv = args[1];
  if (!Array.isArray(cmds) || cmds.length === 0 || !cmds.every((c) => typeof c === "string")) return false;
  if (!Array.isArray(argv) || argv.length !== cmds.length) return false;
  if (!argv.every((a) => Array.isArray(a))) return false;
  if (!Array.isArray(expected) || expected.length !== cmds.length) return false;
  return cmds[0] === cls.name || cmds[0] === __idcName;
}

function __idcRunClass(cls, args, expected) {
  if (__idcIsSequence(args, expected, cls)) {
    const cmds = args[0];
    const argv = args[1];
    let instance = null;
    const steps = [];
    for (let i = 0; i < cmds.length; i++) {
      const callArgs = argv[i];
      let actual = null;
      let error = null;
      const label = i === 0 ? cls.name : cmds[i];
      try {
        if (i === 0) {
          instance = new cls(...callArgs);
          actual = null;
        } else {
          actual = instance[cmds[i]](...callArgs);
        }
      } catch (err) {
        error = String(err);
      }
      const want = expected[i];
      const ok = !error && __idcEq(actual, want);
      steps.push({
        call: __idcCall(label, callArgs),
        expected: want,
        actual: i === 0 && !error ? null : actual,
        pass: ok,
        error,
      });
      if (error) break;
    }
    const passed = steps.every((s) => s.pass) && steps.length === cmds.length;
    return {
      actual: steps.map((s) => s.actual),
      pass: passed,
      call: steps.map((s) => s.call).join(" / "),
      steps,
      note: passed
        ? null
        : "Class tests run like CoderPad/LeetCode: " + cls.name + "() is the constructor (expected null), then methods are called on that same instance.",
      error: steps.find((s) => s.error)?.error ?? null,
    };
  }
  const instance = new cls(...args);
  if (expected == null) {
    return {
      actual: null,
      pass: true,
      call: __idcCall(cls.name, args),
      steps: [{ call: __idcCall(cls.name, args), expected: null, actual: null, pass: true, error: null }],
      note: cls.name + "() constructed an instance; constructor steps expect null.",
      error: null,
    };
  }
  return {
    actual: instance,
    pass: __idcEq(instance, expected),
    call: __idcCall(cls.name, args),
    steps: null,
    note: null,
    error: null,
  };
}

function __idcResolve() {
  const named = typeof ${functionName} === "function" ? ${functionName} : undefined;
  if (named) {
    return __idcIsClass(named) ? { kind: "class", obj: named } : { kind: "fn", obj: named };
  }
  const sol = typeof Solution === "function" ? Solution : undefined;
  if (sol && typeof sol.prototype?.[__idcName] === "function") {
    return { kind: "method", obj: sol };
  }
  throw new Error("Could not find " + __idcName + ". Export a function or class called " + __idcName + ", or a Solution class with that method.");
}

for (let __i = 0; __i < __tests.length; __i++) {
  const __t = __tests[__i];
  const __args = Array.isArray(__t.args) ? __t.args : [];
  const __expected = __t.expected;
  try {
    const found = __idcResolve();
    let __actual;
    let __ok;
    let __call = __idcCall(__idcName, __args);
    let __steps = null;
    let __note = null;
    let __err = null;
    if (found.kind === "class") {
      const ran = __idcRunClass(found.obj, __args, __expected);
      __actual = ran.actual;
      __ok = ran.pass;
      __call = ran.call;
      __steps = ran.steps;
      __note = ran.note;
      __err = ran.error;
    } else if (found.kind === "fn") {
      __actual = found.obj(...__args);
      __ok = __idcEq(__actual, __expected);
    } else {
      __actual = new found.obj()[__idcName](...__args);
      __ok = __idcEq(__actual, __expected);
      __call = __idcCall(found.obj.name + "()." + __idcName, __args);
    }
    __results.push({
      index: __i,
      pass: __ok,
      actual: __actual,
      expected: __expected,
      error: __err,
      call: __call,
      steps: __steps,
      note: __ok ? null : __note,
    });
  } catch (__e) {
    __results.push({
      index: __i,
      pass: false,
      actual: null,
      expected: __expected,
      error: String(__e),
      call: __idcCall(__idcName, __args),
      steps: null,
      note: null,
    });
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
