const API_URL: string = import.meta.env.VITE_API_URL || window.location.origin;

export interface Model {
  id?: string;
  name: string;
  provider: string;
  model: string;
  description: string;
  base_url: string;
  api_key: string | null;
  temperature: number;
  max_iterations: number;
}

export interface LocalQdrantConfig {
  type: "local";
}

export interface CloudQdrantConfig {
  type: "cloud";
  url: string;
  api_key: string | null;
}

export type VectorDBConfig = LocalQdrantConfig | CloudQdrantConfig;

export interface EmbeddingConfig {
  id: string;
  name: string;
  provider: string;
  api_key: string | null;
  model: string;
  dimensions: number;
  batch_size: number;
  max_length: number;
}

export interface AppSettings {
  models: Model[];
  vector_db: VectorDBConfig;
  embeddings: EmbeddingConfig[];
  preferred_model_id?: string;
}

export async function getSettings(): Promise<AppSettings> {
  const res = await fetch(`${API_URL}/api/settings`);
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json();
}

export async function saveSettings(data: Partial<AppSettings>): Promise<AppSettings> {
  const res = await fetch(`${API_URL}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}
