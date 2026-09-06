/**
 * Tiny same-origin module probe for public/pyodide-diag.html.
 * Checks whether a module worker can import the Pyodide ESM build.
 */
const INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v314.0.6/full/";
import(INDEX_URL + "pyodide.mjs")
  .then((mod) => {
    self.postMessage({ ok: true, hasLoader: typeof mod.loadPyodide });
  })
  .catch((e) => {
    self.postMessage({ ok: false, error: String(e) });
  });
