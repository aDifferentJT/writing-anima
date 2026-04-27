import React from "react";
import {
  Brain,
  Palette,
  AlertCircle,
  X,
  Check,
  Clock,
  Target,
  Lightbulb,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { EnrichedFeedbackItem, CorpusSource, ModelInfo } from "../../types";

const getModelName = (modelId: string, availableModels: ModelInfo[]): string => {
  return availableModels.find(m => m.id === modelId)?.name ?? modelId;
};

/**
 * Simple markdown renderer for feedback text
 * Handles: **bold**, bullet lists (bullet), and line breaks
 */
const renderMarkdown = (text: string | undefined | null): React.ReactNode => {
  if (!text) return null;

  // Split into paragraphs (double newlines)
  const paragraphs = text.split("\n\n");

  return paragraphs.map((paragraph, pIndex) => {
    // Check if this is a bullet list paragraph
    const lines = paragraph.split("\n");
    const isList = lines.every(
      (line) => line.trim() === "" || line.trim().startsWith("\u2022"),
    );

    if (isList && lines.some((line) => line.trim().startsWith("\u2022"))) {
      // Render as bullet list
      return (
        <ul key={pIndex} className="list-disc list-inside space-y-1 my-2">
          {lines
            .filter((line) => line.trim().startsWith("\u2022"))
            .map((line, lIndex) => {
              const content = line.replace(/^\u2022\s*/, "");
              return <li key={lIndex}>{renderInlineMarkdown(content)}</li>;
            })}
        </ul>
      );
    } else {
      // Render as paragraph with inline markdown
      return (
        <p key={pIndex} className="mb-2 last:mb-0">
          {renderInlineMarkdown(paragraph)}
        </p>
      );
    }
  });
};

/**
 * Render inline markdown (bold, etc.)
 */
const renderInlineMarkdown = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  let currentIndex = 0;

  // Regular expression to find **bold** text
  const boldRegex = /\*\*([^*]+)\*\*/g;
  let match: RegExpExecArray | null;

  while ((match = boldRegex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > currentIndex) {
      parts.push(text.substring(currentIndex, match.index));
    }

    // Add the bold text
    parts.push(
      <strong key={match.index} className="font-semibold">
        {match[1]}
      </strong>,
    );

    currentIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (currentIndex < text.length) {
    parts.push(text.substring(currentIndex));
  }

  return parts.length > 0 ? parts : text;
};

interface CriticCardProps {
  feedback: EnrichedFeedbackItem | string;
  onDismiss: (id: string) => void;
  onMarkResolved: (id: string) => void;
  onJumpToReference: (text: string) => void;
  onViewCorpusSource: (source: CorpusSource) => void;
  availableModels: ModelInfo[];
}

const CriticCard: React.FC<CriticCardProps> = ({
  feedback,
  onDismiss,
  onMarkResolved,
  onJumpToReference,
  onViewCorpusSource,
  availableModels,
}) => {
  if (typeof feedback === "string") {
    return <div className="text-xs text-error p-2">Malformed feedback item received.</div>;
  }
  const feedbackData: EnrichedFeedbackItem = feedback;

  // Debug: log what CriticCard receives
  console.log(
    "[CriticCard] id:",
    feedbackData.id,
    "title:",
    feedbackData.title?.substring(0, 30),
  );
  console.log("[CriticCard] model:", feedbackData.model);
  console.log("[CriticCard] corpus_sources:", feedbackData.corpus_sources);

  // Use animaName if available (from anima), otherwise fall back to agent
  const displayAgent =
    feedbackData.animaName || feedbackData.agent || "AI Critic";

  // Map feedback type to icon and color
  const getIconAndColor = (type: string, _severity: string): { Icon: React.ComponentType<{ className?: string }>; color: string } => {
    switch (type) {
      case "intellectual":
        return { Icon: Brain, color: "text-secondary" };
      case "stylistic":
        return { Icon: Palette, color: "text-info" };
      case "complex_suggestion":
        return { Icon: Target, color: "text-success" };
      case "complex_insight":
        return { Icon: Lightbulb, color: "text-warning" };
      case "framework_connection":
        return { Icon: BookOpen, color: "text-primary" };
      case "inquiry_integration":
        return { Icon: Target, color: "text-success" };
      default:
        return { Icon: AlertCircle, color: "text-base-content/50" };
    }
  };

  const getSeverityColor = (severity: string, status: string, type: string): string => {
    if (status === "resolved") {
      return "bg-success/10 border-success/30";
    }
    if (status === "retracted" || status === "dismissed") {
      return "bg-base-200 border-base-300 opacity-60";
    }

    // Special styling for inquiry integration types
    if (type === "complex_suggestion" || type === "inquiry_integration") {
      return "bg-success/10 border-success/30";
    }
    if (type === "complex_insight") {
      return "bg-warning/10 border-warning/30";
    }
    if (type === "framework_connection") {
      return "bg-primary/10 border-primary/30";
    }

    switch (severity) {
      case "high":
        return "bg-error/10 border-error/30";
      case "medium":
        return "bg-warning/10 border-warning/30";
      case "low":
        return "bg-info/10 border-info/30";
      default:
        return "bg-base-100 border-base-300";
    }
  };

  const getStatusIcon = (status: string): React.ReactNode => {
    switch (status) {
      case "resolved":
        return <Check className="w-4 h-4 text-success" />;
      case "retracted":
        return <Clock className="w-4 h-4 text-base-content/40" />;
      case "dismissed":
        return <X className="w-4 h-4 text-base-content/40" />;
      default:
        return null;
    }
  };

  const { Icon, color } = getIconAndColor(
    feedbackData.type,
    feedbackData.severity,
  );
  const severityStyle = getSeverityColor(
    feedbackData.severity,
    feedbackData.status,
    feedbackData.type,
  );
  const statusIcon = getStatusIcon(feedbackData.status);

  return (
    <div
      className={`border rounded p-2.5 ${severityStyle} transition-all duration-150 hover:border-primary group`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
        <span className="font-medium text-base-content text-xs truncate">
          {displayAgent}
        </span>

        {/* Model tag */}
        {feedbackData.model && (
          <span className="text-[10px] px-1.5 py-0.5 bg-base-200 rounded border border-base-300 text-base-content/40 font-mono">
            {getModelName(feedbackData.model, availableModels)}
          </span>
        )}

        {statusIcon}

        <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
          {(!feedbackData.status || feedbackData.status === "active") && (
            <>
              <button
                onClick={() => onMarkResolved(feedbackData.id)}
                className="p-0.5 hover:bg-success/10 rounded transition-colors"
                title="Mark as resolved"
              >
                <Check className="w-3 h-3 text-success" />
              </button>
              <button
                onClick={() => onDismiss(feedbackData.id)}
                className="p-0.5 hover:bg-error/10 rounded transition-colors"
                title="Dismiss"
              >
                <X className="w-3 h-3 text-error" />
              </button>
            </>
          )}
        </div>
      </div>

      {feedbackData.title && (
        <h4 className="font-semibold text-base-content text-sm mb-1.5 leading-tight">
          {feedbackData.title}
        </h4>
      )}

      <div
        className={`text-xs leading-normal ${
          feedbackData.status === "retracted" ||
          feedbackData.status === "dismissed"
            ? "text-base-content/40"
            : "text-base-content/70"
        }`}
      >
        {renderMarkdown(
          feedbackData.content,
        )}
      </div>

      {/* Show the problematic text snippet */}
      {feedbackData.positions &&
        feedbackData.positions.length > 0 &&
        feedbackData.positions[0].text && (
          <div
            className="mt-2 p-2 bg-base-200 rounded border-l-2 border-primary/40 cursor-pointer hover:bg-base-100 transition-colors"
            onClick={() => onJumpToReference(feedbackData.positions[0].text)}
            title="Click to jump to reference in editor"
          >
            <div className="text-xs text-base-content/40 mono mb-0.5">
              Referenced:
            </div>
            <div className="text-xs text-base-content italic leading-tight">
              &ldquo;
              {feedbackData.positions[0].text.length > 80
                ? feedbackData.positions[0].text.substring(0, 80) + "..."
                : feedbackData.positions[0].text}
              &rdquo;
            </div>
          </div>
        )}

      {/* Show corpus sources that ground this feedback */}
      {feedbackData.corpus_sources && feedbackData.corpus_sources.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <div className="text-xs text-base-content/40 mono flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            <span>Grounded in corpus:</span>
          </div>
          {feedbackData.corpus_sources.map((source, idx) => (
            <div
              key={idx}
              className="p-2 bg-primary/10 rounded border border-primary/20 text-xs group/source cursor-pointer hover:border-primary/40 hover:bg-primary/15 transition-colors"
              onClick={() => onViewCorpusSource(source)}
            >
              <div className="text-base-content italic leading-tight mb-1">
                &ldquo;
                {source.text.length > 120
                  ? source.text.substring(0, 120) + "..."
                  : source.text}
                &rdquo;
              </div>
              <div className="flex items-center gap-2 text-base-content/40">
                {source.source_file && (
                  <span className="mono text-primary">
                    {source.source_file}
                  </span>
                )}
                {source.relevance && (
                  <span className="text-base-content/50 flex-1 truncate">
                    {source.relevance}
                  </span>
                )}
                <ExternalLink className="w-3 h-3 text-primary/70 opacity-0 group-hover/source:opacity-100 transition-opacity flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>
      )}

      {feedbackData.suggestion && (
        <div
          className={`mt-2 p-2 bg-base-100 rounded border-l-2 ${
            feedbackData.status === "resolved"
              ? "border-green-400"
              : feedbackData.type === "complex_suggestion"
                ? "border-green-400"
                : feedbackData.type === "complex_insight"
                  ? "border-yellow-400"
                  : feedbackData.type === "framework_connection"
                    ? "border-primary"
                    : "border-blue-400"
          } border border-base-300`}
        >
          <p className="text-xs text-base-content/70 leading-tight">
            <strong className="text-base-content">Suggestion:</strong>{" "}
            {feedbackData.suggestion}
          </p>
        </div>
      )}
    </div>
  );
};

export default CriticCard;
