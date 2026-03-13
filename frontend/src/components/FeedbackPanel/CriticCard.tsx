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
  ArrowRight,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { FeedbackItem, CorpusSource } from "../../types";

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
  feedback: FeedbackItem | string;
  onDismiss?: (id: string) => void;
  onMarkResolved?: (id: string) => void;
  onCreateComplex?: (question?: string, relevantText?: string) => void;
  onApplyInsight?: (suggestion?: string, complexId?: string, nodeId?: string) => void;
  onExploreFramework?: (framework?: string, keyAuthorities?: string[], suggestedResources?: string[]) => void;
  onJumpToText?: (id: string) => void;
  onViewCorpusSource?: (source: CorpusSource) => void;
}

const CriticCard: React.FC<CriticCardProps> = ({
  feedback,
  onDismiss,
  onMarkResolved,
  onCreateComplex,
  onApplyInsight,
  onExploreFramework,
  onJumpToText,
  onViewCorpusSource,
}) => {
  // Handle cases where feedback might be malformed
  const feedbackData: FeedbackItem =
    typeof feedback === "string"
      ? {
          id: "",
          type: "unknown",
          severity: "low",
          title: "Raw Response",
          feedback: feedback,
          agent: "AI Critic",
          status: "active",
        }
      : feedback;

  // Debug: log what CriticCard receives
  console.log(
    "[CriticCard] id:",
    feedbackData.id,
    "title:",
    feedbackData.title?.substring(0, 30),
  );
  console.log("[CriticCard] model:", feedbackData.model);
  console.log("[CriticCard] sources:", feedbackData.sources);
  console.log("[CriticCard] corpus_sources:", feedbackData.corpus_sources);

  // Use personaName if available (from anima), otherwise fall back to agent
  const displayAgent =
    feedbackData.personaName || feedbackData.agent || "AI Critic";

  // Map feedback type to icon and color
  const getIconAndColor = (type: string, _severity: string): { Icon: React.ComponentType<{ className?: string }>; color: string } => {
    switch (type) {
      case "intellectual":
        return { Icon: Brain, color: "text-purple-600" };
      case "stylistic":
        return { Icon: Palette, color: "text-blue-600" };
      case "complex_suggestion":
        return { Icon: Target, color: "text-green-600" };
      case "complex_insight":
        return { Icon: Lightbulb, color: "text-yellow-600" };
      case "framework_connection":
        return { Icon: BookOpen, color: "text-indigo-600" };
      case "inquiry_integration":
        return { Icon: Target, color: "text-green-600" };
      default:
        return { Icon: AlertCircle, color: "text-gray-600" };
    }
  };

  const getSeverityColor = (severity: string, status: string, type: string): string => {
    if (status === "resolved") {
      return "bg-green-50/50 border-green-300";
    }
    if (status === "retracted" || status === "dismissed") {
      return "bg-obsidian-bg border-obsidian-border opacity-60";
    }

    // Special styling for inquiry integration types
    if (type === "complex_suggestion" || type === "inquiry_integration") {
      return "bg-green-50/50 border-green-300";
    }
    if (type === "complex_insight") {
      return "bg-yellow-50/50 border-yellow-300";
    }
    if (type === "framework_connection") {
      return "bg-obsidian-accent-pale border-obsidian-accent-light";
    }

    switch (severity) {
      case "high":
        return "bg-red-50/50 border-red-300";
      case "medium":
        return "bg-yellow-50/50 border-yellow-300";
      case "low":
        return "bg-blue-50/50 border-blue-300";
      default:
        return "bg-obsidian-surface border-obsidian-border";
    }
  };

  const getStatusIcon = (status: string): React.ReactNode => {
    switch (status) {
      case "resolved":
        return <Check className="w-4 h-4 text-green-600" />;
      case "retracted":
        return <Clock className="w-4 h-4 text-gray-500" />;
      case "dismissed":
        return <X className="w-4 h-4 text-gray-500" />;
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

  // Handle special inquiry integration actions
  const handleSpecialAction = (): void => {
    const actionData = feedbackData.actionData;
    if (!actionData) return;

    switch (actionData.type) {
      case "create_complex":
        onCreateComplex?.(actionData.question, actionData.relevantText);
        break;
      case "apply_insight":
        onApplyInsight?.(
          actionData.suggestion,
          actionData.complexId,
          actionData.nodeId,
        );
        break;
      case "explore_framework":
        onExploreFramework?.(
          actionData.framework,
          actionData.keyAuthorities,
          actionData.suggestedResources,
        );
        break;
      default:
        console.warn("Unknown action type:", actionData.type);
        break;
    }
  };

  return (
    <div
      className={`border rounded p-2.5 ${severityStyle} transition-all duration-150 hover:border-obsidian-border-focus group`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
        <span className="font-medium text-obsidian-text-primary text-xs truncate">
          {displayAgent}
        </span>

        {/* Model tag */}
        {feedbackData.model && (
          <span className="text-[10px] px-1.5 py-0.5 bg-obsidian-bg rounded border border-obsidian-border text-obsidian-text-muted font-mono">
            {feedbackData.model}
          </span>
        )}

        {statusIcon}

        <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Special action button for inquiry integration */}
          {feedbackData.actionData && feedbackData.actionData.type && (
            <button
              onClick={handleSpecialAction}
              className={`p-0.5 rounded transition-colors ${
                feedbackData.actionData.type === "create_complex"
                  ? "hover:bg-green-100"
                  : feedbackData.actionData.type === "apply_insight"
                    ? "hover:bg-yellow-100"
                    : "hover:bg-indigo-100"
              }`}
              title={
                feedbackData.actionData.type === "create_complex"
                  ? "Create Inquiry Complex"
                  : feedbackData.actionData.type === "apply_insight"
                    ? "Apply Insight"
                    : "Explore Framework"
              }
            >
              <ArrowRight
                className={`w-3 h-3 ${
                  feedbackData.actionData.type === "create_complex"
                    ? "text-green-600"
                    : feedbackData.actionData.type === "apply_insight"
                      ? "text-yellow-600"
                      : "text-indigo-600"
                }`}
              />
            </button>
          )}

          {(!feedbackData.status || feedbackData.status === "active") && (
            <>
              <button
                onClick={() =>
                  onMarkResolved && onMarkResolved(feedbackData.id)
                }
                className="p-0.5 hover:bg-green-100 rounded transition-colors"
                title="Mark as resolved"
              >
                <Check className="w-3 h-3 text-green-600" />
              </button>
              <button
                onClick={() => onDismiss && onDismiss(feedbackData.id)}
                className="p-0.5 hover:bg-red-100 rounded transition-colors"
                title="Dismiss"
              >
                <X className="w-3 h-3 text-red-600" />
              </button>
            </>
          )}
        </div>
      </div>

      {feedbackData.title && (
        <h4 className="font-semibold text-obsidian-text-primary text-sm mb-1.5 leading-tight">
          {feedbackData.title}
        </h4>
      )}

      {feedbackData.status === "retracted" && feedbackData.retractedReason && (
        <div className="mb-2 p-1.5 bg-obsidian-bg rounded text-xs text-obsidian-text-secondary border border-obsidian-border">
          <strong>Retracted:</strong> {feedbackData.retractedReason}
        </div>
      )}

      <div
        className={`text-xs leading-normal ${
          feedbackData.status === "retracted" ||
          feedbackData.status === "dismissed"
            ? "text-obsidian-text-muted"
            : "text-obsidian-text-secondary"
        }`}
      >
        {renderMarkdown(
          feedbackData.content || feedbackData.feedback || feedbackData.message,
        )}
      </div>

      {/* Show the problematic text snippet */}
      {feedbackData.positions &&
        feedbackData.positions.length > 0 &&
        feedbackData.positions[0].text && (
          <div
            className="mt-2 p-2 bg-obsidian-bg rounded border-l-2 border-obsidian-accent-light cursor-pointer hover:bg-obsidian-surface transition-colors"
            onClick={() => onJumpToText && onJumpToText(feedbackData.id)}
            title="Click to jump"
          >
            <div className="text-xs text-obsidian-text-muted mono mb-0.5">
              Referenced:
            </div>
            <div className="text-xs text-obsidian-text-primary italic leading-tight">
              &ldquo;
              {feedbackData.positions[0].text.length > 80
                ? feedbackData.positions[0].text.substring(0, 80) + "..."
                : feedbackData.positions[0].text}
              &rdquo;
            </div>
          </div>
        )}

      {/* Show corpus sources that ground this feedback */}
      {feedbackData.corpus_sources && feedbackData.corpus_sources.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          <div className="text-xs text-obsidian-text-muted mono flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            <span>Grounded in corpus:</span>
          </div>
          {feedbackData.corpus_sources.map((source, idx) => (
            <div
              key={idx}
              className={`p-2 bg-purple-50/50 rounded border border-purple-200 text-xs group/source ${
                onViewCorpusSource
                  ? "cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-colors"
                  : ""
              }`}
              onClick={() => onViewCorpusSource && onViewCorpusSource(source)}
            >
              <div className="text-obsidian-text-primary italic leading-tight mb-1">
                &ldquo;
                {source.text.length > 120
                  ? source.text.substring(0, 120) + "..."
                  : source.text}
                &rdquo;
              </div>
              <div className="flex items-center gap-2 text-obsidian-text-muted">
                {source.source_file && (
                  <span className="mono text-purple-600">
                    {source.source_file}
                  </span>
                )}
                {source.relevance && (
                  <span className="text-obsidian-text-tertiary flex-1 truncate">
                    {source.relevance}
                  </span>
                )}
                {onViewCorpusSource && (
                  <ExternalLink className="w-3 h-3 text-purple-400 opacity-0 group-hover/source:opacity-100 transition-opacity flex-shrink-0" />
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        feedbackData.sources &&
        feedbackData.sources.length > 0 && (
          /* Fallback: display old-format sources as simple list */
          <div className="mt-2 space-y-1">
            <div className="text-xs text-obsidian-text-muted mono flex items-center gap-1">
              <BookOpen className="w-3 h-3" />
              <span>Corpus references:</span>
            </div>
            <div className="p-2 bg-purple-50/50 rounded border border-purple-200 text-xs space-y-1">
              {feedbackData.sources.map((source, idx) => (
                <div
                  key={idx}
                  className="text-obsidian-text-primary leading-tight"
                >
                  <span className="text-purple-600 mr-1">{idx + 1}.</span>
                  {source}
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {feedbackData.suggestion && (
        <div
          className={`mt-2 p-2 bg-obsidian-surface rounded border-l-2 ${
            feedbackData.status === "resolved"
              ? "border-green-400"
              : feedbackData.type === "complex_suggestion"
                ? "border-green-400"
                : feedbackData.type === "complex_insight"
                  ? "border-yellow-400"
                  : feedbackData.type === "framework_connection"
                    ? "border-obsidian-accent-primary"
                    : "border-blue-400"
          } border border-obsidian-border`}
        >
          <p className="text-xs text-obsidian-text-secondary leading-tight">
            <strong className="text-obsidian-text-primary">Suggestion:</strong>{" "}
            {feedbackData.suggestion}
          </p>
        </div>
      )}

      {/* Special inquiry integration content */}
      {feedbackData.actionData && (
        <div className="mt-2 p-2 bg-obsidian-bg rounded text-xs border border-obsidian-border">
          {feedbackData.actionData.type === "create_complex" && (
            <div>
              <strong className="text-obsidian-text-primary">Q:</strong> &ldquo;
              {feedbackData.actionData.question}&rdquo;
              {feedbackData.actionData.relevantText && (
                <div className="mt-1 text-obsidian-text-tertiary">
                  <strong>Context:</strong>{" "}
                  {feedbackData.actionData.relevantText}
                </div>
              )}
            </div>
          )}

          {feedbackData.actionData.type === "explore_framework" &&
            feedbackData.actionData.keyAuthorities && (
              <div>
                <strong className="text-obsidian-text-primary">
                  Authorities:
                </strong>{" "}
                {feedbackData.actionData.keyAuthorities.join(", ")}
              </div>
            )}
        </div>
      )}
    </div>
  );
};

export default CriticCard;
