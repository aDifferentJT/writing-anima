import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import {
  getSettings, saveSettings,
  type AppSettings, type Model, type EmbeddingConfig, type VectorDBConfig,
} from "../../services/settingsService";
import { refreshAllPages } from "../../services/desktopApi";

// ── templates ─────────────────────────────────────────────────────────────────

const MODEL_TEMPLATES: { label: string; value: Omit<Model, "id"> }[] = [
  {
    label: "OpenAI GPT-5",
    value: { name: "GPT-5", provider: "openai", model: "gpt-5", description: "OpenAI's most advanced model with superior reasoning", base_url: "https://api.openai.com/v1", api_key: null, temperature: 1.0, max_iterations: 20 },
  },
  {
    label: "OpenAI GPT-4o",
    value: { name: "GPT-4o", provider: "openai", model: "gpt-4o", description: "OpenAI GPT-4o", base_url: "https://api.openai.com/v1", api_key: null, temperature: 1.0, max_iterations: 20 },
  },
  {
    label: "OpenAI GPT-4o mini",
    value: { name: "GPT-4o mini", provider: "openai", model: "gpt-4o-mini", description: "OpenAI GPT-4o mini", base_url: "https://api.openai.com/v1", api_key: null, temperature: 1.0, max_iterations: 20 },
  },
  {
    label: "DeepSeek V3",
    value: { name: "DeepSeek V3", provider: "deepseek", model: "deepseek-chat", description: "DeepSeek's V3 model with strong reasoning and tool use", base_url: "https://api.deepseek.com", api_key: null, temperature: 1.0, max_iterations: 20 },
  },
  {
    label: "DeepSeek Reasoner",
    value: { name: "DeepSeek Reasoner", provider: "deepseek", model: "deepseek-reasoner", description: "DeepSeek Reasoner", base_url: "https://api.deepseek.com", api_key: null, temperature: 1.0, max_iterations: 20 },
  },
  {
    label: "DeepSeek V3.1 (Local / exo)",
    value: { name: "DeepSeek V3.1 (Local)", provider: "deepseek", model: "mlx-community/DeepSeek-V3.1-8bit", description: "DeepSeek V3.1 running locally via exo-labs cluster", base_url: "http://localhost:52415/v1", api_key: null, temperature: 1.0, max_iterations: 25 },
  },
  {
    label: "DeepSeek V3.2 (Local / exo)",
    value: { name: "DeepSeek V3.2 (Local)", provider: "deepseek", model: "mlx-community/DeepSeek-V3.2-8bit", description: "DeepSeek V3.2 running locally via exo-labs cluster", base_url: "http://localhost:52415/v1", api_key: null, temperature: 1.0, max_iterations: 25 },
  },
  {
    label: "DeepSeek V3.1 (OpenRouter)",
    value: { name: "DeepSeek V3.1 (OpenRouter)", provider: "deepseek", model: "deepseek/deepseek-chat-v3.1", description: "DeepSeek V3.1 via OpenRouter", base_url: "https://openrouter.ai/api/v1", api_key: null, temperature: 1.0, max_iterations: 25 },
  },
];

const EMBEDDING_TEMPLATES: { label: string; value: EmbeddingConfig }[] = [
  {
    label: "OpenAI text-embedding-3-small",
    value: { id: "openai-small", name: "OpenAI text-embedding-3-small", provider: "openai", api_key: null, model: "text-embedding-3-small", dimensions: 1536, batch_size: 100, max_length: 512 },
  },
  {
    label: "OpenAI text-embedding-3-large",
    value: { id: "openai-large", name: "OpenAI text-embedding-3-large", provider: "openai", api_key: null, model: "text-embedding-3-large", dimensions: 3072, batch_size: 100, max_length: 512 },
  },
  {
    label: "MLX Qwen3 Embedding 8B (local)",
    value: { id: "mlx", name: "MLX Qwen3 Embedding 8B (local)", provider: "mlx", api_key: null, model: "mlx-community/Qwen3-Embedding-8B-mxfp8", dimensions: 4096, batch_size: 100, max_length: 512 },
  },
];

const EMPTY_MODEL: Omit<Model, "id"> = {
  name: "", provider: "", model: "", description: "",
  base_url: "", api_key: null, temperature: 0.7, max_iterations: 10,
};

const EMPTY_EMBEDDING: EmbeddingConfig = {
  id: "", name: "", provider: "openai", api_key: null,
  model: "text-embedding-3-small", dimensions: 1536, batch_size: 100, max_length: 512,
};

