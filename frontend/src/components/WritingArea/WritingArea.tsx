import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { FileEdit } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';
import { FeedbackItem, FeedbackPosition, HighlightData } from '../../types';

interface WritingAreaProps {
  content: string;
  onContentChange: (value: string) => void;
  autoFocus?: boolean;
  feedback?: FeedbackItem[];
  hoveredFeedback?: string | null;
}

const WritingArea: React.FC<WritingAreaProps> = ({ content, onContentChange, autoFocus = false, feedback = [], hoveredFeedback = null }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightOverlayRef = useRef<HTMLDivElement>(null);
  const [currentPositionIndex, setCurrentPositionIndex] = useState<number>(0);
  const cycleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Memoize highlights to prevent recalculation on every render
  const highlights: HighlightData[] = useMemo(() => {
    if (!content || feedback.length === 0) {
      return [];
    }

    const result: HighlightData[] = [];

    // Collect all feedback positions (supporting both single and multi-position formats)
    feedback.forEach((item: FeedbackItem) => {
      const positions: FeedbackPosition[] = item.positions || (item.position ? [item.position] : []);

      positions.forEach((position: FeedbackPosition, positionIndex: number) => {
        if (position.start !== undefined && position.end !== undefined) {
          const start = Math.max(0, Math.min(position.start, content.length));
          const end = Math.max(start, Math.min(position.end, content.length));

          if (start < end) {
            // Verify the position matches the expected text (for accuracy)
            const actualText = content.substring(start, end);
            const expectedText = position.text;

            // If we have expected text and it doesn't match, try to find the correct position
            let adjustedStart = start;
            let adjustedEnd = end;

            if (expectedText && actualText !== expectedText) {
              // Try to find the expected text near the suggested position
              const searchRadius = 100; // Look within 100 characters
              const searchStart = Math.max(0, start - searchRadius);
              const searchEnd = Math.min(content.length, end + searchRadius);
              const searchArea = content.substring(searchStart, searchEnd);

              const foundIndex = searchArea.indexOf(expectedText);
              if (foundIndex !== -1) {
                adjustedStart = searchStart + foundIndex;
                adjustedEnd = adjustedStart + expectedText.length;
              }
            }

            // Check for overlaps with existing highlights
            const hasOverlap = result.some(existing =>
              (adjustedStart >= existing.start && adjustedStart < existing.end) ||
              (adjustedEnd > existing.start && adjustedEnd <= existing.end) ||
              (adjustedStart < existing.start && adjustedEnd > existing.end)
            );

            if (!hasOverlap) {
              result.push({
                start: adjustedStart,
                end: adjustedEnd,
                type: item.type,
                severity: item.severity,
                id: item.id,
                positionIndex,
                isHovered: hoveredFeedback === item.id,
                isCurrentPosition: hoveredFeedback === item.id && currentPositionIndex === positionIndex,
                text: content.slice(adjustedStart, adjustedEnd)
              });
            }
          }
        }
      });
    });

    return result.sort((a: HighlightData, b: HighlightData) => a.start - b.start);
  }, [content, feedback, hoveredFeedback, currentPositionIndex]);

  // Get textarea reference after MDEditor mounts
  useEffect(() => {
    if (editorRef.current) {
      const textarea = editorRef.current.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement | null;
      if (textarea) {
        textareaRef.current = textarea;
      }
    }
  }, []);

  // Sync overlay scroll with textarea scroll
  useEffect(() => {
    const textarea = textareaRef.current;
    const overlay = highlightOverlayRef.current;

    if (!textarea || !overlay) return;

    const handleScroll = () => {
      overlay.scrollTop = textarea.scrollTop;
      overlay.scrollLeft = textarea.scrollLeft;
    };

    textarea.addEventListener('scroll', handleScroll);
    return () => textarea.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll to highlighted feedback when hovered
  useEffect(() => {
    if (cycleIntervalRef.current) {
      clearInterval(cycleIntervalRef.current);
      cycleIntervalRef.current = null;
    }

    if (hoveredFeedback && textareaRef.current) {
      const hoveredFeedbackData = feedback.find((f: FeedbackItem) => f.id === hoveredFeedback);
      if (hoveredFeedbackData) {
        let positions: FeedbackPosition[] | undefined;
        if (hoveredFeedbackData.positions && hoveredFeedbackData.positions.length > 0) {
          positions = hoveredFeedbackData.positions;
        } else if (hoveredFeedbackData.position) {
          positions = [hoveredFeedbackData.position];
        }

        if (positions && positions.length > 0) {
          setCurrentPositionIndex(0);

          const scrollToPosition = (positionIndex: number) => {
            const targetPosition = positions![positionIndex];
            if (targetPosition && textareaRef.current) {
              // Calculate approximate line to scroll to
              const textBeforeHighlight = content.substring(0, targetPosition.start);
              const lines = textBeforeHighlight.split('\n');
              const lineNumber = lines.length;
              const lineHeight = 24; // Approximate line height
              const scrollPosition = (lineNumber - 1) * lineHeight;

              textareaRef.current.scrollTop = Math.max(0, scrollPosition - 100);
            }
          };

          scrollToPosition(0);

          if (positions.length > 1) {
            let currentIndex = 0;
            cycleIntervalRef.current = setInterval(() => {
              currentIndex = (currentIndex + 1) % positions!.length;
              setCurrentPositionIndex(currentIndex);
              scrollToPosition(currentIndex);
            }, 2000);
          }
        }
      }
    } else {
      setCurrentPositionIndex(0);
    }

    return () => {
      if (cycleIntervalRef.current) {
        clearInterval(cycleIntervalRef.current);
        cycleIntervalRef.current = null;
      }
    };
  }, [hoveredFeedback, feedback, content]);

  useEffect(() => {
    if (autoFocus && editorRef.current) {
      const textarea = editorRef.current.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement | null;
      if (textarea) {
        textarea.focus();
      }
    }
  }, [autoFocus]);

  // Render highlight overlays based on character positions
  const renderHighlightOverlays = useCallback((): React.ReactNode => {
    if (!content || highlights.length === 0) return null;

    const lines = content.split('\n');
    const elements: React.ReactElement[] = [];

    highlights.forEach((highlight: HighlightData, idx: number) => {
      // Calculate line and column positions
      let currentPos = 0;
      let startLine = 0;
      let startCol = 0;
      let endLine = 0;
      let endCol = 0;

      // Find start position
      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length + 1; // +1 for newline
        if (currentPos + lineLength > highlight.start) {
          startLine = i;
          startCol = highlight.start - currentPos;
          break;
        }
        currentPos += lineLength;
      }

      // Find end position
      currentPos = 0;
      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length + 1;
        if (currentPos + lineLength >= highlight.end) {
          endLine = i;
          endCol = highlight.end - currentPos;
          break;
        }
        currentPos += lineLength;
      }

      // Create highlight spans for each line the highlight covers
      for (let line = startLine; line <= endLine; line++) {
        const lineText = lines[line];
        const colStart = line === startLine ? startCol : 0;
        const colEnd = line === endLine ? endCol : lineText.length;
        const highlightText = lineText.substring(colStart, colEnd);

        if (highlightText.length > 0) {
          const width = highlightText.length * 8.4; // Approximate character width
          elements.push(
            <div
              key={`${highlight.id}-${highlight.positionIndex}-${line}`}
              className={getHighlightClass(highlight.type, highlight.severity, highlight.isHovered, highlight.isCurrentPosition)}
              data-feedback-id={highlight.id}
              data-position-index={highlight.positionIndex}
              style={{
                position: 'absolute',
                top: `${line * 24}px`,
                left: `${colStart * 8.4}px`,
                width: `${width}px`,
                height: '24px',
                pointerEvents: 'none',
              }}
            />
          );
        }
      }
    });

    return elements;
  }, [content, highlights]);

  const getHighlightClass = (type: string, severity: string, isHovered: boolean, isCurrentPosition: boolean): string => {
    const baseClasses = 'rounded transition-all duration-300';

    // Base type colors with proper opacity
    const typeColors: Record<string, string> = {
      intellectual: 'bg-purple-200',
      stylistic: 'bg-blue-200',
      inquiry_integration: 'bg-green-200',
      complex_suggestion: 'bg-green-200',
      complex_insight: 'bg-yellow-200',
      framework_connection: 'bg-indigo-200'
    };

    // Opacity based on severity (always visible)
    const severityOpacity: Record<string, string> = {
      high: 'opacity-60',
      medium: 'opacity-50',
      low: 'opacity-40'
    };

    // Enhanced styling when hovered
    const hoverClasses = isHovered
      ? 'opacity-80 shadow-lg scale-105 ring-2 ring-offset-1 ring-purple-400'
      : '';

    // Pulsing animation for current position when hovering multi-position feedback
    const currentPositionClasses = isCurrentPosition
      ? 'ring-2 ring-yellow-400 animate-pulse'
      : '';

    const baseColor = typeColors[type] || typeColors.intellectual;
    const baseOpacity = severityOpacity[severity] || severityOpacity.medium;

    return `${baseClasses} ${baseColor} ${baseOpacity} ${hoverClasses} ${currentPositionClasses}`;
  };

  return (
    <div className="obsidian-panel h-[calc(100vh-180px)]">
      <div className="h-[36px] px-3 border-b border-obsidian-border flex items-center">
        <h2 className="text-xs font-semibold text-obsidian-text-tertiary uppercase tracking-wide">Editor</h2>
      </div>

      <div className="relative h-[calc(100%-36px)]" data-color-mode="dark" ref={editorRef}>
        <MDEditor
          value={content}
          onChange={(val) => onContentChange(val ?? '')}
          height="100%"
          preview="edit"
          hideToolbar={false}
          visibleDragbar={false}
          style={{
            background: 'var(--obsidian-surface)',
            border: 'none',
            fontSize: '15px'
          }}
          textareaProps={{
            placeholder: 'Start writing...'
          }}
          previewOptions={{
            style: {
              fontSize: '15px',
              lineHeight: '1.6',
              background: 'var(--obsidian-surface)',
              color: 'var(--obsidian-text-primary)'
            }
          }}
        />

        {/* Obsidian theme customization for markdown editor */}
        <style>{`
          .w-md-editor {
            background: var(--obsidian-surface) !important;
            color: var(--obsidian-text-primary) !important;
            border: none !important;
          }

          .w-md-editor-toolbar {
            background: var(--obsidian-bg) !important;
            border-bottom: 1px solid var(--obsidian-border) !important;
            padding: 4px 8px !important;
          }

          .w-md-editor-toolbar button {
            color: var(--obsidian-text-secondary) !important;
            opacity: 0.7;
            transition: opacity 0.2s;
          }

          .w-md-editor-toolbar button:hover {
            background: var(--obsidian-accent-pale) !important;
            color: var(--obsidian-accent-primary) !important;
            opacity: 1;
          }

          /* Hide fullscreen button */
          .w-md-editor-toolbar button[aria-label*="fullscreen"],
          .w-md-editor-toolbar button[data-name="fullscreen"] {
            display: none !important;
          }

          /* Make vertical divider reach the top */
          .w-md-editor-area {
            height: 100% !important;
          }

          .w-md-editor-preview {
            border-left: 1px solid var(--obsidian-border) !important;
            height: 100% !important;
          }

          .w-md-editor-text-pre,
          .w-md-editor-text-input {
            background: var(--obsidian-surface) !important;
            color: var(--obsidian-text-primary) !important;
          }

          .w-md-editor-preview {
            background: var(--obsidian-surface) !important;
            color: var(--obsidian-text-primary) !important;
            padding: 16px !important;
          }

          .wmde-markdown {
            background: var(--obsidian-surface) !important;
            color: var(--obsidian-text-primary) !important;
          }

          .wmde-markdown h1,
          .wmde-markdown h2,
          .wmde-markdown h3,
          .wmde-markdown h4,
          .wmde-markdown h5,
          .wmde-markdown h6 {
            color: var(--obsidian-text-primary) !important;
            border-bottom-color: var(--obsidian-border) !important;
          }

          .wmde-markdown a {
            color: var(--obsidian-accent-primary) !important;
          }

          .wmde-markdown code {
            background: var(--obsidian-bg) !important;
            color: var(--obsidian-accent-primary) !important;
            border: 1px solid var(--obsidian-border) !important;
          }

          .wmde-markdown pre {
            background: var(--obsidian-bg) !important;
            border: 1px solid var(--obsidian-border) !important;
          }

          .wmde-markdown blockquote {
            border-left-color: var(--obsidian-accent-primary) !important;
            color: var(--obsidian-text-secondary) !important;
          }

          /* Scrollbar styling */
          .w-md-editor-text,
          .w-md-editor-preview {
            scrollbar-width: thin;
            scrollbar-color: var(--obsidian-border) var(--obsidian-surface);
          }

          .w-md-editor-text::-webkit-scrollbar,
          .w-md-editor-preview::-webkit-scrollbar {
            width: 8px;
          }

          .w-md-editor-text::-webkit-scrollbar-track,
          .w-md-editor-preview::-webkit-scrollbar-track {
            background: var(--obsidian-surface);
          }

          .w-md-editor-text::-webkit-scrollbar-thumb,
          .w-md-editor-preview::-webkit-scrollbar-thumb {
            background: var(--obsidian-border);
            border-radius: 4px;
          }

          .w-md-editor-text::-webkit-scrollbar-thumb:hover,
          .w-md-editor-preview::-webkit-scrollbar-thumb:hover {
            background: var(--obsidian-text-muted);
          }
        `}</style>
      </div>
    </div>
  );
};

export default WritingArea;
