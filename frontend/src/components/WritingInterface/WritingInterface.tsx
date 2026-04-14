import React, { useState, useEffect, useCallback, useRef } from "react";
import WritingArea, { WritingAreaHandle } from "../WritingArea";
import FeedbackPanel from "../FeedbackPanel";
import ThoughtProcess from "../ThoughtProcess/ThoughtProcess";
import UnifiedAgentCustomizationPanel from "../AgentCustomization/UnifiedAgentCustomizationPanel";
import animaService from "../../services/animaService";
import CorpusGroundsViewer from "../CorpusGroundsViewer/CorpusGroundsViewer";
import {
  EnrichedFeedbackItem,
  Project,
  Anima,
  ModelInfo,
  ThoughtStep,
  CorpusSource,
} from "../../types";
import DropdownSelect, { DropdownOption } from "../UI/DropdownSelect";
import { ExternalLink, Star } from "lucide-react";
import projectService from "../../services/projectService";
import { openAnimaManager } from "../../services/desktopApi";

interface WritingInterfaceProps {
  feedback: EnrichedFeedbackItem[];
  setFeedback: (feedback: EnrichedFeedbackItem[]) => void;
  onBackToSettings: () => void;
  project: Project;
  setProject: (project: Project) => void;
  onFeedbackGenerated: (insights: EnrichedFeedbackItem[]) => void;
}

