import React from "react";
import { MessageSquare } from "lucide-react";
import CriticCard from "./CriticCard";
import "./FeedbackPanel.css";
import { EnrichedFeedbackItem, CorpusSource } from "../../types";

interface FeedbackPanelProps {
  feedback: EnrichedFeedbackItem[];
  resolvedFeedback: EnrichedFeedbackItem[];
  showResolved: boolean;
  onToggleResolved: () => void;
  onDismissSuggestion: (id: string) => void;
  onMarkSuggestionResolved: (id: string) => void;
  onJumpToReference: (text: string) => void;
  onViewCorpusSource: (source: CorpusSource) => void;
}

const FeedbackPanel: React.FC<FeedbackPanelProps> = ({
  feedback,
  resolvedFeedback,
  showResolved,
  onToggleResolved,
  onDismissSuggestion,
  onMarkSuggestionResolved,
  onJumpToReference,
  onViewCorpusSource,
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
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 obsidian-scrollbar">
        {displayFeedback.length === 0 ? (
          <div className="text-center py-16 px-4">
            <MessageSquare className="w-8 h-8 text-obsidian-border mx-auto mb-2 opacity-40" />
            <p className="text-xs text-obsidian-text-muted">
              {showResolved
                ? "No resolved items"
                : "No criticism yet"}
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
                onViewCorpusSource={onViewCorpusSource}
                onJumpToReference={onJumpToReference}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default FeedbackPanel;
