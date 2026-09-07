import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import {
  MISSING_KEY_MESSAGE,
  complete,
  extractJson,
  hasServerKey,
  resolveAuth,
  type LlmAuth,
} from "@/lib/llm/server";
import {
  finalizeGeneratedProblem,
  stripGenerationMeta,
  type ConsistencyIssue,
} from "@/lib/problem-consistency";
import type { LanguageId, Problem } from "@/lib/types";

export const maxDuration = 90;

const SYSTEM = `You turn a user's coding question, interview prompt, or rough idea into a LeetCode-style problem.

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "title": "string",
  "difficulty": "Easy" | "Medium" | "Hard",
  "topics": ["string"],
  "functionName": "camelCaseName",
  "description": "markdown problem statement, LeetCode tone. Do not repeat examples or constraints here.",
  "examples": [{ "input": "readable input", "output": "readable output", "explanation": "optional" }],
  "constraints": ["string"],
  "followUps": ["short follow-up questions, LeetCode style"],
  "starterCode": {
    "javascript": "function fn(...) {\\n    \\n}",
    "typescript": "function fn(...): T {\\n    \\n}",
    "python": "class Solution:\\n    def fn(self, ...):\\n        ",
    "java": "class Solution {\\n    public ... fn(...) {\\n        \\n    }\\n}",
    "cpp": "class Solution {\\npublic:\\n    ... fn(...) {\\n        \\n    }\\n};"
  },
  "exampleTests": [{ "args": [ ...positional args as JSON... ], "expected": ... }],
  "hiddenTests": [{ "args": [...], "expected": ... }]
}

Rules:
- If the user pasted a complete problem, preserve its meaning and layout it as LeetCode would. If they pasted a vague idea, invent a crisp, original LeetCode-quality problem.
- Write the description the way LeetCode does: short paragraphs, bold the required return value, backticks for variables.
- Include 2–4 examples with realistic I/O. The first example should have an explanation.
- Starter code must parse and contain the function or Solution method named functionName, with an empty body. Do not include the solution.
- exampleTests must match the written examples. Include 2–4 exampleTests and 3–6 hiddenTests.
- args is an array of positional arguments to the function. expected is the return value. Use JSON types only.
- Include 1–3 followUps.
- For similar-mode requests: keep the same topics and skill, but change the story, function name, and examples. Do not clone the source title.
- CLASS / DESIGN problems (LRU Cache, MinStack, PermissionManager, Document with apply, etc.):
  functionName MUST be the class name in PascalCase.
  Python starter is \`class ClassName:\` with \`__init__\` and methods — not \`class Solution\`. JS/TS starter is \`class ClassName { ... }\`.
  Tests MUST use the CoderPad/LeetCode command format, one sequence per example. Prefer:
    "args": [["ClassName", "methodA", "methodB"], [[constructorArgs...], [methodA args...], [methodB args...]]],
    "expected": [null, resultA, resultB]
  Equivalent shape also allowed:
    "commands": ["ClassName", "get_fewest"],
    "arguments": [[[teams, folders, files]], ["A"]],
    "expected": [null, ["Folder1", "Folder3"]]
  The first command is always the constructor; its expected value is always null (constructors return the object, the harness records null).
  Constructor argv[0] must be the constructor's positional args only, matching __init__/constructor parameters exactly. Do not wrap those args in an extra list, and do not append leftover method inputs such as user_id to the constructor step.
  Do NOT emit tests that only call the constructor with args [] and expected null.
  If a class has one query method, a flat case like args [constructor..., queryArg] with expected = the query return is also valid; the harness will construct then call the query method. Never expect the constructed object itself.
  Examples should show the same command list in Input and the result list in Output.
- CONSISTENCY: examples[i].input, examples[i].explanation, and exampleTests[i].args must describe the SAME data. expected must be the result of the stated algorithm on that test's own args — never copy an explanation's answer onto a different graph.
- Hierarchical permission / folder / team trees: each node's user_ids in the constructor arrays must match the explanation's direct-access claims exactly. If the explanation says User A has direct access to Folder1 and Folder3, those nodes contain "A" and ancestor/root/parent nodes have []. Do not put leftover users on Root just because they appear elsewhere.`;

function isLanguageId(value: string): value is LanguageId {
  return ["javascript", "typescript", "python", "java", "cpp"].includes(value);
}

