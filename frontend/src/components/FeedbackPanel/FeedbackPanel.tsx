import React from "react";
import { MessageSquare, Brain } from "lucide-react";
import CriticCard from "./CriticCard";
import "./FeedbackPanel.css";
import { EnrichedFeedbackItem, CorpusSource } from "../../types";

interface FeedbackPanelProps {
  feedback: EnrichedFeedbackItem[];
  isMonitoring: boolean;
  onFeedbackHover?: (id: string) => void;
  onFeedbackLeave?: () => void;
  hoveredFeedback?: string | null;
  onDismissSuggestion?: (id: string) => void;
  onMarkSuggestionResolved?: (id: string) => void;
  isEvaluating?: boolean;
  isAnalyzing?: boolean;
  onCreateComplex?: (question?: string, relevantText?: string) => void;
  onApplyInsight?: (suggestion?: string, complexId?: string, nodeId?: string) => void;
  onExploreFramework?: (framework?: string, keyAuthorities?: string[], suggestedResources?: string[]) => void;
  onJumpToText?: (id: string) => void;
  onViewCorpusSource?: (source: CorpusSource) => void;
  resolvedFeedback?: EnrichedFeedbackItem[];
  showResolved?: boolean;
  onToggleResolved?: () => void;
}

const FeedbackPanel: React.FC<FeedbackPanelProps> = ({
  feedback,
  isMonitoring,
  onDismissSuggestion,
  onMarkSuggestionResolved,
  isEvaluating,
  isAnalyzing,
  onCreateComplex,
  onApplyInsight,
  onExploreFramework,
  onJumpToText,
  onViewCorpusSource,
  resolvedFeedback = [],
  showResolved = false,
  onToggleResolved,
}) => {
  const displayFeedback = showResolved ? resolvedFeedback : feedback;

  return (
    <div className="obsidian-panel h-[calc(100vh-180px)] flex flex-col">
      <div className="h-[36px] px-3 border-b border-obsidian-border flex items-center">
        <h2 className="text-xs font-semibold text-obsidian-text-tertiary uppercase tracking-wide">
          {showResolved ? "Resolved" : "Criticism"}
        </h2>

        {!onToggleResolved && (
          <span className="ml-auto text-xs text-obsidian-text-muted mono">
            {feedback.length}
          </span>
        )}

        {/* Toggle button for resolved criticism */}
        {onToggleResolved && (
          <button
            onClick={onToggleResolved}
            className={`ml-auto text-xs px-2 py-0.5 rounded transition-colors ${
              showResolved
                ? "bg-green-100/50 text-green-700 hover:bg-green-100 border border-green-300"
                : "bg-obsidian-bg text-obsidian-text-muted hover:bg-obsidian-surface border border-obsidian-border mono"
            }`}
            title={
              showResolved ? "Show active criticism" : "Show resolved criticism"
            }
          >
            {showResolved
              ? `\u2190 ${feedback.length}`
              : `\u2713 ${resolvedFeedback.length}`}
          </button>
        )}

        {/* Analysis state indicator */}
        {!showResolved && isAnalyzing && (
          <div className="flex items-center gap-1 text-xs text-obsidian-accent-primary">
            <div className="flex gap-0.5">
              <div
                className="w-1 h-1 bg-obsidian-accent-primary rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              ></div>
              <div
                className="w-1 h-1 bg-obsidian-accent-primary rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              ></div>
              <div
                className="w-1 h-1 bg-obsidian-accent-primary rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              ></div>
            </div>
          </div>
        )}

        {/* Evaluation state indicator */}
        {!showResolved && isEvaluating && (
          <div className="flex items-center gap-1 text-xs text-obsidian-accent-primary">
            <Brain className="w-3 h-3 animate-pulse" />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 obsidian-scrollbar">
        {displayFeedback.length === 0 ? (
          <div className="text-center py-16 px-4">
            <MessageSquare className="w-8 h-8 text-obsidian-border mx-auto mb-2 opacity-40" />
            <p className="text-xs text-obsidian-text-muted">
              {showResolved
                ? "No resolved items"
                : isMonitoring
                  ? "No criticism yet"
                  : "Paused"}
            </p>
          </div>
        ) : (
          displayFeedback.map((item, index) => (
            <div
              key={item.id || `feedback-${index}`}
              className="feedback-card-enter"
              style={{
                animationDelay: `${Math.min(index * 100, 800)}ms`,
                opacity: 0,
              }}
            >
              <CriticCard
                feedback={item}
                onDismiss={onDismissSuggestion}
                onMarkResolved={onMarkSuggestionResolved}
                onCreateComplex={onCreateComplex}
                onApplyInsight={onApplyInsight}
                onExploreFramework={onExploreFramework}
                onJumpToText={onJumpToText}
                onViewCorpusSource={onViewCorpusSource}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default FeedbackPanel;
