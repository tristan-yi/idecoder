/**
 * Worker-side runtime for the seed codebase. It is a string because it is
 * turned into a blob Worker, the same way the LeetCode pad runs JavaScript.
 *
 * It provides just enough of react and express for the seeded chain to run for
 * real: a handler calls an API helper, the helper calls fetch, fetch dispatches
 * into the registered routes, and the route writes to the in-memory store.
 */
export const WORKER_SOURCE = String.raw`
"use strict";

var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
var logs = [];

function log() {
  var parts = [];
  for (var i = 0; i < arguments.length; i++) {
    var value = arguments[i];
    if (typeof value === "string") parts.push(value);
    else {
      try { parts.push(JSON.stringify(value)); } catch (e) { parts.push(String(value)); }
    }
  }
  logs.push(parts.join(" "));
}

function clone(value) {
  if (value === null || typeof value !== "object") return value;
  try { return structuredClone(value); } catch (e) {}
  try { return JSON.parse(JSON.stringify(value)); } catch (e) {}
  return value;
}

function sameDeps(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/* ---------------------------------------------------------------- react --- */

function createReact() {
  var slots = [];
  var cursor = 0;
  var dirty = false;
  var effects = [];

  function slot(init) {
    if (slots.length <= cursor) slots.push(init());
    return slots[cursor++];
  }

  var react = {
    useState: function (initial) {
      var cell = slot(function () {
        return { value: clone(typeof initial === "function" ? initial() : initial) };
      });
      var setter = function (next) {
        var resolved = typeof next === "function" ? next(clone(cell.value)) : next;
        cell.value = clone(resolved);
        dirty = true;
      };
      return [clone(cell.value), setter];
    },
    // Memoised for real, so a callback with an empty dep array keeps closing
    // over the state it saw on first render. That is what makes a stale-closure
    // bug observable instead of silently correct.
    useCallback: function (fn, deps) {
      var cell = slot(function () { return { fn: fn, deps: deps }; });
      if (!sameDeps(cell.deps, deps)) { cell.fn = fn; cell.deps = deps; }
      return cell.fn;
    },
    useMemo: function (fn, deps) {
      var cell = slot(function () { return { value: fn(), deps: deps }; });
      if (!sameDeps(cell.deps, deps)) { cell.value = fn(); cell.deps = deps; }
      return cell.value;
    },
    useRef: function (initial) {
      return slot(function () { return { current: initial }; });
    },
    useEffect: function (fn) { effects.push(fn); },
    useLayoutEffect: function (fn) { effects.push(fn); },
    createElement: function (type, props) {
      var children = Array.prototype.slice.call(arguments, 2);
      return { type: type, props: props || {}, children: children };
    },
    Fragment: "Fragment",
  };

  react.__begin = function () { cursor = 0; effects = []; };
  react.__flushEffects = function () {
    var pending = effects.slice();
    effects = [];
    for (var i = 0; i < pending.length; i++) pending[i]();
  };
  react.__consumeDirty = function () { var was = dirty; dirty = false; return was; };
  react.__reset = function () { slots = []; cursor = 0; dirty = false; effects = []; };
  react.default = react;
  return react;
}

/* -------------------------------------------------------------- express --- */

function createExpress() {
  var routes = [];
  var METHODS = ["get", "post", "put", "patch", "delete"];

  function Router() {
    var r = {};
    METHODS.forEach(function (method) {
      r[method] = function (path, handler) {
        routes.push({ method: method.toUpperCase(), path: path, handler: handler });
        return r;
      };
    });
    r.use = function () { return r; };
    return r;
  }

  return { module: { Router: Router, default: { Router: Router } }, routes: routes };
}

function matchRoute(routes, method, pathname) {
  var wanted = pathname.split("/").filter(Boolean);
  for (var i = 0; i < routes.length; i++) {
    var route = routes[i];
    if (route.method !== method) continue;
    var declared = route.path.split("/").filter(Boolean);
    if (declared.length !== wanted.length) continue;
    var params = {};
    var ok = true;
    for (var j = 0; j < declared.length; j++) {
      if (declared[j].charAt(0) === ":") params[declared[j].slice(1)] = decodeURIComponent(wanted[j]);
      else if (declared[j] !== wanted[j]) { ok = false; break; }
    }
    if (ok) return { route: route, params: params };
  }
  return null;
}

function makeResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    json: async function () { return payload; },
    text: async function () {
      return typeof payload === "string" ? payload : JSON.stringify(payload);
    },
  };
}

function createFetch(routes) {
  return async function (url, init) {
    init = init || {};
    var raw = String(url).split("?");
    var pathname = raw[0].replace(/^\/api/, "") || "/";
    var method = (init.method || "GET").toUpperCase();

    var matched = matchRoute(routes, method, pathname);
    if (!matched) {
      return makeResponse(404, { error: "No route for " + method + " " + pathname });
    }

    var body = {};
    if (typeof init.body === "string") {
      try { body = JSON.parse(init.body); } catch (e) { body = init.body; }
    } else if (init.body && typeof init.body === "object") {
      body = init.body;
    }

    var query = {};
    if (raw[1]) {
      raw[1].split("&").forEach(function (pair) {
        if (!pair) return;
        var bits = pair.split("=");
        query[decodeURIComponent(bits[0])] = decodeURIComponent(bits[1] || "");
      });
    }

    var req = {
      params: matched.params,
      query: query,
      body: body,
      headers: init.headers || {},
      method: method,
      path: pathname,
      originalUrl: String(url),
    };

    var statusCode = 200;
    var payload;
    var settled = false;
    var res = {
      status: function (code) { statusCode = code; return res; },
      json: function (value) { payload = value; settled = true; return res; },
      send: function (value) { payload = value; settled = true; return res; },
      end: function () { settled = true; return res; },
      set: function () { return res; },
      setHeader: function () { return res; },
    };

    try {
      await matched.route.handler(req, res, function () {});
    } catch (err) {
      return makeResponse(500, { error: err && err.message ? err.message : String(err) });
    }

    if (!settled) {
      return makeResponse(500, { error: "Handler returned without sending a response" });
    }
    return makeResponse(statusCode, payload);
  };
}

/* -------------------------------------------------------- module loader --- */

function createLoader(modules, shims, fetchImpl) {
  var cache = new Map();

  function resolve(importer, request) {
    if (request.charAt(0) !== ".") return request;
    var base = importer.split("/").slice(0, -1);
    request.split("/").forEach(function (part) {
      if (part === "." || part === "") return;
      if (part === "..") base.pop();
      else base.push(part);
    });
    var joined = base.join("/");
    var candidates = [joined, joined + ".ts", joined + ".tsx", joined + "/index.ts"];
    for (var i = 0; i < candidates.length; i++) {
      if (Object.prototype.hasOwnProperty.call(modules, candidates[i])) return candidates[i];
    }
    return joined;
  }

  function load(path) {
    if (Object.prototype.hasOwnProperty.call(shims, path)) return shims[path];
    if (cache.has(path)) return cache.get(path).exports;
    if (!Object.prototype.hasOwnProperty.call(modules, path)) {
      throw new Error("Cannot find module '" + path + "'");
    }

    var mod = { exports: {} };
    cache.set(path, mod);
    // fetch is passed in rather than left to the global so the seeded client
    // always reaches the fake router, whatever the host environment provides.
    var fn = new Function("require", "module", "exports", "console", "fetch", modules[path]);
    fn(
      function (request) { return load(resolve(path, request)); },
      mod,
      mod.exports,
      { log: log, warn: log, error: log, info: log },
      fetchImpl,
    );
    return mod.exports;
  }

  return { load: load, reset: function () { cache.clear(); } };
}

/* ------------------------------------------------------------- entries --- */

function findHookModule(modules) {
  var paths = Object.keys(modules);
  for (var i = 0; i < paths.length; i++) {
    if (/^client\/use[A-Za-z0-9_]+\.ts$/.test(paths[i])) return paths[i];
  }
  return null;
}

function makeHookDriver(react, hookFn) {
  var current = null;

  function render() {
    react.__begin();
    current = hookFn();
    react.__flushEffects();
  }

  render();

  return {
    get current() { return current; },
    render: render,
    act: async function (fn) {
      var result = await fn(current);
      var guard = 0;
      while (react.__consumeDirty() && guard < 50) { guard++; render(); }
      return result;
    },
    reset: function () { react.__reset(); render(); },
  };
}

/* -------------------------------------------------------------- runner --- */

self.onmessage = async function (event) {
  var modules = event.data.modules;
  var scenarios = event.data.scenarios;
  var results = [];

  try {
    var react = createReact();
    var express = createExpress();
    var jsxRuntime = {
      jsx: react.createElement,
      jsxs: react.createElement,
      jsxDEV: react.createElement,
      Fragment: react.Fragment,
    };

    var shims = {
      react: react,
      "react/jsx-runtime": jsxRuntime,
      "react/jsx-dev-runtime": jsxRuntime,
      express: express.module,
    };

    // express.routes is filled in when routes.ts runs, but the array identity
    // is stable, so the dispatcher can be built before anything is registered.
    var fetchImpl = createFetch(express.routes);
    var loader = createLoader(modules, shims, fetchImpl);

    loader.load("server/routes.ts");

    var api = loader.load("client/api.ts");
    var store = loader.load("server/store.ts");

    var hookPath = findHookModule(modules);
    var hookDriver = null;
    if (hookPath) {
      var hookModule = loader.load(hookPath);
      var hookName = Object.keys(hookModule).find(function (key) {
        return /^use[A-Z]/.test(key) && typeof hookModule[key] === "function";
      });
      if (hookName) hookDriver = makeHookDriver(react, hookModule[hookName]);
    }

    var reset = async function () {
      if (typeof store.resetStore === "function") store.resetStore();
      if (hookDriver) hookDriver.reset();
    };

    for (var i = 0; i < scenarios.length; i++) {
      var scenario = scenarios[i];
      var assertions = [];
      var expect = function (name, pass, detail) {
        assertions.push({
          name: String(name),
          pass: Boolean(pass),
          detail: detail === undefined ? "" : String(detail),
        });
      };

      var error = null;
      try {
        var run = new AsyncFunction("api", "store", "hook", "expect", "reset", scenario.code);
        await run(api, store, hookDriver, expect, reset);
      } catch (err) {
        error = err && err.message ? err.message : String(err);
      }

      results.push({
        id: scenario.id,
        name: scenario.name,
        pass: error === null && assertions.length > 0 && assertions.every(function (a) { return a.pass; }),
        assertions: assertions,
        error: error,
      });
    }

    self.postMessage({ scenarios: results, logs: logs, compileError: null });
  } catch (err) {
    self.postMessage({
      scenarios: results,
      logs: logs,
      compileError: err && err.message ? err.message : String(err),
    });
  }
};
`;
