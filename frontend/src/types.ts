export interface FeedbackPosition {
  start: number;
  end: number;
  text?: string;
}

export interface CorpusSource {
  text: string;
  source_file?: string;
  relevance?: string;
}

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

export interface FeedbackItem {
  id: string;
  type: string;
  severity: string;
  title: string;
  feedback: string;
  content?: string;
  message?: string;
  agent: string;
  personaName?: string;
  model?: string;
  category?: string;
  timestamp?: string;
  status: string;
  source?: string;
  suggestion?: string;
  quote?: string;
  retractedReason?: string;
  resolvedAt?: string;
  positions?: FeedbackPosition[];
  position?: FeedbackPosition;
  sources?: string[];
  corpus_sources?: CorpusSource[];
  actionData?: ActionData;
}

export interface Project {
  id: string;
  title: string;
  purpose: Purpose;
  content: string;
  feedback: FeedbackItem[];
  writingCriteria: WritingCriteria;
  settings?: Record<string, unknown>;
  isArchived?: boolean;
  createdAt?: string;
  lastAccessedAt?: string;
  updatedAt?: string;
}

export interface Purpose {
  topic: string;
  context: string;
}

export interface WritingCriteria {
  criteria: string[];
}

export interface Persona {
  id: string;
  name: string;
  description?: string;
  model?: string;
  chunk_count?: number;
  corpus_available?: boolean;
  created_at?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

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
  onFeedback?: (item: FeedbackItem) => void;
  onComplete?: (result: CompleteMessage) => void;
  onError?: (error: Error) => void;
}

export interface StreamAnalysisContext {
  purpose?: string | null;
  criteria?: string[];
  feedbackHistory?: FeedbackItem[];
  model?: string;
  maxFeedbackItems?: number;
}

export interface StatusMessage {
  type: 'status';
  message: string;
  tool?: string;
}

export interface CompleteMessage {
  total_items: number;
  processing_time?: number;
  partial?: boolean;
}

export interface ChatCallbacks {
  onToken?: (token: string) => void;
  onStatus?: (message: string) => void;
  onComplete?: (response: string) => void;
  onError?: (error: Error) => void;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface FeedbackHistoryRecord {
  id: string;
  agent: string;
  category?: string;
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

export interface CorpusFile {
  filename: string;
  file_path: string;
  chunk_count: number;
  chunks: CorpusChunk[];
}

export interface CorpusChunk {
  text: string;
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
