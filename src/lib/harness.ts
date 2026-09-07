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
import traceback as __traceback


def __idc_fmt_err(exc):
    """Full traceback, pointing at solution.py, with harness frames removed."""
    text = "".join(__traceback.format_exception(type(exc), exc, exc.__traceback__))
    kept = []
    skip_next = False
    for line in text.splitlines():
        if skip_next:
            skip_next = False
            if line.startswith("    ") and "File " not in line:
                continue
        if "__idc_" in line or line.rstrip().endswith("in <module>"):
            skip_next = "File " in line
            continue
        line = (
            line.replace('File "<string>"', 'File "solution.py"')
            .replace('File "<exec>"', 'File "solution.py"')
            .replace('File "<stdin>"', 'File "solution.py"')
        )
        kept.append(line)
    return "\\n".join(kept).strip() or "{0}: {1}".format(type(exc).__name__, exc)


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


def __idc_adapt_args(fn, args):
    """Match JSON test args to a callable's positional signature.

    Class tests sometimes wrap constructor inputs as one list (and leftover
    method args), e.g. PermissionManager([[teams, folders, files], user_id])
    when __init__(self, teams, folders, files) expects three lists.
    """
    if not isinstance(args, (list, tuple)):
        return args
    args = list(args)
    try:
        sig = __inspect.signature(fn)
    except (TypeError, ValueError):
        return args
    positional = []
    has_var = False
    for p in sig.parameters.values():
        if p.kind is __inspect.Parameter.VAR_POSITIONAL:
            has_var = True
        elif p.kind in (
            __inspect.Parameter.POSITIONAL_ONLY,
            __inspect.Parameter.POSITIONAL_OR_KEYWORD,
        ):
            # inspect.signature(cls) drops self; signature(__init__) does not.
            if p.name in ("self", "cls") and not positional:
                continue
            positional.append(p)
    if has_var:
        return args
    n = len(positional)
    required = sum(1 for p in positional if p.default is __inspect.Parameter.empty)
    if required <= len(args) <= n:
        return args
    first = args[0] if args else None
    packed = isinstance(first, (list, tuple)) and required <= len(first) <= n
    # Too few args: first list is the real positional payload.
    if packed and len(args) < required:
        return list(first)
    # Too many args: leftover method inputs (user_id, etc.). Keep the prefix.
    if len(args) > n:
        return args[:n]
    return args


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
                    call_args = __idc_adapt_args(cls, call_args)
                    instance = cls(*call_args)
                    actual = None
                    label = cls.__name__
                else:
                    method = getattr(instance, cmd)
                    call_args = __idc_adapt_args(method, call_args)
                    actual = method(*call_args)
                    label = cmd
            except Exception as err:
                actual = None
                step_error = __idc_fmt_err(err)
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

    args = __idc_adapt_args(cls, args)
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
            __args = __idc_adapt_args(__obj, __args)
            __actual = __obj(*__args)
            __ok = __idc_eq(__actual, __expected)
            __call = __idc_call(${name}, __args)
        else:
            __meth = getattr(__obj(), ${name})
            __args = __idc_adapt_args(__meth, __args)
            __actual = __meth(*__args)
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
            "error": __idc_fmt_err(__e),
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
const __idcUserLines = ${userCode.split("\n").length};

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

function __idcFmtErr(err) {
  const raw = err && err.stack ? String(err.stack) : String(err);
  return raw
    .split("\\n")
    .filter((line) => {
      if (line.includes("__idc")) return false;
      if (line.includes("node:internal")) return false;
      const m = line.match(/Function:(\\d+)/) || line.match(/<anonymous>:(\\d+)/);
      if (m) {
        const n = Number(m[1]) - 1;
        if (n > __idcUserLines) return false;
        return true;
      }
      if (line.includes("[eval]") || line.includes("runScript")) return false;
      return true;
    })
    .map((line) =>
      line.replace(/\\(Function:(\\d+):(\\d+)\\)/g, (_, l, c) => {
        const n = Math.max(1, Number(l) - 1);
        return "(solution.js:" + n + ":" + c + ")";
      }),
    )
    .join("\\n") || String(err);
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

function __idcArity(fn) {
  if (typeof fn !== "function") return null;
  const src = Function.prototype.toString.call(fn);
  const ctor = src.match(/constructor\\s*\\(([^)]*)\\)/);
  const fnMatch =
    ctor ||
    src.match(/^(?:async\\s+)?(?:function[\\s*]*)?[^(]*\\(([^)]*)\\)/) ||
    src.match(/^[^(]*\\(([^)]*)\\)\\s*=>/);
  if (!fnMatch) return null;
  const raw = fnMatch[1].trim();
  if (!raw) return { n: 0, required: 0 };
  if (raw.includes("{") || raw.includes("[") || raw.includes("...")) return null;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { n: 0, required: 0 };
  return {
    n: parts.length,
    required: parts.filter((p) => !p.includes("=")).length,
  };
}

function __idcAdaptArgs(fn, args) {
  if (!Array.isArray(args)) return args;
  const arity = __idcArity(fn);
  if (!arity) return args;
  const { n, required } = arity;
  if (required <= args.length && args.length <= n) return args;
  const first = args[0];
  const packed = Array.isArray(first) && required <= first.length && first.length <= n;
  if (packed && args.length < required) return first;
  if (args.length > n) return args.slice(0, n);
  return args;
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
      let callArgs = argv[i];
      let actual = null;
      let error = null;
      const label = i === 0 ? cls.name : cmds[i];
      try {
        if (i === 0) {
          callArgs = __idcAdaptArgs(cls, callArgs);
          instance = new cls(...callArgs);
          actual = null;
        } else {
          const method = instance[cmds[i]];
          callArgs = typeof method === "function" ? __idcAdaptArgs(method, callArgs) : callArgs;
          actual = instance[cmds[i]](...callArgs);
        }
      } catch (err) {
        error = __idcFmtErr(err);
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
  args = __idcAdaptArgs(cls, args);
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
      const callArgs = __idcAdaptArgs(found.obj, __args);
      __actual = found.obj(...callArgs);
      __ok = __idcEq(__actual, __expected);
      __call = __idcCall(__idcName, callArgs);
    } else {
      const inst = new found.obj();
      const meth = inst[__idcName];
      const callArgs = typeof meth === "function" ? __idcAdaptArgs(meth, __args) : __args;
      __actual = inst[__idcName](...callArgs);
      __ok = __idcEq(__actual, __expected);
      __call = __idcCall(found.obj.name + "()." + __idcName, callArgs);
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
      error: __idcFmtErr(__e),
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
