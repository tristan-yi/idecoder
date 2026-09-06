import type { PlantedCategory, PlantedIssue, ProposalEdit } from "./types";

/**
 * The agent writes its best correct patch and describes it accurately. These
 * mutators then rewrite one site in the produced code, so the prose and the
 * code disagree in exactly one known place. Recording the site up front is what
 * makes "did you catch it?" answerable without asking a model to remember.
 */
type Site = {
  category: PlantedCategory;
  path: string;
  line: number;
  before: string;
  after: string;
  nextContents: string;
  label: string;
  explanation: string;
  keywords: string[][];
};

const PARAM_KEYWORDS = [
  ["params"],
  ["route param"],
  ["url param"],
  ["path param"],
  ["req.body"],
  ["wrong", "id"],
];

const EDGE_KEYWORDS = [
  ["edge case"],
  ["not found"],
  ["404"],
  ["missing"],
  ["guard"],
  ["empty"],
  ["validat"],
  ["undefined"],
  ["null check"],
];

const CONVENTION_KEYWORDS = [
  ["convention"],
  ["consistent"],
  ["rest of"],
  ["elsewhere"],
  ["apierror"],
  ["error style"],
  ["error handling"],
  ["house style"],
  ["differs"],
  ["matches"],
];

const STALE_KEYWORDS = [
  ["stale"],
  ["mutat"],
  ["updater"],
  ["functional"],
  ["closure"],
  ["directly"],
  ["push"],
  ["setstate"],
  ["re-render"],
  ["rerender"],
];

/**
 * Line indices in `after` that the proposal actually introduced or rewrote.
 * Planting outside this set would blame the agent for code it never touched.
 */
function changedLines(before: string, after: string): Set<number> {
  const a = before.split("\n");
  const b = after.split("\n");
  const changed = new Set<number>();
  if (!before.trim()) {
    b.forEach((_, i) => changed.add(i));
    return changed;
  }

  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i += 1;
    } else {
      changed.add(j);
      j += 1;
    }
  }
  while (j < b.length) {
    changed.add(j);
    j += 1;
  }
  return changed;
}

function replaceLine(lines: string[], index: number, next: string) {
  const copy = lines.slice();
  copy[index] = next;
  return copy.join("\n");
}

function indentOf(line: string) {
  return line.match(/^\s*/)?.[0] ?? "";
}

/** req.params.id -> req.body.id */
function paramSourceSites(path: string, lines: string[]): Site[] {
  const sites: Site[] = [];
  lines.forEach((line, index) => {
    const match = line.match(/req\.params\.([A-Za-z_$][\w$]*)/);
    if (!match) return;
    const after = line.replace(/req\.params\./, "req.body.");
    sites.push({
      category: "param-source-mismatch",
      path,
      line: index + 1,
      before: line,
      after,
      nextContents: replaceLine(lines, index, after),
      label: `Reads ${match[1]} from req.body instead of req.params`,
      explanation: `The route is registered with a ":${match[1]}" path segment, so the value arrives on req.params. Reading req.body.${match[1]} yields undefined for a GET or DELETE, and quietly disagrees with the URL on a POST or PATCH.`,
      keywords: PARAM_KEYWORDS,
    });
  });
  return sites;
}

