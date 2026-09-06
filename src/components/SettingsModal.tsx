"use client";

import { useEffect, useState } from "react";
import type { Settings } from "@/lib/types";
import { loadSettings, saveSettings, PROVIDER_DEFAULTS } from "@/lib/settings";
import type { ProviderId } from "@/lib/types";

export function SettingsModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave?: (settings: Settings) => void;
}) {
  if (!open) return null;
  return <SettingsForm onClose={onClose} onSave={onSave} />;
}

function SettingsForm({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave?: (settings: Settings) => void;
}) {
  const [form, setForm] = useState<Settings>(loadSettings);
  const [serverConfigured, setServerConfigured] = useState(false);

  useEffect(() => {
    fetch("/api/generate")
      .then((r) => r.json())
      .then((d) => setServerConfigured(Boolean(d.configured)))
      .catch(() => setServerConfigured(false));
  }, []);

  const meta = PROVIDER_DEFAULTS[form.provider];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-panel p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-mute hover:bg-white/5 hover:text-white"
          >
            Close
          </button>
        </div>
        <p className="mb-4 text-sm leading-6 text-mute">
          Custom questions are turned into LeetCode-style pads with an LLM.
          Keys stay in this browser unless you put one in{" "}
          <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs">
            .env.local
          </code>
          .
        </p>
        {serverConfigured && (
          <p className="mb-4 rounded-lg border border-mint/30 bg-mint/10 px-3 py-2 text-sm text-mint">
            A server API key is already configured. The browser key is optional.
          </p>
        )}
        <label className="mb-3 block text-sm">
          <span className="mb-1.5 block text-mute">Provider</span>
          <select
            value={form.provider}
            onChange={(e) => {
              const provider = e.target.value as ProviderId;
              setForm({
                ...form,
                provider,
                model: PROVIDER_DEFAULTS[provider].model,
              });
            }}
            className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-mint/50"
          >
            {Object.entries(PROVIDER_DEFAULTS).map(([id, value]) => (
              <option key={id} value={id}>
                {value.label}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-3 block text-sm">
          <span className="mb-1.5 block text-mute">API key</span>
          <input
            type="password"
            autoComplete="off"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            placeholder="sk-..."
            className="w-full rounded-lg border border-line bg-ink px-3 py-2 font-mono text-sm outline-none focus:border-mint/50"
          />
        </label>
        <label className="mb-4 block text-sm">
          <span className="mb-1.5 block text-mute">Model</span>
          <input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            className="w-full rounded-lg border border-line bg-ink px-3 py-2 font-mono text-sm outline-none focus:border-mint/50"
          />
          <span className="mt-1.5 block text-xs text-mute">{meta.hint}</span>
        </label>
        <button
          type="button"
          onClick={() => {
            saveSettings(form);
            onSave?.(form);
            onClose();
          }}
          className="w-full rounded-lg bg-mint px-3 py-2 text-sm font-semibold text-ink hover:bg-mint/90"
        >
          Save
        </button>
      </div>
    </div>
  );
}
