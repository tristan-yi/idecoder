import type { LanguageId, TestCase } from "./types";

const MARKER = "__IDECODER_RESULTS__";

export { MARKER };

function normalizeTestCase(test: TestCase): { args: unknown[]; expected: unknown } {
  const expected = test.expected;
  if (Array.isArray(test.commands) && Array.isArray(test.arguments)) {
    return { args: [test.commands, test.arguments], expected };
  }
  const args = test.args;
  if (args && typeof args === "object" && !Array.isArray(args)) {
    const rec = args as Record<string, unknown>;
    const commands = rec.commands;
    const argv = rec.arguments ?? rec.argv;
    if (Array.isArray(commands) && Array.isArray(argv)) {
      return { args: [commands, argv], expected };
    }
  }
  return { args: Array.isArray(args) ? args : [], expected };
}

function testsLiteral(tests: TestCase[]) {
  return JSON.stringify(tests.map(normalizeTestCase));
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
    const userLines = userCode.split("\n").length;
    return `${userCode}

import inspect as __inspect
import json as __json
import traceback as __traceback

__idc_user_lines = ${userLines}


def __idc_file_line(line):
    marker = "line "
    if "File " not in line or marker not in line:
        return None
    rest = line.split(marker, 1)[1]
    digits = []
    for ch in rest:
        if ch.isdigit():
            digits.append(ch)
        else:
            break
    return int("".join(digits)) if digits else None


def __idc_fmt_err(exc):
    """Full traceback, pointing at solution.py, with harness frames removed."""
    text = "".join(__traceback.format_exception(type(exc), exc, exc.__traceback__))
    kept = []
    skip_next = False
    user_line = None
    snippet = None
    for line in text.splitlines():
        if skip_next:
            skip_next = False
            if line.startswith("    ") and "File " not in line:
                continue
        renamed = (
            line.replace('File "<string>"', 'File "solution.py"')
            .replace('File "<exec>"', 'File "solution.py"')
            .replace('File "<stdin>"', 'File "solution.py"')
        )
        lineno = __idc_file_line(renamed)
        harness_frame = "__idc_" in renamed or (
            renamed.rstrip().endswith("in <module>")
            and (lineno is None or lineno > __idc_user_lines)
        )
        if harness_frame:
            skip_next = "File " in renamed
            continue
        if lineno is not None and lineno <= __idc_user_lines:
            user_line = lineno
            snippet = None
        elif (
            user_line is not None
            and snippet is None
            and renamed.startswith("    ")
            and "File " not in renamed
        ):
            snippet = renamed.strip()
        kept.append(renamed)
    body = "\\n".join(kept).strip() or "{0}: {1}".format(type(exc).__name__, exc)
    head = "{0}: {1}".format(type(exc).__name__, exc)
    if user_line is not None:
        head = "Line {0} · {1}".format(user_line, head)
        if snippet:
            head = head + "\\n    " + snippet
    if body.startswith(head):
        return body
    return head + "\\n" + body


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
    # Never report a constructed instance as the test output.
    if getattr(type(value), "__module__", "") in ("__main__", ""):
        return None
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


def __idc_sig(fn):
    """Return (n, required, has_var) for positional params, skipping self/cls."""
    try:
        sig = __inspect.signature(fn)
    except (TypeError, ValueError):
        return None
    positional = []
    has_var = False
    for p in sig.parameters.values():
        if p.kind is __inspect.Parameter.VAR_POSITIONAL:
            has_var = True
        elif p.kind in (
            __inspect.Parameter.POSITIONAL_ONLY,
            __inspect.Parameter.POSITIONAL_OR_KEYWORD,
        ):
            if p.name in ("self", "cls") and not positional:
                continue
            positional.append(p)
    n = len(positional)
    required = sum(1 for p in positional if p.default is __inspect.Parameter.empty)
    return (n, required, has_var)


def __idc_adapt_args(fn, args):
    """Match JSON test args to a callable's positional signature.

    Class tests sometimes wrap constructor inputs as one list (and leftover
    method args), e.g. PermissionManager([[teams, folders, files], user_id])
    when __init__(self, teams, folders, files) expects three lists.
    """
    if not isinstance(args, (list, tuple)):
        return args
    args = list(args)
    info = __idc_sig(fn)
    if not info:
        return args
    n, required, has_var = info
    if has_var:
        return args
    if required <= len(args) <= n:
        return args
    first = args[0] if args else None
    packed = isinstance(first, (list, tuple)) and required <= len(first) <= n
    if packed and len(args) < required:
        return list(first)
    if len(args) > n:
        return args[:n]
    return args


def __idc_split_args(fn, args):
    """Split a flat test input into constructor args and leftover query args."""
    if not isinstance(args, (list, tuple)):
        return args, []
    args = list(args)
    info = __idc_sig(fn)
    if not info:
        return args, []
    n, required, has_var = info
    if has_var:
        return args, []
    first = args[0] if args else None
    packed = isinstance(first, (list, tuple)) and required <= len(first) <= n
    if len(args) > n:
        return args[:n], args[n:]
    if packed and len(args) < required:
        return list(first), args[1:]
    if required <= len(args) <= n:
        return args, []
    if packed:
        return list(first), args[1:]
    return args, []


def __idc_public_methods(cls):
    names = []
    for name, raw in vars(cls).items():
        if name.startswith("_"):
            continue
        if callable(raw):
            names.append(name)
    return names


def __idc_fits(fn, rest):
    info = __idc_sig(fn)
    if not info:
        return True
    n, required, has_var = info
    if has_var:
        return True
    return required <= len(rest) <= n


def __idc_pick_query(cls, rest, hint):
    methods = __idc_public_methods(cls)
    if not methods:
        return None
    if hint and hint != cls.__name__ and hint in methods:
        return hint
    if len(methods) == 1:
        return methods[0]
    fits = [m for m in methods if __idc_fits(getattr(cls, m), rest)]
    pool = fits or methods
    keys = ("get", "query", "find", "search", "fewest", "has", "check", "access")
    prefer = [m for m in pool if any(k in m.lower() for k in keys)]
    if len(fits) == 1:
        return fits[0]
    if len(prefer) == 1:
        return prefer[0]
    if rest and prefer:
        return prefer[0]
    if rest and fits:
        return fits[0]
    return None


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


def __idc_is_ops(args, cls):
    """True when args is [commands, argumentLists] for a class-design test."""
    if not (isinstance(args, list) and len(args) == 2):
        return False
    cmds, argv = args
    if not (isinstance(cmds, list) and cmds and all(isinstance(c, str) for c in cmds)):
        return False
    if not (isinstance(argv, list) and len(argv) == len(cmds)):
        return False
    if not all(isinstance(a, list) for a in argv):
        return False
    first = cmds[0]
    return first == cls.__name__ or globals().get(first) is cls


def __idc_as_ops(args, cls):
    """Unwrap one extra list layer that generators sometimes add around [cmds, argv]."""
    if __idc_is_ops(args, cls):
        return list(args[0]), list(args[1])
    if isinstance(args, list) and len(args) == 1 and isinstance(args[0], list):
        return __idc_as_ops(args[0], cls)
    return None


def __idc_ops(cls, args, expected, query_hint=None):
    """Always return (commands, argumentLists). Classes are never called as functions."""
    found = __idc_as_ops(args, cls)
    if found:
        return found
    ctor_args, rest = __idc_split_args(cls, args)
    if expected is None and not query_hint:
        return [cls.__name__], [ctor_args]
    query = __idc_pick_query(cls, rest, query_hint)
    if query:
        return [cls.__name__, query], [ctor_args, rest]
    return None


def __idc_run_sequence(cls, cmds, argv, expected):
    """LeetCode/CoderPad: construct once (result is null), then call methods on that instance.

    obj = TargetClass(*init_args)
    output = []
    for method, args in operations:
        if method == TargetClass.__name__:
            output.append(None)
        else:
            output.append(getattr(obj, method)(*args))
    """
    instance = None
    steps = []
    outputs = []
    for i, cmd in enumerate(cmds):
        call_args = argv[i] if i < len(argv) else []
        step_error = None
        is_ctor = cmd == cls.__name__ or (i == 0 and instance is None)
        try:
            if is_ctor:
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
            label = cls.__name__ if is_ctor else cmd
        outputs.append(actual)
        steps.append({
            "call": __idc_call(label, call_args),
            "expected": None,
            "actual": __idc_jsonable(actual),
            "pass": step_error is None,
            "error": step_error,
        })
        if step_error:
            break

    mode = "last"
    if isinstance(expected, list) and len(expected) == len(cmds) and (not expected or expected[0] is None):
        mode = "steps"
    elif isinstance(expected, list) and len(expected) == max(0, len(cmds) - 1) and cmds and cmds[0] == cls.__name__:
        mode = "tail"

    passed = True
    if mode == "steps":
        overall = [__idc_jsonable(v) for v in outputs]
        for i, step in enumerate(steps):
            want = expected[i] if i < len(expected) else None
            step["expected"] = want
            step["pass"] = step["error"] is None and __idc_eq(outputs[i], want)
            if not step["pass"]:
                passed = False
    elif mode == "tail":
        overall = [__idc_jsonable(v) for v in outputs]
        steps[0]["expected"] = None
        steps[0]["pass"] = steps[0]["error"] is None
        for i, step in enumerate(steps[1:], 1):
            want = expected[i - 1] if i - 1 < len(expected) else None
            step["expected"] = want
            step["pass"] = step["error"] is None and __idc_eq(outputs[i], want)
            if not step["pass"]:
                passed = False
        passed = passed and steps[0]["pass"]
    else:
        want = expected
        got = outputs[-1] if outputs else None
        overall = __idc_jsonable(got)
        last = steps[-1] if steps else None
        if last is not None:
            last["expected"] = want
            last["pass"] = last["error"] is None and __idc_eq(got, want)
            passed = last["pass"] and all(s["error"] is None for s in steps)
        else:
            passed = False

    if len(steps) < len(cmds):
        passed = False
    note = None
    if not passed:
        note = (
            "Class tests never call result = "
            + cls.__name__
            + "(*args). The harness constructs the object (expected null), then calls methods on that instance."
        )
    return {
        "actual": overall,
        "pass": passed,
        "call": " / ".join(step["call"] for step in steps),
        "steps": steps,
        "note": note,
        "error": next((step["error"] for step in steps if step["error"]), None),
    }


def __idc_run_class(cls, args, expected, query_hint=None):
    ops = __idc_ops(cls, args, expected, query_hint)
    if not ops:
        return {
            "actual": None,
            "pass": False,
            "call": __idc_call(cls.__name__, args if isinstance(args, list) else []),
            "steps": None,
            "note": (
                "Class tests need method calls, not the constructed object. "
                "Use [[ClassName, method, ...], [ctorArgs, methodArgs, ...]] "
                "with expected [null, result, ...]."
            ),
            "error": None,
        }
    cmds, argv = ops
    ran = __idc_run_sequence(cls, cmds, argv, expected)
    info = __idc_sig(cls)
    ctor_empty = info is not None and info[1] == 0
    if query_hint and ctor_empty and ran["steps"] and len(ran["steps"]) == 2 and not ran["error"]:
        qargs = argv[1] if len(argv) > 1 else []
        ran["steps"] = None
        ran["call"] = __idc_call(cls.__name__ + "()." + query_hint, qargs)
    return ran


__tests = __json.loads(${JSON.stringify(testsLiteral(tests))})
__results = []
for __i, __t in enumerate(__tests):
    __args = __t.get("args") or []
    if isinstance(__t.get("commands"), list) and isinstance(__t.get("arguments"), list):
        __args = [__t.get("commands"), __t.get("arguments")]
    __expected = __t.get("expected")
    try:
        __kind, __obj = __idc_resolve()
        __call = __idc_call(${name}, __args)
        __steps = None
        __note = None
        __err = None
        # Functions: result = fn(*args). Classes: construct, then call methods.
        # Never result = ClassName(*args) — that yields "<Class object at 0x...>".
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
            __ran = __idc_run_class(__obj, __args, __expected, ${name})
            __actual = __ran["actual"]
            __ok = __ran["pass"]
            __call = __ran["call"]
            __steps = __ran["steps"]
            __note = __ran["note"]
            __err = __ran["error"]
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
  const mapped = raw
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
    );
  const body = mapped.join("\\n") || String(err);
  let loc = null;
  for (const line of mapped) {
    const m = line.match(/solution\\.js:(\\d+)/);
    if (m) loc = m[1];
  }
  const name = err && err.name ? String(err.name) : "Error";
  const msg = err && err.message ? String(err.message) : String(err);
  const head = loc ? "Line " + loc + " · " + name + ": " + msg : name + ": " + msg;
  if (body.indexOf(head) === 0) return body;
  return head + "\\n" + body;
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

function __idcParseParams(raw) {
  raw = String(raw || "").trim();
  if (!raw) return { n: 0, required: 0 };
  if (raw.includes("{") || raw.includes("[") || raw.includes("...")) return null;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { n: 0, required: 0 };
  return { n: parts.length, required: parts.filter((p) => !p.includes("=")).length };
}

function __idcArity(fn) {
  if (typeof fn !== "function") return null;
  const src = Function.prototype.toString.call(fn);
  if (__idcIsClass(fn)) {
    const ctor = src.match(/constructor\\s*\\(([^)]*)\\)/);
    if (!ctor) return { n: 0, required: 0 };
    return __idcParseParams(ctor[1]);
  }
  const fnMatch =
    src.match(/^(?:async\\s+)?(?:function[\\s*]*)?[^(]*\\(([^)]*)\\)/) ||
    src.match(/^[^(]*\\(([^)]*)\\)\\s*=>/);
  if (!fnMatch) return null;
  return __idcParseParams(fnMatch[1]);
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

function __idcSplitArgs(fn, args) {
  if (!Array.isArray(args)) return { ctor: args, rest: [] };
  const arity = __idcArity(fn);
  if (!arity) return { ctor: args, rest: [] };
  const { n, required } = arity;
  const first = args[0];
  const packed = Array.isArray(first) && required <= first.length && first.length <= n;
  if (args.length > n) return { ctor: args.slice(0, n), rest: args.slice(n) };
  if (packed && args.length < required) return { ctor: first, rest: args.slice(1) };
  if (required <= args.length && args.length <= n) return { ctor: args, rest: [] };
  if (packed) return { ctor: first, rest: args.slice(1) };
  return { ctor: args, rest: [] };
}

function __idcPublicMethods(cls) {
  const proto = cls && cls.prototype;
  if (!proto) return [];
  return Object.getOwnPropertyNames(proto).filter((k) => {
    if (k === "constructor" || k.startsWith("_")) return false;
    return typeof proto[k] === "function";
  });
}

function __idcFits(fn, rest) {
  const arity = __idcArity(fn);
  if (!arity) return true;
  return arity.required <= rest.length && rest.length <= arity.n;
}

function __idcPickQuery(cls, rest, hint) {
  const methods = __idcPublicMethods(cls);
  if (!methods.length) return null;
  if (hint && hint !== cls.name && methods.includes(hint)) return hint;
  if (methods.length === 1) return methods[0];
  const proto = cls.prototype;
  const fits = methods.filter((m) => __idcFits(proto[m], rest));
  const pool = fits.length ? fits : methods;
  const keys = ["get", "query", "find", "search", "fewest", "has", "check", "access"];
  const prefer = pool.filter((m) => keys.some((k) => m.toLowerCase().includes(k)));
  if (fits.length === 1) return fits[0];
  if (prefer.length === 1) return prefer[0];
  if (rest.length && prefer.length) return prefer[0];
  if (rest.length && fits.length) return fits[0];
  return null;
}

function __idcIsOps(args, cls) {
  if (!Array.isArray(args) || args.length !== 2) return false;
  const cmds = args[0];
  const argv = args[1];
  if (!Array.isArray(cmds) || cmds.length === 0 || !cmds.every((c) => typeof c === "string")) return false;
  if (!Array.isArray(argv) || argv.length !== cmds.length) return false;
  if (!argv.every((a) => Array.isArray(a))) return false;
  return cmds[0] === cls.name || cmds[0] === __idcName;
}

function __idcAsOps(args, cls) {
  if (__idcIsOps(args, cls)) return [args[0], args[1]];
  if (Array.isArray(args) && args.length === 1 && Array.isArray(args[0])) return __idcAsOps(args[0], cls);
  return null;
}

function __idcOps(cls, args, expected, queryHint) {
  const found = __idcAsOps(args, cls);
  if (found) return found;
  const split = __idcSplitArgs(cls, Array.isArray(args) ? args : []);
  if (expected == null && !queryHint) return [[cls.name], [split.ctor]];
  const query = __idcPickQuery(cls, split.rest, queryHint);
  if (query) return [[cls.name, query], [split.ctor, split.rest]];
  return null;
}

function __idcRunSequence(cls, cmds, argv, expected) {
  let instance = null;
  const steps = [];
  const outputs = [];
  for (let i = 0; i < cmds.length; i++) {
    let callArgs = argv[i];
    let actual = null;
    let error = null;
    const isCtor = cmds[i] === cls.name || (i === 0 && instance == null);
    const label = isCtor ? cls.name : cmds[i];
    try {
      if (isCtor) {
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
    outputs.push(actual);
    steps.push({
      call: __idcCall(label, callArgs),
      expected: null,
      actual: isCtor && !error ? null : actual,
      pass: !error,
      error,
    });
    if (error) break;
  }
  let mode = "last";
  if (Array.isArray(expected) && expected.length === cmds.length && (expected.length === 0 || expected[0] == null)) {
    mode = "steps";
  } else if (Array.isArray(expected) && expected.length === Math.max(0, cmds.length - 1) && cmds[0] === cls.name) {
    mode = "tail";
  }
  let passed = true;
  let overall;
  if (mode === "steps") {
    overall = outputs.map((v, i) => (i === 0 && v == null ? null : v));
    steps.forEach((step, i) => {
      step.expected = expected[i];
      step.pass = !step.error && __idcEq(outputs[i], expected[i]);
      if (!step.pass) passed = false;
    });
  } else if (mode === "tail") {
    overall = outputs;
    steps[0].expected = null;
    steps[0].pass = !steps[0].error;
    for (let i = 1; i < steps.length; i++) {
      steps[i].expected = expected[i - 1];
      steps[i].pass = !steps[i].error && __idcEq(outputs[i], expected[i - 1]);
      if (!steps[i].pass) passed = false;
    }
    passed = passed && steps[0].pass;
  } else {
    const got = outputs.length ? outputs[outputs.length - 1] : null;
    overall = got;
    const last = steps[steps.length - 1];
    if (last) {
      last.expected = expected;
      last.pass = !last.error && __idcEq(got, expected);
      passed = last.pass && steps.every((s) => !s.error);
    } else {
      passed = false;
    }
  }
  if (steps.length < cmds.length) passed = false;
  return {
    actual: overall,
    pass: passed,
    call: steps.map((s) => s.call).join(" / "),
    steps,
    note: passed
      ? null
      : "Class tests never call result = " + cls.name + "(*args). The harness constructs the object (expected null), then calls methods on that instance.",
    error: steps.find((s) => s.error)?.error ?? null,
  };
}

function __idcRunClass(cls, args, expected, queryHint) {
  const ops = __idcOps(cls, args, expected, queryHint);
  if (!ops) {
    return {
      actual: null,
      pass: false,
      call: __idcCall(cls.name, Array.isArray(args) ? args : []),
      steps: null,
      note: "Class tests need method calls, not the constructed object. Use [[ClassName, method, ...], [ctorArgs, methodArgs, ...]] with expected [null, result, ...].",
      error: null,
    };
  }
  const cmds = ops[0];
  const argv = ops[1];
  const ran = __idcRunSequence(cls, cmds, argv, expected);
  const arity = __idcArity(cls);
  const ctorEmpty = arity && arity.required === 0;
  if (queryHint && ctorEmpty && ran.steps && ran.steps.length === 2 && !ran.error) {
    ran.steps = null;
    ran.call = __idcCall(cls.name + "()." + queryHint, argv[1] || []);
  }
  return ran;
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
  let __args = Array.isArray(__t.args) ? __t.args : [];
  if (Array.isArray(__t.commands) && Array.isArray(__t.arguments)) {
    __args = [__t.commands, __t.arguments];
  }
  const __expected = __t.expected;
  try {
    const found = __idcResolve();
    let __actual;
    let __ok;
    let __call = __idcCall(__idcName, __args);
    let __steps = null;
    let __note = null;
    let __err = null;
    // Functions: result = fn(*args). Classes: construct, then call methods.
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
      const ran = __idcRunClass(found.obj, __args, __expected, __idcName);
      __actual = ran.actual;
      __ok = ran.pass;
      __call = ran.call;
      __steps = ran.steps;
      __note = ran.note;
      __err = ran.error;
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
