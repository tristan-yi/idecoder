import type { Example, Problem, TestCase } from "./types";

export type ConsistencyIssue = {
  kind:
    | "access-mismatch"
    | "empty-node"
    | "example-output-mismatch"
    | "expected-not-derivable";
  testIndex: number;
  hidden?: boolean;
  message: string;
};

type AccessNode = {
  id: string;
  userIds: string[];
  childIds: string[];
};

type DirectAccessClaim = {
  user: string;
  nodes: string[];
};

type EmptyNodeClaim = {
  node: string;
};

type Graph = {
  nodes: AccessNode[];
  byId: Map<string, AccessNode>;
  parents: Map<string, string[]>;
};

const PARENT_HINT = /^(root|parent|base|top|home|team)$/i;

export function cloneProblem(problem: Problem): Problem {
  return JSON.parse(JSON.stringify(problem)) as Problem;
}

export function stripGenerationMeta(problem: Problem): Problem {
  const { warnings: _w, generationNotes: _n, ...rest } = problem;
  return rest;
}

/**
 * Align test arrays with written examples, then report anything still inconsistent.
 * High-confidence graph edits (exclusive "direct access" lists, empty-node claims)
 * are applied in place on a clone. Remaining issues become `problem.warnings`.
 */
export async function finalizeGeneratedProblem(
  problem: Problem,
  repair?: (
    problem: Problem,
    issues: ConsistencyIssue[],
  ) => Promise<Problem | null>,
): Promise<Problem> {
  const local = applyLocalConsistencyRepairs(problem);
  let next = local.problem;
  let issues = local.issues;

  if (issues.length > 0 && repair) {
    try {
      const retried = await repair(next, issues);
      if (retried) {
        const cleaned = applyLocalConsistencyRepairs(retried);
        if (cleaned.issues.length < issues.length) {
          next = cleaned.problem;
          issues = cleaned.issues;
          local.notes.push(...cleaned.notes);
        }
      }
    } catch {
      // Keep the locally repaired draft; remaining issues still surface.
    }
  }

  const leftover = unique(issues.map((issue) => issue.message));
  const notes = unique(local.notes);

  delete next.warnings;
  delete next.generationNotes;
  if (notes.length > 0) next.generationNotes = notes;
  if (leftover.length > 0) next.warnings = leftover;
  return next;
}

export function applyLocalConsistencyRepairs(problem: Problem): {
  problem: Problem;
  notes: string[];
  issues: ConsistencyIssue[];
} {
  const next = cloneProblem(problem);
  const notes: string[] = [];

  next.exampleTests.forEach((test, i) => {
    const example = next.examples[i];
    notes.push(...repairTestAgainstExample(test, example, next.description, i === 0));
  });

  const issues = validateProblemConsistency(next);
  return { problem: next, notes: unique(notes), issues };
}

export function validateProblemConsistency(problem: Problem): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  problem.exampleTests.forEach((test, i) => {
    issues.push(
      ...checkTest(test, i, false, problem.examples[i], i === 0 ? problem.description : ""),
    );
  });
  problem.hiddenTests.forEach((test, i) => {
    issues.push(...checkTest(test, i, true, undefined, ""));
  });

  return issues;
}