/** Deletes a validation or not-found guard block. */
function missingEdgeCaseSites(path: string, lines: string[]): Site[] {
  const sites: Site[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const open = lines[i];
    if (!/^\s*if \(.*\) \{\s*$/.test(open)) continue;

    const indent = indentOf(open);
    let close = -1;
    let guards = false;
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j += 1) {
      if (/res\.status\(4\d\d\)|throw new ApiError\(4/.test(lines[j])) guards = true;
      if (lines[j] === `${indent}}`) {
        close = j;
        break;
      }
    }
    if (!guards || close === -1) continue;

    let end = close;
    if (lines[end + 1] === "") end += 1;

    const removed = lines.slice(i, close + 1);
    const copy = lines.slice();
    copy.splice(i, end - i + 1);

    sites.push({
      category: "missing-edge-case",
      path,
      line: i + 1,
      before: removed.join("\n"),
      after: "",
      nextContents: copy.join("\n"),
      label: `Drops the guard: ${open.trim()}`,
      explanation:
        "The happy path still works, so this only shows up on empty input or an id that is not in the store. Every other handler in this codebase checks first and returns a 4xx.",
      keywords: EDGE_KEYWORDS,
    });
  }
  return sites;
}

/** Swaps the codebase's error style for a different one. */
function conventionSites(path: string, lines: string[]): Site[] {
  const sites: Site[] = [];
  lines.forEach((line, index) => {
    const json = line.match(
      /^(\s*)(?:return )?res\.status\((\d{3})\)\.json\(\{ error: (.+) \}\);\s*$/,
    );
    if (json) {
      const after = `${json[1]}throw new Error(${json[3]});`;
      sites.push({
        category: "convention-violation",
        path,
        line: index + 1,
        before: line,
        after,
        nextContents: replaceLine(lines, index, after),
        label: "Throws instead of returning a status and an error body",
        explanation:
          "Every other handler responds with res.status(code).json({ error }). Throwing from inside the handler skips that shape, so the client's request wrapper never sees the JSON error body it expects and the caller gets a generic failure.",
        keywords: CONVENTION_KEYWORDS,
      });
      return;
    }

    const apiError = line.match(/^(\s*)throw new ApiError\((.+)\);\s*$/);
    if (apiError) {
      const after = `${apiError[1]}throw new Error("Request failed");`;
      sites.push({
        category: "convention-violation",
        path,
        line: index + 1,
        before: line,
        after,
        nextContents: replaceLine(lines, index, after),
        label: "Throws a bare Error where the codebase throws ApiError",
        explanation:
          "The client relies on ApiError carrying a status so callers can branch on 404 versus 400. A bare Error loses the status and the server's message.",
        keywords: CONVENTION_KEYWORDS,
      });
    }
  });
  return sites;
}

function stateVarFor(setter: string) {
  const stripped = setter.replace(/^set/, "");
  return stripped.charAt(0).toLowerCase() + stripped.slice(1);
}

/** Functional updater -> direct mutation, or a stale closure read. */
function staleStateSites(path: string, lines: string[]): Site[] {
  const sites: Site[] = [];

  lines.forEach((line, index) => {
    const append = line.match(
      /^(\s*)(set[A-Z]\w*)\(\(current\) => \[\.\.\.current, ([\w.]+)\]\);\s*$/,
    );
    if (append) {
      const [, indent, setter, value] = append;
      const stateVar = stateVarFor(setter);
      const after = `${indent}${stateVar}.push(${value});`;
      sites.push({
        category: "react-stale-state",
        path,
        line: index + 1,
        before: line,
        after,
        nextContents: replaceLine(lines, index, after),
        label: `Mutates ${stateVar} in place instead of calling ${setter}`,
        explanation: `Pushing onto the array React handed you does not schedule a render, and the next render still reads the previous value. The list looks right in a debugger and wrong on screen.`,
        keywords: STALE_KEYWORDS,
      });
      return;
    }

    const derived = line.match(
      /^(\s*)(set[A-Z]\w*)\(\(current\) => current\.(map|filter|concat)\(/,
    );
    if (derived) {
      const [, indent, setter, method] = derived;
      const stateVar = stateVarFor(setter);
      const after = `${indent}${setter}(${stateVar}.${method}(`;
      sites.push({
        category: "react-stale-state",
        path,
        line: index + 1,
        before: line,
        after,
        nextContents: replaceLine(lines, index, after),
        label: `Reads ${stateVar} from the closure instead of using the updater form`,
        explanation: `The surrounding callback is memoised, so ${stateVar} is whatever it was when the callback was created. Two updates in the same tick, or an update after an await, will compute from a stale value and drop one of them.`,
        keywords: STALE_KEYWORDS,
      });
    }
  });

  return sites;
}

function collectSites(edit: ProposalEdit): Site[] {
  const lines = edit.after.split("\n");
  const touched = changedLines(edit.before, edit.after);
  return [
    ...paramSourceSites(edit.path, lines),
    ...missingEdgeCaseSites(edit.path, lines),
    ...conventionSites(edit.path, lines),
    ...staleStateSites(edit.path, lines),
  ].filter((site) => touched.has(site.line - 1));
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export const DEFAULT_PLANT_RATE = 0.6;

/**
 * Applies at most one mutation across the proposal. Returns the edits to show
 * the user plus the recorded issue, or null when this suggestion is clean.
 */
export function plantIssue(
  edits: ProposalEdit[],
  rate = DEFAULT_PLANT_RATE,
  avoid: PlantedCategory[] = [],
): { edits: ProposalEdit[]; planted: PlantedIssue | null } {
  if (Math.random() >= rate) return { edits, planted: null };

  const sites = edits.flatMap(collectSites);
  if (!sites.length) return { edits, planted: null };

  // Choose a category first so one file full of guards cannot crowd out the
  // other bug classes, and skip whatever was planted recently so a session does
  // not turn into the same trap over and over.
  const categories = Array.from(new Set(sites.map((s) => s.category)));
  const fresh = categories.filter((c) => !avoid.includes(c));
  const category = pick(fresh.length ? fresh : categories);
  const site = pick(sites.filter((s) => s.category === category));

  return {
    edits: edits.map((edit) =>
      edit.path === site.path ? { ...edit, after: site.nextContents } : edit,
    ),
    planted: {
      category: site.category,
      label: site.label,
      explanation: site.explanation,
      file: site.path,
      line: site.line,
      before: site.before,
      after: site.after,
      keywords: site.keywords,
    },
  };
}

/** Instant local read on whether the written explanation named the defect. */
export function explanationMatches(issue: PlantedIssue, text: string) {
  const lower = text.toLowerCase();
  return issue.keywords.some((group) => group.every((term) => lower.includes(term)));
}

export const CATEGORY_LABELS: Record<PlantedCategory, string> = {
  "param-source-mismatch": "Mismatched request field",
  "missing-edge-case": "Missed edge case",
  "convention-violation": "Convention violation",
  "react-stale-state": "Stale React state",
};