const WritingInterface: React.FC<WritingInterfaceProps> = ({
  feedback,
  setFeedback,
  project,
  setProject,
  onFeedbackGenerated,
}) => {
  const [resolvedFeedback, setResolvedFeedback] = useState<EnrichedFeedbackItem[]>([]); // Separate storage for resolved feedback
  const [showResolvedFeedback, setShowResolvedFeedback] = useState<boolean>(false); // Toggle for viewing resolved
  const [showAgentCustomization, setShowAgentCustomization] = useState<boolean>(false);
  const [isExecutingFlow, setIsExecutingFlow] = useState<boolean>(false);
  const [availableAnimas, setAvailableAnimas] = useState<Anima[]>([]);
  const [selectedAnimaId, setSelectedAnimaId] = useState<string | null>(
    () => project.settings.default_anima_id
  );
  const [selectedModel, setSelectedModel] = useState<string | null>(
    () => project.settings.default_model_id
  );
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [, setAnalysisStatus] = useState<string | null>(null); // Status updates passed to ThoughtProcess via thoughtSteps
  const [thoughtSteps, setThoughtSteps] = useState<ThoughtStep[]>([]);
  const [corpusViewerOpen, setCorpusViewerOpen] = useState<boolean>(false);
  const [corpusHighlightSource, setCorpusHighlightSource] = useState<(CorpusSource & { _ts?: number }) | null>(null);
  const isExecutingRef = useRef<boolean>(false);
  const writingAreaRef = useRef<WritingAreaHandle>(null);

  const favouriteAnimas: string[] = project.settings.favourite_animas;

  const handleToggleFavourite = useCallback((animaId: string) => {
    const next = favouriteAnimas.includes(animaId)
      ? favouriteAnimas.filter((id) => id !== animaId)
      : [...favouriteAnimas, animaId];
    const updated = { ...project, settings: { ...project.settings, favourite_animas: next } };
    setProject(updated);
    projectService.updateProject(project.id, { settings: updated.settings });
  }, [project, favouriteAnimas, setProject]);

  // Multi-agent feedback management functions
  const handleMultiAgentDismiss = (feedbackId: string): void => {
    setFeedback(feedback.filter((item) => item.id !== feedbackId));
  };

  const handleMultiAgentResolve = (feedbackId: string): void => {
    const feedbackItem = feedback.find((item) => item.id === feedbackId);
    if (feedbackItem) {
      setResolvedFeedback((prev) => [
        ...prev,
        { ...feedbackItem, status: "resolved", resolvedAt: new Date().toISOString() },
      ]);
    }
    setFeedback(feedback.filter((item) => item.id !== feedbackId));
  };


  // Persist selected anima to project settings
  const handleAnimaChange = useCallback((animaId: string) => {
    setSelectedAnimaId(animaId);
    const updated = { ...project, settings: { ...project.settings, default_anima_id: animaId } };
    setProject(updated);
    projectService.updateProject(project.id, { settings: updated.settings });
  }, [project, setProject]);

  // Persist selected model to project settings
  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    const updated = { ...project, settings: { ...project.settings, default_model_id: modelId } };
    setProject(updated);
    projectService.updateProject(project.id, { settings: updated.settings });
  }, [project, setProject]);


  // Load available models
  useEffect(() => {
    animaService
      .getAvailableModels()
      .then((models: ModelInfo[]) => {
        setAvailableModels(models);
      })
      .catch((error: unknown) => {
        console.error("Error loading models:", error);
      });
  }, []);

  // Subscribe to live anima updates
  useEffect(() => {
    const gen = animaService.watchAnimas();
    let active = true;
    (async () => {
      try {
        for await (const animas of gen) {
          if (!active) break;
          setAvailableAnimas(animas);
        }
      } catch (error) {
        console.error("Anima subscription error:", error);
      }
    })();
    return () => {
      active = false;
      gen.return(undefined);
    };
  }, []);

  // Handle Anima analysis with streaming
  const handleExecuteFlowClick = useCallback(async () => {
    // Prevent double-clicks using ref for immediate check
    if (isExecutingRef.current) {
      console.log("[WritingInterface] Already executing, ignoring click");
      return;
    }

    if (!selectedAnimaId) {
      alert(
        "Please select an anima first. Go to the Animas tab to create one.",
      );
      return;
    }

    // Check if selected anima has available corpus
    const selectedAnima = availableAnimas.find(
      (a) => a.id === selectedAnimaId,
    );
    if (selectedAnima && selectedAnima.corpus_available === false) {
      alert(
        "This anima's corpus is unavailable. Please go to the Animas tab and re-upload the corpus files.",
      );
      return;
    }

    if (!project.content || project.content.trim().length === 0) {
      alert("Please write some content first.");
      return;
    }

    // Set loading state immediately and synchronously
    isExecutingRef.current = true;
    setIsExecutingFlow(true);
    setAnalysisStatus("Initializing...");
    setThoughtSteps([]); // Clear previous thought steps

    console.log("[WritingInterface] Starting Anima analysis...", {
      animaId: selectedAnimaId,
      model: selectedModel,
      contentLength: project.content.length,
    });

    let statusClearTimeout: ReturnType<typeof setTimeout> | null = null;

    try {
      const selectedAnima = availableAnimas.find(
        (a) => a.id === selectedAnimaId,
      );

      // Use streaming analysis
      await animaService.analysis(
        project.content,
        selectedAnimaId,
        {
          description: project.description,
          model: selectedModel!, // Pass selected model (guarded by button disabled)
        },
        {
          onStatus: (status) => {
            const statusMsg = status.tool
              ? `${status.message} (tool: ${status.tool})`
              : status.message;
            console.log("[Anima Status]:", statusMsg);
            setAnalysisStatus(statusMsg);

            // Determine step type based on message content
            let stepType: ThoughtStep["type"] = "status";
            if (
              status.tool === "search_corpus" ||
              statusMsg.includes("Searching")
            ) {
              stepType = "search";
            } else if (
              statusMsg.includes("Synthesizing") ||
              statusMsg.includes("Analyzing")
            ) {
              stepType = "generate";
            } else if (
              statusMsg.includes("Complete") ||
              statusMsg.includes("\u2713")
            ) {
              stepType = "complete";
            }

            // Add step to thought process
            setThoughtSteps((prev) => [
              ...prev,
              {
                type: stepType,
                message: status.message,
                details: status.tool ? `Tool: ${status.tool}` : null,
                timestamp: new Date().toISOString(),
              },
            ]);
          },
          onFeedback: (item) => {
            console.log("[Anima Feedback]:", item);
            // Add source and timestamp
            const enrichedItem: EnrichedFeedbackItem = {
              ...item,
              agent: selectedAnima?.name || "Unknown",
              animaName: selectedAnima?.name || "Unknown",
              timestamp: new Date().toISOString(),
              status: "active",
            };

            // Update feedback in real-time
            onFeedbackGenerated([enrichedItem]);

            // Clear any existing timeout
            if (statusClearTimeout) {
              clearTimeout(statusClearTimeout);
            }

            // Set timeout to clear status if completion message doesn't arrive
            // This prevents status from hanging indefinitely
            statusClearTimeout = setTimeout(() => {
              console.log(
                "[Anima] Clearing status (no completion message received)",
              );
              setAnalysisStatus(null);
              isExecutingRef.current = false;
              setIsExecutingFlow(false);
            }, 5000); // 5 seconds after last feedback item
          },
          onComplete: (result) => {
            console.log("[Anima Complete]:", result);

            // Clear the fallback timeout since we got completion
            if (statusClearTimeout) {
              clearTimeout(statusClearTimeout);
              statusClearTimeout = null;
            }

            // Clear execution state immediately
            isExecutingRef.current = false;
            setIsExecutingFlow(false);

            // Add completion step to thought process
            setThoughtSteps((prev) => [
              ...prev,
              {
                type: "complete",
                message: `Complete! ${result.total_items} feedback items in ${result.processing_time?.toFixed(1) || 0}s`,
                details: null,
                timestamp: new Date().toISOString(),
              },
            ]);

            setAnalysisStatus(
              `Complete! Generated ${result.total_items} feedback items in ${result.processing_time?.toFixed(1) || 0}s`,
            );

            // Clear status text after delay, but keep thought steps visible until next analysis
            setTimeout(() => {
              setAnalysisStatus(null);
            }, 3000);
          },
          onError: (error) => {
            console.error("[Anima Error]:", error);

            // Clear the fallback timeout on error
            if (statusClearTimeout) {
              clearTimeout(statusClearTimeout);
              statusClearTimeout = null;
            }

            // Clear execution state
            isExecutingRef.current = false;
            setIsExecutingFlow(false);

            // Add error step to thought process
            setThoughtSteps((prev) => [
              ...prev,
              {
                type: "error",
                message: `Error: ${error.message}`,
                details: null,
                timestamp: new Date().toISOString(),
              },
            ]);

            alert(`Analysis failed: ${error.message}`);
            setAnalysisStatus(null);
          },
        },
      );
    } catch (error) {
      const err = error as Error;
      console.error("[WritingInterface] Anima analysis error:", err);

      // Add error step to thought process
      setThoughtSteps((prev) => [
        ...prev,
        {
          type: "error",
          message: `Error: ${err.message}`,
          details: null,
          timestamp: new Date().toISOString(),
        },
      ]);

      alert(`Analysis error: ${err.message}`);
      setAnalysisStatus(null);

      // Clean up on catch
      if (statusClearTimeout) {
        clearTimeout(statusClearTimeout);
      }
      isExecutingRef.current = false;
      setIsExecutingFlow(false);
    }
    // Note: Don't clear execution state in finally - callbacks are async and will handle cleanup
  }, [
    selectedAnimaId,
    selectedModel,
    project,
    availableAnimas,
    onFeedbackGenerated,
  ]);


  const handleJumpToReference = (text: string): void => {
    writingAreaRef.current?.selectText(text);
  };

  const handleViewCorpusSource = (source: CorpusSource): void => {
    // Spread into a new object so React always sees a state change,
    // even if the user clicks the same source twice.
    setCorpusHighlightSource({ ...source, _ts: Date.now() });
    setCorpusViewerOpen(true);
  };

  return (
    <>
      <div className="mx-auto px-2 py-3 space-y-3">
        {/* Anima Analysis Toolbar - Minimal */}
        <div className="card bg-base-100 border border-base-300 p-3 flex !flex-row items-center gap-4">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-primary flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <span className="text-sm font-semibold text-base-content whitespace-nowrap">
              Anima
            </span>
          </div>
          {availableAnimas.length > 0 ? (
            <DropdownSelect
              value={selectedAnimaId || ""}
              onChange={handleAnimaChange}
              disabled={isExecutingFlow}
              placeholder="Select anima..."
              options={(() => {
                const toOption = (anima: Anima): DropdownOption => ({
                  value: anima.id,
                  label:
                    (anima.corpus_available === false ? "⚠ " : "") +
                    anima.name +
                    (anima.corpus_available === false
                      ? " (unavailable)"
                      : anima.chunk_count === 0
                        ? " (empty)"
                        : ` · ${anima.chunk_count?.toLocaleString()}`),
                  action: {
                    icon: <Star className={`w-3 h-3 ${favouriteAnimas.includes(anima.id) ? "fill-primary text-primary" : ""}`} />,
                    title: favouriteAnimas.includes(anima.id) ? "Remove from favourites" : "Add to favourites",
                    onClick: (e) => { e.stopPropagation(); handleToggleFavourite(anima.id); },
                  },
                });
                const favs = availableAnimas.filter((a) => favouriteAnimas.includes(a.id));
                const rest = availableAnimas.filter((a) => !favouriteAnimas.includes(a.id));
                return [
                  ...(favs.length > 0 ? favs.map(toOption) : []),
                  ...(favs.length > 0 && rest.length > 0 ? [{ value: "__sep__", label: "", separator: true }] : []),
                  ...rest.map(toOption),
                ];
              })()}
              header={
                <>
                  <span>Anima</span>
                  <button
                    type="button"
                    onClick={openAnimaManager}
                    className="flex items-center gap-1 hover:text-base-content transition-colors"
                    title="Open Anima Manager"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Manage</span>
                  </button>
                </>
              }
            />
          ) : (
            <DropdownSelect
              value=""
              onChange={() => {}}
              placeholder="No animas"
              options={[]}
              header={
                <>
                  <span>Anima</span>
                  <button
                    type="button"
                    onClick={openAnimaManager}
                    className="flex items-center gap-1 hover:text-base-content transition-colors"
                    title="Open Anima Manager"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Manage</span>
                  </button>
                </>
              }
            />
          )}
          {/* Model Selector */}
          <DropdownSelect
            value={selectedModel || ""}
            onChange={handleModelChange}
            disabled={isExecutingFlow}
            placeholder="Select model..."
            options={
              availableModels.length > 0
                ? availableModels.map((m) => ({ value: m.id, label: m.name }))
                : [{ value: "", label: "No models available", disabled: true }]
            }
          />
          <button
            onClick={handleExecuteFlowClick}
            disabled={isExecutingFlow || !project.content || !selectedAnimaId || !selectedModel}
            className={`btn btn-sm whitespace-nowrap flex-shrink-0 ml-auto ${
              isExecutingFlow || !project.content || !selectedAnimaId
                ? "btn-disabled"
                : "btn-primary"
            }`}
          >
            {isExecutingFlow ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Thinking
              </span>
            ) : (
              "Think"
            )}
          </button>
        </div>

        {/* Thought Process Display */}
        {thoughtSteps.length > 0 && (
          <ThoughtProcess
            steps={thoughtSteps}
            isAnalyzing={isExecutingFlow}
            model={selectedModel ?? ""}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
          <div>
            <WritingArea
              ref={writingAreaRef}
              content={project.content}
              onContentChange={(content: string) => setProject({ ...project, content })}
            />
          </div>

          <div>
            <FeedbackPanel
              feedback={feedback}
              resolvedFeedback={resolvedFeedback}
              showResolved={showResolvedFeedback}
              onToggleResolved={() =>
                setShowResolvedFeedback(!showResolvedFeedback)
              }
              onDismissSuggestion={handleMultiAgentDismiss}
              onMarkSuggestionResolved={handleMultiAgentResolve}
              onJumpToReference={handleJumpToReference}
              onViewCorpusSource={handleViewCorpusSource}
            />
          </div>
        </div>
      </div>

      {/* Unified Agent Customization Panel */}
      <UnifiedAgentCustomizationPanel
        isOpen={showAgentCustomization}
        onClose={() => setShowAgentCustomization(false)}
        onAgentsUpdated={() => {
          console.log(
            "Agents updated - analysis will use new configuration on next run",
          );
        }}
      />

      {/* Corpus Grounds Viewer */}
      <CorpusGroundsViewer
        isOpen={corpusViewerOpen}
        onClose={() => {
          setCorpusViewerOpen(false);
          setCorpusHighlightSource(null);
        }}
        animaId={selectedAnimaId}
        highlightSource={corpusHighlightSource}
      />
    </>
  );
};

export default WritingInterface;