// ── AddButton ─────────────────────────────────────────────────────────────────

type Template<T> = { label: string; value: T };

function AddButton<T>({ templates, onAdd }: { templates: Template<T>[]; onAdd: (value: T) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div className="flex w-full border border-dashed border-base-300 rounded-lg overflow-hidden">
        <button
          onClick={() => { onAdd({ ...(templates[0]?.value ?? {}) } as T); }}
          className="btn btn-ghost btn-sm flex-1 rounded-none"
        >
          <Plus size={14} /> Add from template
        </button>
        <button
          onClick={() => setOpen(o => !o)}
          className="btn btn-ghost btn-sm border-l border-dashed border-base-300 rounded-none px-2"
        >
          <ChevronDown size={14} />
        </button>
      </div>
      {open && (
        <div className="absolute bottom-full mb-1 left-0 w-full bg-base-100 border border-base-300 rounded-lg shadow-lg z-10 py-1">
          {templates.map(t => (
            <button
              key={t.label}
              className="w-full text-left px-3 py-2 text-sm hover:bg-base-200"
              onClick={() => { onAdd({ ...t.value }); setOpen(false); }}
            >
              {t.label}
            </button>
          ))}
          <div className="border-t border-base-300 my-1" />
          <button
            className="w-full text-left px-3 py-2 text-sm text-base-content/50 hover:bg-base-200"
            onClick={() => { onAdd(({} as unknown) as T); setOpen(false); }}
          >
            Blank
          </button>
        </div>
      )}
    </div>
  );
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-1">
      {label}
    </label>
    {children}
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-sm font-semibold text-base-content/60 uppercase tracking-wide mb-3">{children}</h2>
);

// ── VectorDB section ──────────────────────────────────────────────────────────

const VectorDBSection: React.FC<{
  config: VectorDBConfig;
  onChange: (config: VectorDBConfig) => void;
}> = ({ config, onChange }) => (
  <div className="card bg-base-100 border border-base-300 p-5 space-y-4">
    <SectionTitle>Vector Database</SectionTitle>
    <Field label="Type">
      <select
        className="select select-bordered select-sm w-full max-w-xs"
        value={config.type}
        onChange={e => onChange(e.target.value === "cloud" ? { type: "cloud", url: "", api_key: null } : { type: "local" })}
      >
        <option value="local">Local (Qdrant)</option>
        <option value="cloud">Cloud (Qdrant Cloud)</option>
      </select>
    </Field>
    {config.type === "cloud" && (
      <div className="grid grid-cols-2 gap-3">
        <Field label="URL">
          <input className="input input-bordered input-sm w-full" value={config.url}
            onChange={e => onChange({ ...config, url: e.target.value })}
            placeholder="https://xyz.qdrant.io" />
        </Field>
        <Field label="API Key">
          <input className="input input-bordered input-sm w-full font-mono" value={config.api_key ?? ""}
            onChange={e => onChange({ ...config, api_key: e.target.value || null })}
            type="password" autoComplete="off" placeholder="••••••••" />
        </Field>
      </div>
    )}
  </div>
);

// ── Advanced section ──────────────────────────────────────────────────────────

const AdvancedSection: React.FC<{
  settings: AppSettings;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}> = ({ settings, onChange }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="card bg-base-100 border border-base-300 p-5 space-y-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-sm font-semibold text-base-content/60 uppercase tracking-wide hover:text-base-content"
      >
        <span>Advanced</span>
        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-6 border-t border-base-300 pt-4">
          {/* Retrieval Settings */}
          <div>
            <SectionTitle>Retrieval</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Default K">
                <input
                  className="input input-bordered input-sm w-full"
                  type="number"
                  min="1"
                  value={settings.retrieval?.default_k ?? 80}
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    onChange('retrieval', { ...settings.retrieval, default_k: val });
                  }}
                />
              </Field>
              <Field label="Max K">
                <input
                  className="input input-bordered input-sm w-full"
                  type="number"
                  min="1"
                  value={settings.retrieval?.max_k ?? 120}
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    onChange('retrieval', { ...settings.retrieval, max_k: val });
                  }}
                />
              </Field>
            </div>
            <p className="text-xs text-base-content/50 mt-2">
              Number of retrieval results. Constraint: 1 ≤ default_k ≤ max_k
            </p>
          </div>

          {/* Agent Settings */}
          <div>
            <SectionTitle>Agent</SectionTitle>
            <div className="space-y-3">
              <Field label="Force Tool Use">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={settings.agent?.force_tool_use ?? true}
                    onChange={e => {
                      onChange('agent', { ...settings.agent, force_tool_use: e.target.checked });
                    }}
                  />
                  <span className="text-sm">Require the model to use tools when available</span>
                </label>
              </Field>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Embedding card ────────────────────────────────────────────────────────────

