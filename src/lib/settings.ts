import type { ProviderId, Settings } from "./types";

const KEY = "idecoder.settings.v1";

export const PROVIDER_DEFAULTS: Record<
  ProviderId,
  { label: string; model: string; hint: string }
> = {
  openai: {
    label: "OpenAI",
    model: "gpt-4o-mini",
    hint: "Uses your OpenAI API key. Default model: gpt-4o-mini.",
  },
  anthropic: {
    label: "Anthropic",
    model: "claude-sonnet-4-20250514",
    hint: "Uses your Anthropic API key.",
  },
  openrouter: {
    label: "OpenRouter",
    model: "openai/gpt-4o-mini",
    hint: "One key for many models. Default: openai/gpt-4o-mini.",
  },
};

export function defaultSettings(): Settings {
  return {
    provider: "openai",
    apiKey: "",
    model: PROVIDER_DEFAULTS.openai.model,
  };
}

export function loadSettings(): Settings {
  if (typeof window === "undefined") return defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings();
    return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
