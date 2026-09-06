import { NextResponse } from "next/server";
import {
  MISSING_KEY_MESSAGE,
  complete,
  extractJson,
  hasServerKey,
  resolveAuth,
} from "@/lib/llm/server";
import type { LanguageId, Problem } from "@/lib/types";

export const maxDuration = 60;

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
- For similar-mode requests: keep the same topics and skill, but change the story, function name, and examples. Do not clone the source title.`;

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
    return `Create a NEW LeetCode-style problem similar to this one, not a copy.

The new problem should train the same skills (${options.source.topics.join(", ") || "same topics"}) at about ${options.source.difficulty} difficulty, with a different story, title, and function name.

Source problem:
Title: ${options.source.title}
Difficulty: ${options.source.difficulty}
Topics: ${options.source.topics.join(", ")}
Description:
${options.source.description}

Examples:
${options.source.examples.map((ex, i) => `${i + 1}. Input: ${ex.input} → Output: ${ex.output}`).join("\n")}

Extra direction from the user (optional): ${options.prompt}`;
  }

  return `Create a LeetCode-style problem from this prompt. Format it exactly like a LeetCode statement (title, difficulty, topics, description, examples, constraints, follow-ups, starter code, tests):\n\n${options.prompt}`;
}

export async function GET() {
  return NextResponse.json({ configured: hasServerKey() });
}

export async function POST(req: Request) {
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
    const problem = normalizeProblem(extractJson(text));
    return NextResponse.json({ problem });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