function checkTest(
  test: TestCase,
  testIndex: number,
  hidden: boolean,
  example: Example | undefined,
  description: string,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const label = hidden ? `Hidden test ${testIndex + 1}` : `Example ${testIndex + 1}`;
  const graph = extractGraph(test);
  const queryUsers = extractQueryUsers(test);
  const text = [example?.explanation, example?.input, description]
    .filter(Boolean)
    .join("\n");

  if (example && !hidden) {
    const parsed = parseLooseValue(example.output);
    if (parsed !== undefined) {
      const expected = unwrapExpected(test.expected);
      if (!similarValue(parsed, expected) && !similarValue(parsed, test.expected)) {
        issues.push({
          kind: "example-output-mismatch",
          testIndex,
          hidden,
          message: `${label}: written output ${preview(example.output)} does not match test expected ${preview(test.expected)}.`,
        });
      }
    }
  }

  if (!graph) {
    return issues;
  }

  const claims = parseDirectAccessClaims(text);
  const emptyClaims = parseEmptyNodeClaims(text);

  for (const claim of claims) {
    for (const name of claim.nodes) {
      const node = findNode(graph, name);
      if (!node) {
        issues.push({
          kind: "access-mismatch",
          testIndex,
          hidden,
          message: `${label}: explanation says ${claim.user} has direct access to ${name}, but that node is missing from the test input.`,
        });
        continue;
      }
      if (!containsUser(node.userIds, claim.user)) {
        issues.push({
          kind: "access-mismatch",
          testIndex,
          hidden,
          message: `${label}: explanation says ${claim.user} has direct access to ${node.id}, but its user_ids are ${preview(node.userIds)}.`,
        });
      }
    }
    for (const node of graph.nodes) {
      if (claim.nodes.some((name) => idsMatch(name, node.id))) continue;
      if (containsUser(node.userIds, claim.user)) {
        issues.push({
          kind: "access-mismatch",
          testIndex,
          hidden,
          message: `${label}: explanation lists ${claim.user}'s direct access as ${claim.nodes.join(", ")}, but ${node.id} also has user_ids ${preview(node.userIds)}.`,
        });
      }
    }
  }

  for (const claim of emptyClaims) {
    const resolved =
      findNode(graph, claim.node) ??
      (PARENT_HINT.test(claim.node) ? inferParentNode(graph, claims) : undefined);
    if (!resolved) continue;
    if (resolved.userIds.length > 0) {
      issues.push({
        kind: "empty-node",
        testIndex,
        hidden,
        message: `${label}: explanation implies ${resolved.id} has no users, but its user_ids are ${preview(resolved.userIds)}.`,
      });
    }
  }

  const expectedNodes = expectedNodeIds(test.expected);
  if (expectedNodes && queryUsers.length > 0) {
    for (const user of queryUsers) {
      for (const name of expectedNodes) {
        if (!findNode(graph, name)) {
          issues.push({
            kind: "expected-not-derivable",
            testIndex,
            hidden,
            message: `${label}: expected output names ${name}, which is not in the test input.`,
          });
          continue;
        }
        if (!userCanAccess(graph, name, user)) {
          issues.push({
            kind: "expected-not-derivable",
            testIndex,
            hidden,
            message: `${label}: expected ${name} for user ${user}, but ${user} is not on that node or any ancestor in the test input.`,
          });
        }
      }
      const covering = simpleFolderCovering(graph, user);
      if (
        covering &&
        looksLikeFolderQuery(test) &&
        !similarValue(expectedNodes, covering.highest) &&
        !similarValue(expectedNodes, covering.direct) &&
        !similarValue(expectedNodes, covering.inherited)
      ) {
        issues.push({
          kind: "expected-not-derivable",
          testIndex,
          hidden,
          message: `${label}: expected ${preview(expectedNodes)} is not derivable from this input for user ${user} (direct folders ${preview(covering.direct)}, highest ${preview(covering.highest)}).`,
        });
      }
    }
  }

  return issues;
}

function repairTestAgainstExample(
  test: TestCase,
  example: Example | undefined,
  description: string,
  includeDescription: boolean,
): string[] {
  const notes: string[] = [];
  const graph = extractGraph(test);

  if (graph) {
    const text = [example?.explanation, example?.input, includeDescription ? description : ""]
      .filter(Boolean)
      .join("\n");
    const claims = parseDirectAccessClaims(text);
    const emptyClaims = parseEmptyNodeClaims(text);

    for (const claim of claims) {
      for (const name of claim.nodes) {
        const node = findNode(graph, name);
        if (node && !containsUser(node.userIds, claim.user)) {
          node.userIds.push(claim.user);
          notes.push(`added ${claim.user} to ${node.id}.user_ids to match the example.`);
        }
      }
      for (const node of graph.nodes) {
        if (claim.nodes.some((name) => idsMatch(name, node.id))) continue;
        if (!containsUser(node.userIds, claim.user)) continue;
        if (!isParentOfClaimedNodes(graph, node, claim.nodes) && !PARENT_HINT.test(node.id)) {
          continue;
        }
        const kept = node.userIds.filter((id) => !idsMatch(id, claim.user));
        node.userIds.splice(0, node.userIds.length, ...kept);
        notes.push(
          `removed ${claim.user} from ${node.id}.user_ids; the example only grants direct access to ${claim.nodes.join(", ")}.`,
        );
      }
    }

    for (const claim of emptyClaims) {
      const node =
        findNode(graph, claim.node) ??
        (PARENT_HINT.test(claim.node) ? inferParentNode(graph, claims) : undefined);
      if (node && node.userIds.length > 0) {
        const extra = node.userIds.slice();
        node.userIds.splice(0, node.userIds.length);
        notes.push(
          `cleared ${node.id}.user_ids (was ${preview(extra)}) because the example says it has none.`,
        );
      }
    }
  }

  if (example) {
    const parsed = parseLooseValue(example.output);
    if (parsed !== undefined) {
      const expected = unwrapExpected(test.expected);
      if (!similarValue(parsed, expected) && !similarValue(parsed, test.expected)) {
        test.expected = alignExpectedShape(test.expected, parsed);
        notes.push(`set the example test expected value to match the written output.`);
      }
    }
  }

  return notes;
}