const EmbeddingCard: React.FC<{
  emb: EmbeddingConfig;
  index: number;
  onChange: (i: number, emb: EmbeddingConfig) => void;
  onRemove: (i: number) => void;
}> = ({ emb, index, onChange, onRemove }) => {
  const set = <K extends keyof EmbeddingConfig>(field: K, value: EmbeddingConfig[K]) =>
    onChange(index, { ...emb, [field]: value });

  return (
    <div className="card bg-base-100 border border-base-300 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">
          Embedding {index + 1}
        </span>
        <button onClick={() => onRemove(index)} className="btn btn-ghost btn-xs text-error">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ID">
          <input className="input input-bordered input-sm w-full font-mono" value={emb.id}
            onChange={e => set("id", e.target.value)} placeholder="openai-small" />
        </Field>
        <Field label="Name">
          <input className="input input-bordered input-sm w-full" value={emb.name}
            onChange={e => set("name", e.target.value)} placeholder="OpenAI Small" />
        </Field>
        <Field label="Provider">
          <select className="select select-bordered select-sm w-full" value={emb.provider}
            onChange={e => set("provider", e.target.value)}>
            <option value="openai">OpenAI</option>
            <option value="mlx">MLX (local)</option>
          </select>
        </Field>
        <Field label="Model">
          <input className="input input-bordered input-sm w-full font-mono" value={emb.model}
            onChange={e => set("model", e.target.value)} placeholder="text-embedding-3-small" />
        </Field>
        <Field label="Dimensions">
          <input className="input input-bordered input-sm w-full" type="number" value={emb.dimensions}
            onChange={e => set("dimensions", parseInt(e.target.value))} />
        </Field>
        <Field label="Batch Size">
          <input className="input input-bordered input-sm w-full" type="number" value={emb.batch_size}
            onChange={e => set("batch_size", parseInt(e.target.value))} />
        </Field>
        {emb.provider === "openai" && (
          <Field label="API Key">
            <input className="input input-bordered input-sm w-full font-mono" value={emb.api_key ?? ""}
              onChange={e => set("api_key", e.target.value || null)}
              type="password" autoComplete="off" placeholder="sk-..." />
          </Field>
        )}
      </div>
    </div>
  );
};

// ── Model card ────────────────────────────────────────────────────────────────

