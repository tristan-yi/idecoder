import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { complete, extractJson, resolveAuth } from "@/lib/llm/server";
import {
  normalizeSkin,
  pickDefaultSkin,
  pickTemplate,
  type Skin,
} from "@/lib/review/templates";

export const maxDuration = 60;

const SYSTEM = `You invent the domain for a small full-stack practice codebase.

You do NOT write code. You only return the vocabulary and the ticket copy that gets layered onto an existing hand-written skeleton.

Return ONLY valid JSON with this exact shape:
{
  "domainLabel": "short human name for the app, e.g. Warehouse inventory",
  "entity": "camelCase singular noun, e.g. part",
  "entityPlural": "camelCase plural, e.g. parts",
  "Entity": "PascalCase singular, e.g. Part",
  "EntityPlural": "PascalCase plural, e.g. Parts",
  "labelField": "camelCase field name for the main text field, e.g. name",
  "labelHuman": "how a person would say that field, e.g. part name",
  "reporter": "first name and role, e.g. Dana (Ops)",
  "channel": "a slack-style channel, e.g. #warehouse-tools",
  "ticket": "SHORT_123 style ticket id, letters digits and underscores only",
  "taskTitle": "the bug report or feature request headline",
  "taskBody": "2-3 short paragraphs in the voice of the reporter",
  "acceptanceHints": ["1-3 loose expectations, not a spec"],
  "openQuestions": ["3 genuine ambiguities the report leaves open"]
}

Rules:
- Pick an everyday product domain. Avoid todo lists, blogs and note apps unless asked.
- The identifiers must be plain ASCII words that are valid TypeScript identifiers. No reserved words.
- taskBody is written by a human who is annoyed, not by a spec author. It should describe symptoms, not the fix. Never name a file, a function or a line of code.
- openQuestions are things the report genuinely does not settle, and that change the implementation. They are not hints about where the bug is.
- acceptanceHints stay at the level of observable behaviour.`;

export async function POST(req: Request) {
  const gate = await requireUser();
  if (gate.response) return gate.response;

  const body = (await req.json().catch(() => ({}))) as { templateId?: string };
  const template = pickTemplate(body.templateId);
  const fallback = pickDefaultSkin(template);

  const auth = resolveAuth(req);
  let skin: Skin = fallback;

  if (auth) {
    try {
      const text = await complete({
        auth,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Invent the domain for this practice codebase.

The skeleton already has a working create flow and one broken feature. The broken feature is:
${template.brokenFeatureBrief}

The bug report you write must describe the user-visible symptoms of that broken feature, without naming the cause.

Avoid this domain, it was used recently: ${fallback.domainLabel}`,
          },
        ],
        temperature: 1,
        maxTokens: 1200,
        json: true,
      });
      skin = normalizeSkin(extractJson(text) as Partial<Skin>, fallback);
    } catch {
      // A model hiccup should not block a practice session.
      skin = fallback;
    }
  }

  const seed = template.render(skin);

  return NextResponse.json({
    seed: {
      ...seed,
      templateId: template.id,
      domainLabel: skin.domainLabel,
    },
  });
}
