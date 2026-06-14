"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Settings, X, Key } from "lucide-react";

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)", ph: "sk-ant-..." },
  { id: "openai", label: "OpenAI (GPT-4o)", ph: "sk-..." },
  { id: "google", label: "Google (Gemini)", ph: "AIza..." },
];

export interface AISettingsData {
  provider: string;
  apiKey: string;
  model: string;
}

export function getAISettings(): AISettingsData {
  try {
    return { provider: "anthropic", apiKey: "", model: "", ...JSON.parse(localStorage.getItem("xeno.ai") || "{}") };
  } catch {
    return { provider: "anthropic", apiKey: "", model: "" };
  }
}

export function AISettingsPanel({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<AISettingsData>({ provider: "anthropic", apiKey: "", model: "" });
  const [saved, setSaved] = useState(false);
  // Render into <body> via a portal so the modal is positioned relative to the
  // viewport. Mounting it inside the sidebar (which uses `transition-transform`)
  // would re-base `position: fixed` to the transformed ancestor and pin the
  // modal to the left rail instead of centering it.
  const [mounted, setMounted] = useState(false);

  useEffect(() => setS(getAISettings()), []);
  useEffect(() => setMounted(true), []);

  const save = () => {
    localStorage.setItem("xeno.ai", JSON.stringify(s));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-foreground">AI Settings</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Provider</label>
            <select
              value={s.provider}
              onChange={(e) => setS({ ...s, provider: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground focus:outline-none focus:border-violet-500"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">API Key</label>
            <input
              type="password"
              placeholder={PROVIDERS.find((p) => p.id === s.provider)?.ph ?? "API Key"}
              value={s.apiKey}
              onChange={(e) => setS({ ...s, apiKey: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-violet-500"
            />
            <p className="text-xs text-muted-foreground mt-1">Sent per-request, never stored on server.</p>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Model override <span className="text-muted-foreground">(optional)</span></label>
            <input
              placeholder="e.g. gpt-4o-mini, gemini-1.5-flash"
              value={s.model}
              onChange={(e) => setS({ ...s, model: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-violet-500"
            />
          </div>

          <button
            onClick={save}
            className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
          >
            {saved ? "Saved!" : "Save Settings"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function AISettingsButton() {
  const [open, setOpen] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    setHasKey(!!getAISettings().apiKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="AI Settings"
        className={`p-2 rounded-lg transition-colors ${hasKey ? "text-violet-400 hover:bg-violet-900/20" : "text-muted-foreground hover:bg-muted"}`}
      >
        <Settings className="h-4 w-4" />
      </button>
      {open && <AISettingsPanel onClose={() => setOpen(false)} />}
    </>
  );
}