export function parseDirectAccessClaims(text: string): DirectAccessClaim[] {
  if (!text) return [];
  const claims: DirectAccessClaim[] = [];
  const patterns = [
    /users?\s+([A-Za-z0-9_-]+)\s+has\s+direct\s+access\s+to\s+([^.;\n]+)/gi,
    /direct\s+access(?:\s+for)?\s+users?\s+([A-Za-z0-9_-]+)\s*(?:is|:)\s*([^.;\n]+)/gi,
    /users?\s+([A-Za-z0-9_-]+)\s+is\s+granted\s+direct\s+access\s+(?:to|on)\s+([^.;\n]+)/gi,
    /only\s+([^.;\n]+?)\s+(?:have|has|contain)\s+(?:direct\s+access\s+for\s+)?users?\s+([A-Za-z0-9_-]+)/gi,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const swapped = pattern.source.startsWith("only");
      const user = swapped ? match[2] : match[1];
      const nodes = splitNodeList(swapped ? match[1] : match[2]);
      if (user && nodes.length > 0) claims.push({ user, nodes });
    }
  }
  return claims;
}

export function parseEmptyNodeClaims(text: string): EmptyNodeClaim[] {
  if (!text) return [];
  const claims: EmptyNodeClaim[] = [];
  const patterns = [
    /(?:the\s+)?([A-Za-z][\w-]*)\s+(?:folder|node|parent)?\s*(?:has|have|contains?)\s+(?:an?\s+)?(?:empty|no|none|zero)\s+(?:direct\s+)?(?:access|users?|user_ids)/gi,
    /user_ids\s+(?:of|for)\s+(?:the\s+)?([A-Za-z][\w-]*)\s+(?:is|are)\s*(?:\[\]|empty|none)/gi,
    /(?:the\s+)?(root|parent)\s+(?:folder|node)?\s*(?:has|have)\s+(?:no|none|empty)/gi,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      if (match[1]) claims.push({ node: match[1] });
    }
  }
  return claims;
}

function extractGraph(test: TestCase): Graph | null {
  const ctor = constructorPayload(test);
  const lists: unknown[][][] = [];
  collectRecordLists(ctor, lists);
  if (lists.length === 0) return null;

  const nodes: AccessNode[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const row of list) {
      const node = recordToNode(row);
      if (!node) continue;
      const key = normId(node.id);
      if (seen.has(key)) continue;
      seen.add(key);
      nodes.push(node);
    }
  }
  if (nodes.length < 2) return null;

  const byId = new Map<string, AccessNode>();
  for (const node of nodes) byId.set(normId(node.id), node);

  const parents = new Map<string, string[]>();
  for (const node of nodes) {
    for (const child of node.childIds) {
      const key = normId(child);
      const list = parents.get(key) ?? [];
      list.push(node.id);
      parents.set(key, list);
    }
  }

  return { nodes, byId, parents };
}

function constructorPayload(test: TestCase): unknown[] {
  let args: unknown[] = [];
  if (Array.isArray(test.commands) && Array.isArray(test.arguments)) {
    args = [test.commands, test.arguments];
  } else if (Array.isArray(test.args)) {
    args = test.args;
  }

  if (
    args.length === 1 &&
    Array.isArray(args[0]) &&
    (args[0] as unknown[]).length === 2 &&
    isStringArray((args[0] as unknown[])[0]) &&
    Array.isArray((args[0] as unknown[])[1])
  ) {
    args = args[0] as unknown[];
  }

  if (args.length >= 2 && isStringArray(args[0]) && Array.isArray(args[1])) {
    const argv = args[1] as unknown[];
    const step = argv[0];
    return Array.isArray(step) ? step : [];
  }

  if (args.length >= 1 && Array.isArray(args[0]) && looksLikeForest(args[0])) {
    const first = args[0] as unknown[];
    if (first.length <= 4 && first.every(isRecordList)) return first;
    return args;
  }

  return args;
}

