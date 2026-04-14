import React, { useState, useEffect } from "react";
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
  model: string;
}

/**
 * Displays the internal thought process of Anima analysis
 * Shows latest step inline, with expandable view to see all steps
 * The latest status is ALWAYS visible and auto-updates as new statuses arrive
 */
const ThoughtProcess: React.FC<ThoughtProcessProps> = ({ steps, isAnalyzing, model }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  // Track the "caught-up" length; isFlashing is true while steps are ahead of it
  const [displayedStepsLength, setDisplayedStepsLength] = useState<number>(steps?.length || 0);
  const isFlashing = (steps?.length || 0) > displayedStepsLength;

  // After 300ms, catch displayedStepsLength up so the flash ends
  useEffect(() => {
    if (!steps || steps.length <= displayedStepsLength) return;
    const timer = setTimeout(() => setDisplayedStepsLength(steps.length), 300);
    return () => clearTimeout(timer);
  }, [steps, displayedStepsLength]);

  if (!steps || steps.length === 0) {
    return null;
  }

  // Show only the most recent step
  const latestStep = steps[steps.length - 1];

  // Count search steps specifically
  const searchSteps = steps.filter((s) => s.type === "search");

  const getStepIcon = (step: ThoughtStep, size: string = "w-3.5 h-3.5", showSpinner: boolean = true): React.ReactNode => {
    if (step.type === "search") {
      return <Search className={`${size} text-primary`} />;
    } else if (step.type === "generate") {
      return <Lightbulb className={`${size} text-warning`} />;
    } else if (step.type === "complete") {
      return <CheckCircle className={`${size} text-success`} />;
    } else if (step.type === "error") {
      return <AlertCircle className={`${size} text-error`} />;
    } else if (showSpinner) {
      return (
        <Loader2
          className={`${size} text-base-content/50 animate-spin`}
        />
      );
    } else {
      return <CheckCircle className={`${size} text-base-content/50`} />;
    }
  };

  return (
    <div
      className={`border-l-2 border-primary rounded text-sm text-base-content/70 transition-all duration-300 ${
        isFlashing ? "bg-primary/15" : "bg-primary/10"
      }`}
    >
      {/* Main row - ALWAYS visible with latest status, auto-updates as new statuses arrive */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-primary/15 transition-colors"
        onClick={() => steps.length > 1 && setIsExpanded(!isExpanded)}
      >
        <div
          className={`flex-shrink-0 transition-transform duration-200 ${isFlashing ? "scale-110" : ""}`}
        >
          {getStepIcon(latestStep, "w-3.5 h-3.5", isAnalyzing)}
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <span className="font-medium text-base-content">
            {latestStep.message}
          </span>
          {latestStep.details && (
            <span className="text-base-content/50 ml-2 font-mono text-xs">
              {latestStep.details}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] px-1.5 py-0.5 bg-base-200 rounded border border-base-300 text-base-content/40 font-mono">
            {model}
          </span>
          {steps.length > 1 && (
            <span className="text-xs text-base-content/40">
              {searchSteps.length} searches / {steps.length} steps
            </span>
          )}
          {steps.length > 1 &&
            (isExpanded ? (
              <ChevronUp className="w-4 h-4 text-base-content/40" />
            ) : (
              <ChevronDown className="w-4 h-4 text-base-content/40" />
            ))}
        </div>
      </div>

      {/* Expanded view - all steps */}
      {isExpanded && steps.length > 1 && (
        <div className="border-t border-base-300/50 px-4 py-2 max-h-48 overflow-y-auto">
          <div className="space-y-1.5">
            {steps.map((step, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 py-1 text-xs ${
                  step.type === "search"
                    ? "text-primary"
                    : "text-base-content/50"
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
                    <span className="text-base-content/40 ml-1 font-mono">
                      ({step.details})
                    </span>
                  )}
                </div>
                <span className="text-base-content/40 font-mono flex-shrink-0">
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
