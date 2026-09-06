import type { ProviderId } from "@/lib/types";

export type LlmAuth = {
  key: string;
  provider: ProviderId;
  model?: string | null;
};

export function resolveAuth(req: Request): LlmAuth | null {
  const headerKey = req.headers.get("x-api-key")?.trim();
  const headerProvider = (req.headers.get("x-provider") || "").trim() as ProviderId;
  const headerModel = req.headers.get("x-model")?.trim();

  if (headerKey) {
    const provider: ProviderId =
      headerProvider === "anthropic" || headerProvider === "openrouter"
        ? headerProvider
        : "openai";
    return { key: headerKey, provider, model: headerModel };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      key: process.env.OPENAI_API_KEY,
      provider: "openai",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      key: process.env.ANTHROPIC_API_KEY,
      provider: "anthropic",
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
    };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return {
      key: process.env.OPENROUTER_API_KEY,
      provider: "openrouter",
      model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
    };
  }
  return null;
}

export function hasServerKey() {
  return Boolean(
    process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENROUTER_API_KEY,
  );
}

export const MISSING_KEY_MESSAGE =
  "Add an API key in Settings, or set OPENAI_API_KEY / ANTHROPIC_API_KEY / OPENROUTER_API_KEY in .env.local";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function complete(options: {
  auth: LlmAuth;
  system: string;
  messages: ChatTurn[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}): Promise<string> {
  const { auth } = options;
  const temperature = options.temperature ?? 0.4;
  const maxTokens = options.maxTokens ?? 4000;

  if (auth.provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": auth.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: auth.model || "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        temperature,
        system: options.system,
        messages: options.messages,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || "Anthropic request failed");
    }
    return (data.content ?? [])
      .map((part: { text?: string }) => part.text || "")
      .join("");
  }

  const url =
    auth.provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
  const model =
    auth.model || (auth.provider === "openrouter" ? "openai/gpt-4o-mini" : "gpt-4o-mini");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${auth.key}`,
      ...(auth.provider === "openrouter"
        ? { "HTTP-Referer": "http://localhost:3000", "X-Title": "idecoder" }
        : {}),
    },
    body: JSON.stringify({
      model,
      temperature,
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: options.system },
        ...options.messages,
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "LLM request failed");
  }
  return data.choices?.[0]?.message?.content || "";
}

export function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON");
  return JSON.parse(raw.slice(start, end + 1));
}