const ModelCard: React.FC<{
  model: Model;
  index: number;
  onChange: (i: number, m: Model) => void;
  onRemove: (i: number) => void;
}> = ({ model, index, onChange, onRemove }) => {
  const set = <K extends keyof Model>(field: K, value: Model[K]) =>
    onChange(index, { ...model, [field]: value });

  return (
    <div className="card bg-base-100 border border-base-300 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">
          Model {index + 1}
        </span>
        <button onClick={() => onRemove(index)} className="btn btn-ghost btn-xs text-error">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <input className="input input-bordered input-sm w-full" value={model.name}
            onChange={e => set("name", e.target.value)} placeholder="My Model" />
        </Field>
        <Field label="Provider">
          <select className="select select-bordered select-sm w-full" value={model.provider}
            onChange={e => set("provider", e.target.value)}>
            <option value="" disabled>Select provider</option>
            <option value="openai">OpenAI</option>
            <option value="deepseek">DeepSeek</option>
          </select>
        </Field>
        <Field label="Model ID">
          <input className="input input-bordered input-sm w-full font-mono" value={model.model}
            onChange={e => set("model", e.target.value)} placeholder="gpt-4o" />
        </Field>
        <Field label="Base URL">
          <input className="input input-bordered input-sm w-full" value={model.base_url}
            onChange={e => set("base_url", e.target.value)} placeholder="https://api.openai.com/v1" />
        </Field>
        <Field label="Description">
          <input className="input input-bordered input-sm w-full" value={model.description}
            onChange={e => set("description", e.target.value)} placeholder="Fast model for..." />
        </Field>
        <Field label="API Key">
          <input className="input input-bordered input-sm w-full font-mono" value={model.api_key ?? ""}
            onChange={e => set("api_key", e.target.value || null)}
            type="password" autoComplete="off" placeholder="sk-..." />
        </Field>
        <Field label="Temperature">
          <input className="input input-bordered input-sm w-full" type="number" step="0.1" min="0" max="2"
            value={model.temperature} onChange={e => set("temperature", parseFloat(e.target.value))} />
        </Field>
        <Field label="Max Iterations">
          <input className="input input-bordered input-sm w-full" type="number" min="1"
            value={model.max_iterations} onChange={e => set("max_iterations", parseInt(e.target.value))} />
        </Field>
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const Settings: React.FC = () => {
  const [s, setS] = useState<AppSettings>({ models: [], vector_db: { type: "local" }, embeddings: [], agent: { force_tool_use: true }, retrieval: { default_k: 80, max_k: 120 } });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(s => {
      // Set defaults if not present
      if (!s.agent) s.agent = { force_tool_use: true };
      if (!s.retrieval) s.retrieval = { default_k: 80, max_k: 120 };
      setS(s);
    }).catch(e => setError(e.message));
  }, []);

  const handleSave = async () => {
    setStatus("saving");
    setError(null);

    // Validate retrieval settings
    if (s.retrieval && s.retrieval.default_k > s.retrieval.max_k) {
      setError("default_k must be less than or equal to max_k");
      setStatus("error");
      return;
    }
    if (s.retrieval && s.retrieval.default_k < 1) {
      setError("default_k must be at least 1");
      setStatus("error");
      return;
    }
    if (s.retrieval && s.retrieval.max_k < 1) {
      setError("max_k must be at least 1");
      setStatus("error");
      return;
    }

    try {
      setS(await saveSettings(s));
      refreshAllPages();
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  return (
    <div className="h-full w-full bg-base-200 overflow-y-auto obsidian-scrollbar">
      <div className="px-6 py-6 max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-base-content">Settings</h1>
          <div className="flex items-center gap-3">
            {status === "saved" && <span className="text-xs text-success font-medium">Saved</span>}
            {status === "error" && <span className="text-xs text-error font-medium">Error</span>}
            <button onClick={handleSave} disabled={status === "saving"} className="btn btn-primary btn-sm">
              {status === "saving" ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {error && <div className="alert alert-error mb-4 text-sm">{error}</div>}

        <div className="space-y-6">
          {/* Models */}
          <div>
            <SectionTitle>LLM Models</SectionTitle>
            <div className="space-y-4">
              {s.models.map((m, i) => (
                <ModelCard key={m.id ?? i} model={m} index={i}
                  onChange={(idx, model) => setS(prev => ({ ...prev, models: prev.models.map((x, j) => j === idx ? model : x) }))}
                  onRemove={idx => setS(prev => ({ ...prev, models: prev.models.filter((_, j) => j !== idx) }))} />
              ))}
              <AddButton
                templates={MODEL_TEMPLATES}
                onAdd={m => setS(prev => ({ ...prev, models: [...prev.models, { ...EMPTY_MODEL, ...m }] }))}
              />
            </div>
          </div>

          {/* Embeddings */}
          <div>
            <SectionTitle>Embeddings</SectionTitle>
            <div className="space-y-4">
              {s.embeddings.map((emb, i) => (
                <EmbeddingCard key={i} emb={emb} index={i}
                  onChange={(idx, e) => setS(prev => ({ ...prev, embeddings: prev.embeddings.map((x, j) => j === idx ? e : x) }))}
                  onRemove={idx => setS(prev => ({ ...prev, embeddings: prev.embeddings.filter((_, j) => j !== idx) }))} />
              ))}
              <AddButton
                templates={EMBEDDING_TEMPLATES}
                onAdd={emb => setS(prev => ({ ...prev, embeddings: [...prev.embeddings, { ...EMPTY_EMBEDDING, ...emb }] }))}
              />
            </div>
          </div>

          {/* Vector DB */}
          <VectorDBSection config={s.vector_db} onChange={cfg => setS(prev => ({ ...prev, vector_db: cfg }))} />

          {/* Advanced Settings */}
          <AdvancedSection
            settings={s}
            onChange={(key, value) => setS(prev => ({ ...prev, [key]: value }))}
          />
        </div>
      </div>
    </div>
  );
};

export default Settings;
