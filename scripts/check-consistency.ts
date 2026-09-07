/**
 * Checks that generated-problem examples stay consistent with test arrays.
 *
 * Usage: npx tsx scripts/check-consistency.ts
 */
import { SAMPLE_PROBLEMS } from "../src/lib/samples";
import {
  applyLocalConsistencyRepairs,
  finalizeGeneratedProblem,
  parseDirectAccessClaims,
  parseEmptyNodeClaims,
  validateProblemConsistency,
} from "../src/lib/problem-consistency";
import type { Problem, TestCase } from "../src/lib/types";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`);
  }
}

function baseProblem(partial: Partial<Problem>): Problem {
  return {
    title: "Permission Manager",
    difficulty: "Hard",
    topics: ["Graph"],
    description: "Return the fewest folders that cover a user's access.",
    examples: [],
    constraints: [],
    functionName: "PermissionManager",
    starterCode: { python: "class PermissionManager:\n    pass\n" },
    exampleTests: [],
    hiddenTests: [],
    ...partial,
  };
}

const teams: unknown[][] = [];
const folders: unknown[][] = [
  ["Root", ["Folder1", "Folder2"], [], ["A"]],
  ["Folder1", [], ["File1"], ["A"]],
  ["Folder2", ["Folder3"], [], []],
  ["Folder3", [], ["File2"], ["A"]],
];
const files: unknown[][] = [
  ["File1", []],
  ["File2", []],
];

function permissionTest(folderRows: unknown[][], expected: unknown): TestCase {
  return {
    commands: ["PermissionManager", "get_fewest"],
    arguments: [[[teams, folderRows, files]], ["A"]],
    expected,
  };
}

console.log("Claim parsing");
{
  const claims = parseDirectAccessClaims(
    "User A has direct access to Folder1 and Folder3. Root has no users.",
  );
  check(
    "parses exclusive direct-access folders for user A",
    claims.length === 1 &&
      claims[0]?.user === "A" &&
      claims[0]?.nodes.join(",") === "Folder1,Folder3",
    JSON.stringify(claims),
  );
  const empty = parseEmptyNodeClaims(
    "User A has direct access to Folder1 and Folder3. The root folder has no users.",
  );
  check(
    "parses empty user_ids claim on root",
    empty.some((claim) => claim.node.toLowerCase() === "root"),
    JSON.stringify(empty),
  );
}

console.log("Two Sum samples stay clean");
{
  const issues = validateProblemConsistency(SAMPLE_PROBLEMS["two-sum"]);
  check("Two Sum has no consistency warnings", issues.length === 0, JSON.stringify(issues));
}

console.log("Hierarchical access mismatch");
{
  const problem = baseProblem({
    examples: [
      {
        input: 'commands = ["PermissionManager", "get_fewest"], arguments = [graph, ["A"]]',
        output: '["Folder1", "Folder3"]',
        explanation:
          "User A has direct access to Folder1 and Folder3. The root folder has no users, so the fewest covering folders are Folder1 and Folder3.",
      },
    ],
    exampleTests: [permissionTest(folders, [null, ["Folder1", "Folder3"]])],
  });

  const issues = validateProblemConsistency(problem);
  check(
    "detects User A on Root despite exclusive Folder1/Folder3 explanation",
    issues.some(
      (issue) =>
        issue.kind === "access-mismatch" && issue.message.includes("Root"),
    ),
    JSON.stringify(issues),
  );
  check(
    "detects Root should be empty",
    issues.some((issue) => issue.kind === "empty-node"),
    JSON.stringify(issues),
  );

  const repaired = applyLocalConsistencyRepairs(problem);
  const rootUsers = (
    repaired.problem.exampleTests[0]?.arguments?.[0]?.[0] as unknown[]
  )?.[1] as unknown[][];
  const rootRow = rootUsers?.find((row) => row[0] === "Root") as unknown[];
  check(
    "clears Root.user_ids during local repair",
    Array.isArray(rootRow?.[3]) && (rootRow[3] as unknown[]).length === 0,
    JSON.stringify(rootRow),
  );
  check(
    "keeps A on Folder1 and Folder3",
    rootUsers?.some(
      (row) => row[0] === "Folder1" && JSON.stringify(row[3]) === '["A"]',
    ) === true &&
      rootUsers?.some(
        (row) => row[0] === "Folder3" && JSON.stringify(row[3]) === '["A"]',
      ) === true,
    JSON.stringify(rootUsers),
  );
  check(
    "no leftover access issues after repair",
    repaired.issues.filter((issue) => issue.kind === "access-mismatch" || issue.kind === "empty-node")
      .length === 0,
    JSON.stringify(repaired.issues),
  );
  check(
    "records a repair note",
    repaired.notes.some((note) => note.includes("Root")),
    JSON.stringify(repaired.notes),
  );
}

console.log("Example output vs expected");
{
  const problem = baseProblem({
    examples: [
      {
        input: "nums = [2,7,11,15], target = 9",
        output: "[0,1]",
      },
    ],
    functionName: "twoSum",
    exampleTests: [{ args: [[2, 7, 11, 15], 9], expected: [1, 0] }],
  });
  const issues = validateProblemConsistency(problem);
  check(
    "flags written output that does not match test expected",
    issues.some((issue) => issue.kind === "example-output-mismatch"),
    JSON.stringify(issues),
  );
  const repaired = applyLocalConsistencyRepairs(problem);
  check(
    "rewrites expected to match the written example output",
    JSON.stringify(repaired.problem.exampleTests[0]?.expected) === "[0,1]",
    JSON.stringify(repaired.problem.exampleTests[0]?.expected),
  );
}

console.log("Expected not derivable from input");
{
  const isolatedFolders: unknown[][] = [
    ["Root", ["Folder1"], [], []],
    ["Folder1", [], [], ["A"]],
  ];
  const problem = baseProblem({
    exampleTests: [permissionTest(isolatedFolders, [null, ["MissingFolder"]])],
    hiddenTests: [permissionTest(isolatedFolders, [null, ["Folder2"]])],
  });
  const issues = validateProblemConsistency(problem);
  check(
    "flags expected node missing from the graph",
    issues.some(
      (issue) =>
        issue.kind === "expected-not-derivable" &&
        issue.message.includes("MissingFolder") &&
        !issue.hidden,
    ),
    JSON.stringify(issues),
  );
  check(
    "flags hidden expected the user cannot access",
    issues.some(
      (issue) =>
        issue.kind === "expected-not-derivable" &&
        issue.hidden === true &&
        issue.message.includes("Folder2"),
    ),
    JSON.stringify(issues),
  );
}

console.log("Hidden test expected vs simple covering");
{
  const dirtyFolders: unknown[][] = [
    ["Root", ["Folder1", "Folder3"], [], ["A"]],
    ["Folder1", [], [], ["A"]],
    ["Folder3", [], [], ["A"]],
  ];
  const problem = baseProblem({
    hiddenTests: [permissionTest(dirtyFolders, [null, ["Folder1", "Folder3"]])],
  });
  const issues = validateProblemConsistency(problem);
  check(
    "flags hidden expected that ignores extra Root access",
    issues.some(
      (issue) => issue.hidden === true && issue.kind === "expected-not-derivable",
    ),
    JSON.stringify(issues),
  );
}

console.log("finalizeGeneratedProblem");
void (async () => {
  const problem = baseProblem({
    examples: [
      {
        input: "graph, user A",
        output: '["Folder1", "Folder3"]',
        explanation: "User A has direct access to Folder1 and Folder3.",
      },
    ],
    exampleTests: [permissionTest(folders, [null, ["Folder1", "Folder3"]])],
  });
  const finalized = await finalizeGeneratedProblem(problem);
  check(
    "surfaces auto-correction notes and no remaining warnings",
    (finalized.generationNotes?.length ?? 0) > 0 && !finalized.warnings,
    JSON.stringify({
      notes: finalized.generationNotes,
      warnings: finalized.warnings,
    }),
  );

  if (failures > 0) {
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll consistency checks passed");
})();