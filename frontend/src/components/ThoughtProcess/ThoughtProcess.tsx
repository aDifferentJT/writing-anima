import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Lightbulb,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";
import { ThoughtStep } from "../../types";

interface ThoughtProcessProps {
  steps: ThoughtStep[] | null;
  isAnalyzing: boolean;
  model?: string;
}

/**
 * Displays the internal thought process of Anima analysis
 * Shows latest step inline, with expandable view to see all steps
 * The latest status is ALWAYS visible and auto-updates as new statuses arrive
 */
const ThoughtProcess: React.FC<ThoughtProcessProps> = ({ steps, isAnalyzing, model }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const prevStepsLength = useRef<number>(steps?.length || 0);

  // Flash animation when new steps arrive
  useEffect(() => {
    if (steps && steps.length > prevStepsLength.current) {
      setIsFlashing(true);
      const timer = setTimeout(() => setIsFlashing(false), 300);
      prevStepsLength.current = steps.length;
      return () => clearTimeout(timer);
    }
    prevStepsLength.current = steps?.length || 0;
  }, [steps]);

  if (!steps || steps.length === 0) {
    return null;
  }

  // Show only the most recent step
  const latestStep = steps[steps.length - 1];

  // Count search steps specifically
  const searchSteps = steps.filter((s) => s.type === "search");

  const getStepIcon = (step: ThoughtStep, size: string = "w-3.5 h-3.5", showSpinner: boolean = true): React.ReactNode => {
    if (step.type === "search") {
      return <Search className={`${size} text-obsidian-accent-primary`} />;
    } else if (step.type === "generate") {
      return <Lightbulb className={`${size} text-obsidian-warning`} />;
    } else if (step.type === "complete") {
      return <CheckCircle className={`${size} text-obsidian-success`} />;
    } else if (step.type === "error") {
      return <AlertCircle className={`${size} text-red-500`} />;
    } else if (showSpinner) {
      return (
        <Loader2
          className={`${size} text-obsidian-text-tertiary animate-spin`}
        />
      );
    } else {
      return <CheckCircle className={`${size} text-obsidian-text-tertiary`} />;
    }
  };

  return (
    <div
      className={`border-l-2 border-obsidian-accent-primary rounded-obsidian text-sm text-obsidian-text-secondary transition-all duration-300 ${
        isFlashing ? "bg-obsidian-accent-pale/60" : "bg-obsidian-accent-pale/30"
      }`}
    >
      {/* Main row - ALWAYS visible with latest status, auto-updates as new statuses arrive */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-obsidian-accent-pale/50 transition-colors"
        onClick={() => steps.length > 1 && setIsExpanded(!isExpanded)}
      >
        <div
          className={`flex-shrink-0 transition-transform duration-200 ${isFlashing ? "scale-110" : ""}`}
        >
          {getStepIcon(latestStep, "w-3.5 h-3.5", isAnalyzing)}
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <span className="font-medium text-obsidian-text-primary">
            {latestStep.message}
          </span>
          {latestStep.details && (
            <span className="text-obsidian-text-tertiary ml-2 font-mono text-xs">
              {latestStep.details}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {model && (
            <span className="text-[10px] px-1.5 py-0.5 bg-obsidian-bg rounded border border-obsidian-border text-obsidian-text-muted font-mono">
              {model}
            </span>
          )}
          {steps.length > 1 && (
            <span className="text-xs text-obsidian-text-muted">
              {searchSteps.length} searches / {steps.length} steps
            </span>
          )}
          {steps.length > 1 &&
            (isExpanded ? (
              <ChevronUp className="w-4 h-4 text-obsidian-text-muted" />
            ) : (
              <ChevronDown className="w-4 h-4 text-obsidian-text-muted" />
            ))}
        </div>
      </div>

      {/* Expanded view - all steps */}
      {isExpanded && steps.length > 1 && (
        <div className="border-t border-obsidian-border/50 px-4 py-2 max-h-48 overflow-y-auto">
          <div className="space-y-1.5">
            {steps.map((step, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 py-1 text-xs ${
                  step.type === "search"
                    ? "text-obsidian-accent-primary"
                    : "text-obsidian-text-tertiary"
                }`}
              >
                <span className="flex-shrink-0 mt-0.5">
                  {getStepIcon(step, "w-3 h-3")}
                </span>
                <div className="flex-1 min-w-0">
                  <span className={step.type === "search" ? "font-medium" : ""}>
                    {step.message}
                  </span>
                  {step.details && (
                    <span className="text-obsidian-text-muted ml-1 font-mono">
                      ({step.details})
                    </span>
                  )}
                </div>
                <span className="text-obsidian-text-muted font-mono flex-shrink-0">
                  #{idx + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThoughtProcess;
