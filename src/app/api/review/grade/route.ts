import { NextResponse } from "next/server";
import { MISSING_KEY_MESSAGE, complete, extractJson, resolveAuth } from "@/lib/llm/server";
import type { ExplanationGrade, ReviewTask } from "@/lib/review/types";

export const maxDuration = 60;

const SYSTEM = `You are reviewing how well a candidate critiqued suggestions from an AI coding assistant during a technical interview.

For each item you are told: what the assistant proposed, whether a defect was deliberately planted in it and what that defect was, and the candidate's decision plus their written reason.

Return ONLY valid JSON with this shape:
{
  "items": [
    {
      "index": 0,
      "namedMechanism": "the specific flaw the candidate's reason actually points at, in your own words, or \"nothing specific\"",
      "caught": true,
      "clarity": 4,
      "referencedConvention": true,
      "checkedEdgeCases": false,
      "note": "one or two sentences of direct feedback"
    }
  ],
  "summary": "2-3 sentences on how the session went overall",
  "strengths": ["short, specific"],
  "improvements": ["short, specific, actionable"]
}

Scoring rules:
- Fill in "namedMechanism" first, before deciding "caught". Then compare it to the planted defect.
- "caught" is true only when "namedMechanism" is the same underlying flaw as the planted defect. Naming the right mechanism in different words counts. Generic unease ("looks a bit off", "I'd want to test this") does not.
- A confident, well-argued description of a DIFFERENT flaw is not caught. This is the case to be strictest about: if the planted defect is a wrong parameter source and the candidate instead talks about a missing not-found guard, or vice versa, "caught" is false no matter how fluent the reasoning is. Credit the reasoning quality in "clarity" and "note" instead, and say plainly in the note which defect they walked past.
- If no defect was planted, "caught" is true when the candidate correctly judged the suggestion sound. Rejecting a clean suggestion for a made-up reason is not caught. Rejecting it for a real, if minor, observation is.
- "clarity" is 0-5 for how precisely the explanation states the problem and its consequence.
- "referencedConvention" is true when they point at how the rest of the codebase already does this.
- "checkedEdgeCases" is true when they name a specific input or state that would break, such as an empty value or a missing id.
- "note" is addressed to the candidate as "you". Be direct and concrete. No praise padding.
- Feedback is about the reasoning, not about whether the final code compiles.`;

type GradeItem = {
  summary: string;
  plantedLabel: string | null;
  plantedExplanation: string | null;
  decision: string;
  explanation: string;
};

export async function POST(req: Request) {
  const auth = resolveAuth(req);
  if (!auth) {
    return NextResponse.json({ error: MISSING_KEY_MESSAGE }, { status: 401 });
  }

  const body = (await req.json()) as { task?: ReviewTask; items?: GradeItem[] };
  const items = body.items ?? [];
  if (!items.length) {
    return NextResponse.json({ error: "nothing to grade" }, { status: 400 });
  }

  const rendered = items
    .map((item, index) => {
      return `## Item ${index}
Assistant's description of its change:
${item.summary}

Planted defect: ${
        item.plantedLabel
          ? `${item.plantedLabel}\n${item.plantedExplanation ?? ""}`
          : "none, this suggestion was sound"
      }

Candidate's decision: ${item.decision}
Candidate's reason: ${item.explanation || "(left blank)"}`;
    })
    .join("\n\n");

  try {
    const text = await complete({
      auth,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Ticket the candidate was working on: ${body.task?.title ?? "(not provided)"}

${rendered}`,
        },
      ],
      temperature: 0.2,
      json: true,
    });

    const parsed = extractJson(text) as {
      items?: Partial<ExplanationGrade & { index: number }>[];
      summary?: string;
      strengths?: string[];
      improvements?: string[];
    };

    return NextResponse.json({
      items: (parsed.items ?? []).map((item) => ({
        index: typeof item.index === "number" ? item.index : 0,
        caught: Boolean(item.caught),
        clarity: Math.max(0, Math.min(5, Number(item.clarity) || 0)),
        referencedConvention: Boolean(item.referencedConvention),
        checkedEdgeCases: Boolean(item.checkedEdgeCases),
        note: typeof item.note === "string" ? item.note : "",
      })),
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
      improvements: Array.isArray(parsed.improvements)
        ? parsed.improvements.map(String)
        : [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Grading failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
