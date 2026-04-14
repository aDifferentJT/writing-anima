/**
 * API boundary types — shapes of data that cross the HTTP/WebSocket boundary.
 *
 * These must be kept in sync with the Pydantic models in backend/src/api/models.py
 * and the SQLModel definitions in backend/src/database/general/__init__.py.
 *
 * Backend equivalents are noted inline for each type.
 */

// ── Feedback ─────────────────────────────────────────────────────────────────

/** Frontend-only: structured action a user can take based on a feedback item */
export interface ActionData {
  type: string;
  question?: string;
  relevantText?: string;
  suggestion?: string;
  complexId?: string;
  nodeId?: string;
  framework?: string;
  keyAuthorities?: string[];
  suggestedResources?: string[];
}

/** backend: TextPosition */
export interface FeedbackPosition {
  start: number;
  end: number;
  text: string;
}

/** backend: CorpusSource */
export interface CorpusSource {
  text: string;
  source_file?: string;
  relevance?: string;
}

/** backend: FeedbackItem — exactly what the backend sends over the wire */
export interface ReceivedFeedbackItem {
  id: string;
  type: string;
  severity: string;
  category: string;
  title: string;
  content: string;
  confidence: number;
  model: string;
  sources: string[];
  corpus_sources: CorpusSource[];
  positions: FeedbackPosition[];
}

/** Frontend enrichment of ReceivedFeedbackItem with UI state */
export interface EnrichedFeedbackItem extends ReceivedFeedbackItem {
  agent: string;
  animaName?: string;
  timestamp?: string;
  status: string;
  suggestion?: string;
  quote?: string;
  resolvedAt?: string;
}

// ── Projects ──────────────────────────────────────────────────────────────────

/** backend: ProjectSettings (JSON blob stored on Project.settings) */
export interface ProjectSettings {
  favourite_animas: string[];
  default_anima_id: string | null;
  default_model_id: string | null;
}

/** backend: Purpose (JSON blob stored on Project) */
export interface Purpose {
  topic: string;
  context: string;
}

/** backend: WritingCriteria (JSON blob stored on Project) */
export interface WritingCriteria {
  criteria: string[];
}

/** backend: Project (SQLModel in database/general/__init__.py) */
export interface Project {
  id: string;
  title: string;
  purpose: Purpose;
  content: string;
  feedback: EnrichedFeedbackItem[];
  writing_criteria: WritingCriteria;
  settings: ProjectSettings;
  is_archived: boolean;
  created_at: string;
  last_accessed_at: string;
  updated_at: string;
}

// ── Animas ────────────────────────────────────────────────────────────────────

/** backend: AnimaResponse (flat — Anima SQLModel fields + corpus_available) */
export interface Anima {
  id: string;
  name: string;
  description?: string;
  chunk_count: number;
  corpus_available: boolean;
  embedding_provider: string;
  created_at: string;
}

/** backend: EmbeddingProviderInfo */
export interface EmbeddingProviderInfo {
  id: string;
  name: string;
  provider: string;
}

/** backend: AvailableModel */
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
}

// ── Corpus ────────────────────────────────────────────────────────────────────

/** backend: CorpusChunk */
export interface CorpusChunk {
  text: string;
  chunk_index: number;
  char_length: number;
}

/** backend: CorpusFileModel */
export interface CorpusFile {
  filename: string;
  chunk_count: number;
  chunks: CorpusChunk[];
}

// ── Corpus upload messages ─────────────────────────────────────────────────────

export interface CorpusStatusMessage {
  type: 'status';
  steps_completed: string[];
  steps_remaining: string[];
  current_step: string;
  step_progress: number | null; // 0.0 – 1.0, or null if progress is unavailable
}

export interface CorpusCompleteMessage {
  type: 'complete';
  files_uploaded: number;
  total_size: number;
  message: string;
}

export interface CorpusErrorMessage {
  type: 'error';
  message: string;
}

export type CorpusUploadMessage = CorpusStatusMessage | CorpusCompleteMessage | CorpusErrorMessage;

// ── Streaming / WebSocket messages ────────────────────────────────────────────

/** backend: StreamStatus */
export interface StatusMessage {
  type: 'status';
  message: string;
  tool?: string;
  progress: number;
}

/** backend: StreamComplete */
export interface CompleteMessage {
  total_items: number;
  processing_time: number;
  /** Frontend-only: set to true when stream closes early without a complete message */
  partial?: boolean;
}

/** backend: ChatMessage */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
