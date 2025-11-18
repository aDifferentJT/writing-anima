// API boundary types — imported and re-exported so existing imports don't break.
// The source of truth is apiTypes.ts.
import type {
  ActionData,
  FeedbackPosition,
  CorpusSource,
  ReceivedFeedbackItem,
  EnrichedFeedbackItem,
  Project,
  Anima,
  ModelInfo,
  CorpusChunk,
  CorpusFile,
  StatusMessage,
  CompleteMessage,
  ChatMessage,
} from './apiTypes';

export type {
  ActionData,
  FeedbackPosition,
  CorpusSource,
  ReceivedFeedbackItem,
  EnrichedFeedbackItem,
  Project,
  Anima,
  ModelInfo,
  CorpusChunk,
  CorpusFile,
  StatusMessage,
  CompleteMessage,
  ChatMessage,
};

// ── Frontend-only types used across multiple files ────────────────────────────

export interface UserAgent {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  defaultTier: string;
  capabilities: string[];
  responseFormat: string;
  prompt: string;
  enabled: boolean;
  created: string;
  lastModified: string;
  usageCount: number;
  templateOrigin: string | null;
}

export interface AgentConfig {
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  defaultTier?: string;
  capabilities?: string[];
  responseFormat?: string;
  prompt?: string;
  enabled?: boolean;
  templateId?: string;
}

export interface SystemMetrics {
  orchestrator?: {
    successRate?: number;
    avgDecisionTime?: number;
    registeredAgents?: number;
  };
  progressiveEnhancement?: {
    enhancementSuccessRate?: number;
  };
}

export interface ThoughtStep {
  type: 'status' | 'search' | 'generate' | 'complete' | 'error';
  message: string;
  details: string | null;
  timestamp: string;
}