function extractQueryUsers(test: TestCase): string[] {
  let args: unknown[] = Array.isArray(test.args) ? test.args : [];
  if (Array.isArray(test.commands) && Array.isArray(test.arguments)) {
    args = [test.commands, test.arguments];
  }
  const found: string[] = [];
  const take = (value: unknown) => {
    if (typeof value === "string" && value.length > 0 && value.length <= 32) {
      if (!/manager|solution|get_|fewest|owns|query/i.test(value)) found.push(value);
      return;
    }
    if (Array.isArray(value)) value.forEach(take);
  };

  if (args.length >= 2 && isStringArray(args[0]) && Array.isArray(args[1])) {
    (args[1] as unknown[]).slice(1).forEach(take);
    return unique(found);
  }

  for (let i = args.length - 1; i >= 0; i--) {
    const item = args[i];
    if (typeof item === "string" && item.length <= 32) {
      found.push(item);
      continue;
    }
    if (isRecordList(item) || looksLikeForest(item)) break;
  }
  return unique(found);
}

function collectRecordLists(value: unknown, out: unknown[][][]): void {
  if (!Array.isArray(value)) return;
  if (isRecordList(value)) {
    out.push(value);
    return;
  }
  for (const item of value) collectRecordLists(item, out);
}

function looksLikeForest(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (isRecordList(value)) return true;
  return (
    value.length >= 2 &&
    value.length <= 4 &&
    value.every((item) => isRecordList(item) || item === undefined)
  );
}

function isRecordList(value: unknown): value is unknown[][] {
  return Array.isArray(value) && value.length > 0 && value.every(looksLikeRecord);
}

function looksLikeRecord(row: unknown): boolean {
  if (row && typeof row === "object" && !Array.isArray(row)) {
    const rec = row as Record<string, unknown>;
    return typeof (rec.id ?? rec.uuid ?? rec.name) === "string";
  }
  if (!Array.isArray(row) || row.length < 2) return false;
  if (typeof row[0] !== "string") return false;
  return row.slice(1).some((item) => Array.isArray(item));
}

function recordToNode(row: unknown): AccessNode | null {
  if (row && typeof row === "object" && !Array.isArray(row)) {
    const rec = row as Record<string, unknown>;
    const id = rec.id ?? rec.uuid ?? rec.name;
    if (typeof id !== "string") return null;
    const userIds = asMutableStringArray(
      rec.user_ids ?? rec.userIds ?? rec.users ?? rec.access,
    );
    const childIds = [
      ...asStringArray(rec.folder_ids ?? rec.folderIds ?? rec.folders),
      ...asStringArray(rec.file_ids ?? rec.fileIds ?? rec.files),
      ...asStringArray(rec.children),
    ];
    if (!userIds) return null;
    return { id, userIds, childIds };
  }
  if (!Array.isArray(row) || typeof row[0] !== "string") return null;
  const id = row[0];
  const stringArrays = row
    .slice(1)
    .filter((item): item is unknown[] => Array.isArray(item) && item.every((v) => typeof v === "string"));
  if (stringArrays.length === 0) return null;
  const userIds = stringArrays[stringArrays.length - 1] as string[];
  const childIds = stringArrays.slice(0, -1).flat() as string[];
  return { id, userIds, childIds };
}

function asMutableStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
  return value as string[];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : [];
}

function findNode(graph: Graph, name: string): AccessNode | undefined {
  return graph.byId.get(normId(name)) ?? graph.nodes.find((node) => idsMatch(node.id, name));
}

function inferParentNode(graph: Graph, claims: DirectAccessClaim[]): AccessNode | undefined {
  const childIds = new Set(claims.flatMap((claim) => claim.nodes.map(normId)));
  const parents = graph.nodes.filter((node) =>
    node.childIds.some((child) => childIds.has(normId(child))),
  );
  if (parents.length === 1) return parents[0];
  return graph.nodes.find((node) => PARENT_HINT.test(node.id));
}

