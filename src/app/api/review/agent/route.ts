import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { createId } from "@/lib/id";
import {
  MISSING_KEY_MESSAGE,
  complete,
  extractJson,
  resolveAuth,
  type ChatTurn,
} from "@/lib/llm/server";
import { DEFAULT_PLANT_RATE, plantIssue } from "@/lib/review/mutations";
import { encodePlanted } from "@/lib/review/secret";
import type {
  PlantedCategory,
  ProposalEdit,
  ReviewTask,
  SeedFile,
} from "@/lib/review/types";

export const maxDuration = 60;

const SYSTEM = `You are the coding assistant embedded in an IDE. The user is working in the codebase below and can ask you anything about it.

Return ONLY valid JSON with this shape:
{
  "kind": "answer" | "proposal",
  "message": "markdown reply to the user",
  "edits": [{ "path": "server/routes.ts", "contents": "the complete new contents of that file" }]
}

Choose "answer" when the user is asking a question, wants an explanation, wants to talk through an approach, or is asking what you would do. Use an empty edits array.

Choose "proposal" when the user is asking you to write, change, or finish code. Then:
- Include one entry per file you are changing, with the COMPLETE file contents after your change. Never send a fragment, a diff, or a placeholder comment.
- Only touch files you actually need to change.
- Match the conventions already in the codebase exactly: the same error-handling shape, the same validation order, the same naming, the same import style, the same React state patterns.
- Handle the edge cases the surrounding handlers handle.
- Write your best correct code. Do not introduce bugs on purpose.
- In "message", describe what you changed and why, the way an assistant would. Keep it to a few sentences.

Never mention this JSON format, the practice exercise, planted bugs, or grading. You are just the assistant in the editor.`;

function filesBlock(files: SeedFile[]) {
  return files
    .map((file) => `--- ${file.path} ---\n${file.contents}`)
    .join("\n\n");
}

function isAllowedPath(path: string) {
  return (
    /^(client|server|shared)\/[A-Za-z0-9_\-/]+\.(ts|tsx)$/.test(path) &&
    !path.includes("..")
  );
}

export async function POST(req: Request) {
  const gate = await requireUser();
  if (gate.response) return gate.response;

  const auth = resolveAuth(req);
  if (!auth) {
    return NextResponse.json({ error: MISSING_KEY_MESSAGE }, { status: 401 });
  }

  const body = (await req.json()) as {
    task?: ReviewTask;
    files?: SeedFile[];
    history?: ChatTurn[];
    message?: string;
    plantRate?: number;
    avoidCategories?: PlantedCategory[];
  };

  const message = body.message?.trim();
  const files = body.files ?? [];
  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  if (!files.length) {
    return NextResponse.json({ error: "files required" }, { status: 400 });
  }

  const context = `The ticket the user is working on:
${body.task ? `${body.task.title}\n\n${body.task.body}` : "(not provided)"}

The current contents of every file in the workspace:

${filesBlock(files)}`;

  try {
    const text = await complete({
      auth,
      system: SYSTEM,
      messages: [
        { role: "user", content: context },
        {
          role: "assistant",
          content: JSON.stringify({
            kind: "answer",
            message: "Got it, I've read through the workspace. What do you need?",
            edits: [],
          }),
        },
        ...(body.history ?? []).slice(-8),
        { role: "user", content: message },
      ],
      temperature: 0.3,
      json: true,
    });

    const parsed = extractJson(text) as {
      kind?: string;
      message?: string;
      edits?: { path?: string; contents?: string }[];
    };

    const reply =
      typeof parsed.message === "string" && parsed.message.trim()
        ? parsed.message.trim()
        : "Here's what I'd do.";

    const rawEdits: ProposalEdit[] = (parsed.edits ?? [])
      .filter(
        (edit): edit is { path: string; contents: string } =>
          typeof edit?.path === "string" &&
          typeof edit?.contents === "string" &&
          isAllowedPath(edit.path),
      )
      .map((edit) => ({
        path: edit.path,
        before: files.find((f) => f.path === edit.path)?.contents ?? "",
        after: edit.contents,
      }))
      .filter((edit) => edit.before !== edit.after);

    if (parsed.kind !== "proposal" || rawEdits.length === 0) {
      return NextResponse.json({ kind: "answer", message: reply });
    }

    const rate =
      typeof body.plantRate === "number" && body.plantRate >= 0 && body.plantRate <= 1
        ? body.plantRate
        : DEFAULT_PLANT_RATE;
    const { edits, planted } = plantIssue(
      rawEdits,
      rate,
      (body.avoidCategories ?? []).slice(-2),
    );

    return NextResponse.json({
      kind: "proposal",
      message: reply,
      proposal: {
        id: createId(),
        summary: reply,
        edits,
        createdAt: Date.now(),
      },
      // Kept out of plain sight so a glance at the network tab does not spoil
      // the exercise. This is spoiler prevention, not security.
      planted: planted ? encodePlanted(planted) : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "The assistant failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