function normalizeProblem(raw: Record<string, unknown>): Problem {
  const starterRaw = (raw.starterCode ?? {}) as Record<string, string>;
  const starterCode: Problem["starterCode"] = {};
  for (const [key, value] of Object.entries(starterRaw)) {
    if (isLanguageId(key) && typeof value === "string") {
      starterCode[key] = value;
    }
  }

  const problem: Problem = {
    title: String(raw.title || "Untitled problem"),
    difficulty:
      raw.difficulty === "Medium" || raw.difficulty === "Hard"
        ? raw.difficulty
        : "Easy",
    topics: Array.isArray(raw.topics) ? raw.topics.map(String) : [],
    description: String(raw.description || ""),
    examples: Array.isArray(raw.examples)
      ? raw.examples.map((ex) => {
          const e = ex as Record<string, unknown>;
          return {
            input: String(e.input ?? ""),
            output: String(e.output ?? ""),
            explanation: e.explanation ? String(e.explanation) : undefined,
          };
        })
      : [],
    constraints: Array.isArray(raw.constraints)
      ? raw.constraints.map(String)
      : [],
    followUps: Array.isArray(raw.followUps) ? raw.followUps.map(String) : [],
    functionName: String(raw.functionName || "solve"),
    starterCode,
    exampleTests: Array.isArray(raw.exampleTests)
      ? (raw.exampleTests as Problem["exampleTests"])
      : [],
    hiddenTests: Array.isArray(raw.hiddenTests)
      ? (raw.hiddenTests as Problem["hiddenTests"])
      : [],
  };

  if (!problem.starterCode.javascript && !problem.starterCode.python) {
    throw new Error("Generated problem is missing starter code");
  }
  return problem;
}

function buildUserMessage(options: {
  prompt: string;
  mode?: "create" | "similar";
  source?: Problem;
}) {
  if (options.mode === "similar" && options.source) {
    const source = stripGenerationMeta(options.source);
    return `Create a NEW LeetCode-style problem similar to this one, not a copy.

The new problem should train the same skills (${source.topics.join(", ") || "same topics"}) at about ${source.difficulty} difficulty, with a different story, title, and function name.

Source problem:
Title: ${source.title}
Difficulty: ${source.difficulty}
Topics: ${source.topics.join(", ")}
Description:
${source.description}

Examples:
${source.examples.map((ex, i) => `${i + 1}. Input: ${ex.input} → Output: ${ex.output}`).join("\n")}

Extra direction from the user (optional): ${options.prompt}`;
  }

  return `Create a LeetCode-style problem from this prompt. Format it exactly like a LeetCode statement (title, difficulty, topics, description, examples, constraints, follow-ups, starter code, tests):\n\n${options.prompt}`;
}

async function repairInconsistentProblem(
  auth: LlmAuth,
  problem: Problem,
  issues: ConsistencyIssue[],
): Promise<Problem | null> {
  const text = await complete({
    auth,
    system: `${SYSTEM}

You are correcting a previously generated problem. Return ONLY the full problem JSON. Prefer keeping the written examples and explanations; fix exampleTests and hiddenTests (especially each node's user_ids) so the raw input matches the story. expected must be derivable from that test's own args.`,
    messages: [
      {
        role: "user",
        content: `Fix these consistency errors:

${issues.map((issue) => `- ${issue.message}`).join("\n")}

Current problem JSON:
${JSON.stringify(stripGenerationMeta(problem))}`,
      },
    ],
    temperature: 0.15,
    json: true,
  });
  return normalizeProblem(extractJson(text));
}

export async function GET() {
  return NextResponse.json({ configured: hasServerKey() });
}

export async function POST(req: Request) {
  const gate = await requireUser();
  if (gate.response) return gate.response;

  const auth = resolveAuth(req);
  if (!auth) {
    return NextResponse.json({ error: MISSING_KEY_MESSAGE }, { status: 401 });
  }

  const body = (await req.json()) as {
    prompt?: string;
    mode?: "create" | "similar";
    source?: Problem;
  };
  const prompt = body.prompt?.trim() || (body.mode === "similar" ? "similar problem" : "");
  if (!prompt) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  try {
    const text = await complete({
      auth,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: buildUserMessage({
            prompt,
            mode: body.mode,
            source: body.source,
          }),
        },
      ],
      temperature: body.mode === "similar" ? 0.85 : 0.35,
      json: true,
    });
    const draft = normalizeProblem(extractJson(text));
    const problem = await finalizeGeneratedProblem(draft, (current, issues) =>
      repairInconsistentProblem(auth, current, issues),
    );
    return NextResponse.json({ problem });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