function isParentOfClaimedNodes(
  graph: Graph,
  node: AccessNode,
  claimed: string[],
): boolean {
  if (node.childIds.some((child) => claimed.some((name) => idsMatch(name, child)))) {
    return true;
  }
  return claimed.some((name) => isAncestorOf(graph, node, name));
}

function isAncestorOf(graph: Graph, ancestor: AccessNode, descendantName: string): boolean {
  const start = findNode(graph, descendantName);
  if (!start) return false;
  const queue = [...(graph.parents.get(normId(start.id)) ?? [])];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.pop() as string;
    if (idsMatch(id, ancestor.id)) return true;
    const key = normId(id);
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(...(graph.parents.get(key) ?? []));
  }
  return false;
}

function looksLikeFolderQuery(test: TestCase): boolean {
  const names = [
    ...(Array.isArray(test.commands) ? test.commands : []),
    ...(Array.isArray(test.args) && isStringArray(test.args[0]) ? test.args[0] : []),
  ];
  return names.some((name) => /fewest|access|folder|permission|cover/i.test(name));
}

function simpleFolderCovering(
  graph: Graph,
  user: string,
): { direct: string[]; highest: string[]; inherited: string[] } | null {
  const folderLike = graph.nodes.filter(
    (node) =>
      node.childIds.length > 0 ||
      PARENT_HINT.test(node.id) ||
      /folder|root|team/i.test(node.id),
  );
  const direct = folderLike.filter((node) => containsUser(node.userIds, user));
  if (direct.length === 0) return null;
  const highest = direct.filter(
    (node) => !direct.some((other) => other !== node && isAncestorOf(graph, other, node.id)),
  );
  const inherited = folderLike.filter((node) => userCanAccess(graph, node.id, user));
  return {
    direct: direct.map((node) => node.id),
    highest: highest.map((node) => node.id),
    inherited: inherited.map((node) => node.id),
  };
}

function userCanAccess(graph: Graph, nodeName: string, user: string): boolean {
  const start = findNode(graph, nodeName);
  if (!start) return false;
  const queue = [start.id];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.pop() as string;
    const key = normId(id);
    if (seen.has(key)) continue;
    seen.add(key);
    const node = findNode(graph, id);
    if (node && containsUser(node.userIds, user)) return true;
    for (const parent of graph.parents.get(key) ?? []) queue.push(parent);
  }
  return false;
}

function expectedNodeIds(expected: unknown): string[] | null {
  const value = unwrapExpected(expected);
  if (!isStringArray(value) || value.length === 0) return null;
  if (value.some((item) => item.length > 80)) return null;
  return value;
}

function unwrapExpected(expected: unknown): unknown {
  if (Array.isArray(expected) && expected.length >= 2 && expected[0] === null) {
    return expected.length === 2 ? expected[1] : expected.slice(1);
  }
  return expected;
}

function alignExpectedShape(current: unknown, parsed: unknown): unknown {
  if (Array.isArray(current) && current.length >= 2 && current[0] === null) {
    if (current.length === 2) return [null, parsed];
    if (Array.isArray(parsed)) return [null, ...parsed];
    return [null, parsed];
  }
  return parsed;
}

function similarValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (JSON.stringify(a) === JSON.stringify(b)) return true;
  if (isStringArray(a) && isStringArray(b)) {
    return [...a].map(normId).sort().join() === [...b].map(normId).sort().join();
  }
  return false;
}

function parseLooseValue(raw: string): unknown {
  const text = raw.trim();
  if (!text) return undefined;
  const attempts = [text, text.replace(/'/g, '"')];
  const extracted = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (extracted) attempts.push(extracted[1], extracted[1].replace(/'/g, '"'));
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // keep trying
    }
  }
  return undefined;
}

function splitNodeList(raw: string): string[] {
  return raw
    .replace(/\b(folders?|files?|nodes?|and)\b/gi, ",")
    .split(/[,/]/)
    .map((part) => part.replace(/[`'"[\]]/g, "").trim())
    .filter((part) => part.length > 0 && !/^(only|the|to|of|with)$/i.test(part));
}

function containsUser(userIds: string[], user: string): boolean {
  return userIds.some((id) => idsMatch(id, user));
}

function idsMatch(a: string, b: string): boolean {
  return normId(a) === normId(b);
}

function normId(value: string): string {
  return value.replace(/[\s_-]+/g, "").toLowerCase();
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string");
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function preview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}
