// API boundary types — imported and re-exported so existing imports don't break.
// The source of truth is apiTypes.ts.
import type {
  ActionData,
  FeedbackPosition,
  CorpusSource,
  ReceivedFeedbackItem,
  EnrichedFeedbackItem,
  WritingCriteria,
  Purpose,
  Project,
  Persona,
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
  WritingCriteria,
  Purpose,
  Project,
  Persona,
  ModelInfo,
  CorpusChunk,
  CorpusFile,
  StatusMessage,
  CompleteMessage,
  ChatMessage,
};

// ── Frontend-only types ───────────────────────────────────────────────────────

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  defaultTier: string;
  capabilities: string[];
  responseFormat: string;
  basePrompt: string;
}

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

export interface AgentExport extends UserAgent {
  exportedAt: string;
  exportVersion: string;
}

export interface BulkAgentExport {
  agents: AgentExport[];
  exportedAt: string;
  exportVersion: string;
  totalAgents: number;
}

export interface ImportResults {
  imported: UserAgent[];
  skipped: UserAgent[];
  errors: { agentName: string; error: string }[];
}

export interface AgentStats {
  total: number;
  enabled: number;
  byCategory: Record<string, number>;
  totalUsage: number;
}

export interface StreamAnalysisCallbacks {
  onStatus?: (status: StatusMessage) => void;
  onFeedback?: (item: ReceivedFeedbackItem) => void;
  onComplete?: (result: CompleteMessage) => void;
  onError?: (error: Error) => void;
}

export interface StreamAnalysisContext {
  purpose?: string | null;
  criteria?: string[];
  feedbackHistory?: EnrichedFeedbackItem[];
  model?: string;
  maxFeedbackItems?: number;
}

export interface ChatCallbacks {
  onToken?: (token: string) => void;
  onStatus?: (message: string) => void;
  onComplete?: (response: string) => void;
  onError?: (error: Error) => void;
}

export interface FeedbackHistoryRecord {
  id: string;
  agent: string;
  category: string;
  title: string;
  feedback: string;
  quote?: string;
  timestamp: string;
  severity: string;
}

export interface FeedbackHistory {
  accepted: FeedbackHistoryRecord[];
  rejected: FeedbackHistoryRecord[];
}

export interface FeedbackStatistics {
  totalAccepted: number;
  totalRejected: number;
  categoryCounts: {
    accepted: Record<string, number>;
    rejected: Record<string, number>;
  };
  agentCounts: {
    accepted: Record<string, number>;
    rejected: Record<string, number>;
  };
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

export interface HighlightData {
  start: number;
  end: number;
  type: string;
  severity: string;
  id: string;
  positionIndex: number;
  isHovered: boolean;
  isCurrentPosition: boolean;
  text: string;
}

export interface UserPreferences {
  thoroughness: number;
  speedPriority: number;
  costSensitivity: number;
  preferredAgents: string[];
  blockedAgents: string[];
}

export interface UserFeedback {
  overallRating: number;
  speedSatisfaction: number;
  thoroughnessSatisfaction: number;
  mostHelpfulFeatures: string[];
  improvementSuggestions: string;
}

export interface ProgressData {
  type?: string;
  stage?: string;
  agentId?: string;
}

export interface AvailableAgent {
  id: string;
  name: string;
  description: string;
}
