import React, { useState, useEffect, useCallback, useRef } from "react";
import WritingArea from "../WritingArea";
import FeedbackPanel from "../FeedbackPanel";
import ThoughtProcess from "../ThoughtProcess/ThoughtProcess";
import UnifiedAgentCustomizationPanel from "../AgentCustomization/UnifiedAgentCustomizationPanel";
import feedbackHistoryService from "../../services/feedbackHistoryService";
import animaService from "../../services/animaService";
import CorpusGroundsViewer from "../CorpusGroundsViewer/CorpusGroundsViewer";

const WritingInterface = ({
  purpose,
  content,
  onContentChange,
  feedback,
  setFeedback,
  onBackToPurpose,
  project,
  writingCriteria,
  isMonitoring,
  onToggleMonitoring,
  onFeedbackGenerated,
}) => {
  const [hoveredFeedback, setHoveredFeedback] = useState(null);
  const [useMultiAgentSystem] = useState(false); // Disabled - using flow-based agents only
  const [multiAgentFeedback, setMultiAgentFeedback] = useState([]);
  const [resolvedFeedback, setResolvedFeedback] = useState([]); // Separate storage for resolved feedback
  const [showResolvedFeedback, setShowResolvedFeedback] = useState(false); // Toggle for viewing resolved
  const [showAgentCustomization, setShowAgentCustomization] = useState(false);
  const [isExecutingFlow, setIsExecutingFlow] = useState(false);
  const [availablePersonas, setAvailablePersonas] = useState([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState(() => {
    // Load persisted persona selection from localStorage
    return localStorage.getItem("selectedPersonaId") || null;
  });
  const [selectedModel, setSelectedModel] = useState(() => {
    // Load persisted model selection from localStorage
    return localStorage.getItem("selectedModel") || "gpt-5";
  });
  const [availableModels, setAvailableModels] = useState([]);
  const [, setAnalysisStatus] = useState(null); // Status updates passed to ThoughtProcess via thoughtSteps
  const [thoughtSteps, setThoughtSteps] = useState([]);
  const [corpusViewerOpen, setCorpusViewerOpen] = useState(false);
  const [corpusHighlightSource, setCorpusHighlightSource] = useState(null);
  const isExecutingRef = useRef(false);

  // Multi-agent feedback management functions
  const handleMultiAgentDismiss = (feedbackId) => {
    // Find the feedback item before removing it
    const feedbackItem = multiAgentFeedback.find(
      (item) => item.id === feedbackId,
    );

    if (feedbackItem) {
      // Record this as rejected feedback for agent learning
      feedbackHistoryService.recordRejected(feedbackItem);
      console.log(
        "[WritingInterface] Recorded dismissed feedback for learning:",
        feedbackItem.title,
      );
    }

    // Remove from local state
    setMultiAgentFeedback((prev) =>
      prev.filter((item) => item.id !== feedbackId),
    );

    // IMPORTANT: Also remove from parent state to prevent reappearing on re-render
    if (setFeedback) {
      setFeedback((prev) => prev.filter((item) => item.id !== feedbackId));
    }
  };

  const handleMultiAgentResolve = (feedbackId) => {
    // Move resolved feedback to separate storage
    setMultiAgentFeedback((prev) => {
      const resolvedItem = prev.find((item) => item.id === feedbackId);
      if (resolvedItem) {
        // Record this as accepted feedback for agent learning
        feedbackHistoryService.recordAccepted(resolvedItem);
        console.log(
          "[WritingInterface] Recorded resolved feedback for learning:",
          resolvedItem.title,
        );

        // Add to resolved storage with timestamp
        setResolvedFeedback((prevResolved) => [
          ...prevResolved,
          {
            ...resolvedItem,
            status: "resolved",
            resolvedAt: new Date().toISOString(),
          },
        ]);
      }
      // Remove from active feedback
      return prev.filter((item) => item.id !== feedbackId);
    });

    // IMPORTANT: Also remove from parent state to prevent reappearing on re-render
    if (setFeedback) {
      setFeedback((prev) => prev.filter((item) => item.id !== feedbackId));
    }
  };

  const handleMultiAgentClear = () => {
    setMultiAgentFeedback([]);

    // IMPORTANT: Also clear parent state to prevent reappearing on re-render
    if (setFeedback) {
      setFeedback([]);
    }
  };

  // Persist selected persona to localStorage
  useEffect(() => {
    if (selectedPersonaId) {
      localStorage.setItem("selectedPersonaId", selectedPersonaId);
    }
  }, [selectedPersonaId]);

  // Persist selected model to localStorage
  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem("selectedModel", selectedModel);
    }
  }, [selectedModel]);

  // Load available models
  useEffect(() => {
    animaService
      .getAvailableModels()
      .then((models) => {
        setAvailableModels(models);
      })
      .catch((error) => {
        console.error("Error loading models:", error);
        // Fallback models
        setAvailableModels([
          { id: "gpt-5", name: "GPT-5", provider: "openai" },
          { id: "kimi-k2", name: "Kimi K2", provider: "moonshot" },
        ]);
      });
  }, []);

  // Load available personas
  useEffect(() => {
    animaService
      .getPersonas()
      .then((personas) => {
        setAvailablePersonas(personas);

        // Check if persisted persona exists in available personas
        const persistedId = localStorage.getItem("selectedPersonaId");
        const persistedPersonaExists =
          persistedId && personas.some((p) => p.id === persistedId);

        // Only auto-select if no valid persisted selection
        // Using setSelectedPersonaId callback to avoid dependency on selectedPersonaId
        setSelectedPersonaId((currentId) => {
          if (!persistedPersonaExists && !currentId) {
            // Find a persona with corpus that is also available
            const personaWithCorpus = personas.find(
              (p) => p.chunk_count > 0 && p.corpus_available !== false,
            );
            return personaWithCorpus ? personaWithCorpus.id : currentId;
          }
          return currentId;
        });
      })
      .catch((error) => console.error("Error loading personas:", error));
  }, []);

  // Handle Anima analysis with streaming
  const handleExecuteFlowClick = useCallback(async () => {
    // Prevent double-clicks using ref for immediate check
    if (isExecutingRef.current) {
      console.log("[WritingInterface] Already executing, ignoring click");
      return;
    }

    if (!selectedPersonaId) {
      alert(
        "Please select an anima first. Go to the Animas tab to create one.",
      );
      return;
    }

    // Check if selected persona has available corpus
    const selectedPersona = availablePersonas.find(
      (p) => p.id === selectedPersonaId,
    );
    if (selectedPersona && selectedPersona.corpus_available === false) {
      alert(
        "This anima's corpus is unavailable. Please go to the Animas tab and re-upload the corpus files.",
      );
      return;
    }

    if (!content || content.trim().length === 0) {
      alert("Please write some content first.");
      return;
    }

    // Set loading state immediately and synchronously
    isExecutingRef.current = true;
    setIsExecutingFlow(true);
    setAnalysisStatus("Initializing...");
    setThoughtSteps([]); // Clear previous thought steps

    console.log("[WritingInterface] Starting Anima analysis...", {
      personaId: selectedPersonaId,
      model: selectedModel,
      contentLength: content.length,
    });

    let statusClearTimeout = null;

    try {
      const selectedPersona = availablePersonas.find(
        (p) => p.id === selectedPersonaId,
      );
      const feedbackItems = [];

      // Convert purpose to string if it's an object
      const purposeText =
        typeof purpose === "object" && purpose !== null
          ? purpose.topic || purpose.context || ""
          : purpose || "";

      // Use streaming analysis
      await animaService.streamAnalysis(
        content,
        selectedPersonaId,
        {
          purpose: purposeText,
          criteria: writingCriteria?.criteria || [],
          feedbackHistory: feedback.slice(-3), // Last 3 feedback items
          model: selectedModel, // Pass selected model
        },
        {
          onStatus: (status) => {
            const statusMsg = status.tool
              ? `${status.message} (tool: ${status.tool})`
              : status.message;
            console.log("[Anima Status]:", statusMsg);
            setAnalysisStatus(statusMsg);

            // Determine step type based on message content
            let stepType = "status";
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
              statusMsg.includes("✓")
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
            const enrichedItem = {
              ...item,
              source: "anima",
              personaName: selectedPersona?.name || "Unknown",
              timestamp: new Date().toISOString(),
              status: "active",
            };
            feedbackItems.push(enrichedItem);

            // Update feedback in real-time
            if (onFeedbackGenerated) {
              onFeedbackGenerated([enrichedItem]);
            }

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
      console.error("[WritingInterface] Anima analysis error:", error);

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

      alert(`Analysis error: ${error.message}`);
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
    selectedPersonaId,
    selectedModel,
    content,
    purpose,
    writingCriteria,
    feedback,
    availablePersonas,
    onFeedbackGenerated,
  ]);

  // Choose which system to use based on feature flag
  // Sync feedback prop to local state for display
  // This ensures Anima execution results show up
  useEffect(() => {
    // Filter out any legacy agent feedback, only keep Anima feedback
    const animaFeedback = feedback.filter(
      (f) => f.source === "anima" || f.source === "flow",
    );

    // Simply replace with new feedback
    // Dismissed items are gone forever and won't come back
    // Resolved items are in separate resolvedFeedback storage
    setMultiAgentFeedback(animaFeedback);
  }, [feedback]);

  // Clear any legacy feedback on mount
  useEffect(() => {
    console.log("[WritingInterface] Clearing legacy feedback on mount");
    if (setFeedback) {
      setFeedback((prev) => {
        const flowOnly = prev.filter((f) => f.source === "flow");
        if (flowOnly.length !== prev.length) {
          console.log(
            "[WritingInterface] Removed",
            prev.length - flowOnly.length,
            "legacy feedback items",
          );
        }
        return flowOnly;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount - setFeedback is stable prop from parent

  // Always use flow-based feedback system (no legacy agents)
  const currentAnalysis = {
    feedback: multiAgentFeedback,
    clearFeedback: handleMultiAgentClear,
    dismissSuggestion: handleMultiAgentDismiss,
    markSuggestionResolved: handleMultiAgentResolve,
    isEvaluating: false,
    isAnalyzing: false,
    runDocumentAnalysis: () =>
      console.log("Legacy analysis disabled - use flow execution"),
    isDocumentAnalyzing: false,
  };

  // NOTE: We don't sync feedback back to parent here because:
  // 1. New feedback is already sent via onFeedbackGenerated callback (line 155)
  // 2. Syncing here creates a circular dependency and infinite re-render loop
  // The useEffect at line 186 handles incoming feedback from parent -> local state

  // Always use current analysis feedback for display since it handles filtering correctly
  // Only use passed feedback for initial state synchronization
  const activeFeedback = currentAnalysis.feedback || [];

  // Remove local handleToggleMonitoring since it's now passed as prop

  const handleFeedbackHover = (feedbackId) => {
    setHoveredFeedback(feedbackId);
  };

  const handleFeedbackLeave = () => {
    setHoveredFeedback(null);
  };

  const handleExploreFramework = (
    framework,
    keyAuthorities,
    suggestedResources,
  ) => {
    console.log("Framework exploration:", {
      framework,
      keyAuthorities,
      suggestedResources,
    });
    // Optionally show a modal with framework information or navigate to resources
  };

  const handleJumpToText = (feedbackId) => {
    // Find the feedback item
    const feedbackItem = activeFeedback.find((f) => f.id === feedbackId);
    if (
      feedbackItem &&
      feedbackItem.positions &&
      feedbackItem.positions.length > 0
    ) {
      // Trigger scroll by setting hovered feedback temporarily
      setHoveredFeedback(feedbackId);
      // Clear after scroll animation completes
      setTimeout(() => setHoveredFeedback(null), 2000);
    }
  };

  const handleViewCorpusSource = (source) => {
    // Spread into a new object so React always sees a state change,
    // even if the user clicks the same source twice.
    setCorpusHighlightSource({ ...source, _ts: Date.now() });
    setCorpusViewerOpen(true);
  };

  return (
    <>
      <div className="mx-auto px-2 py-3 space-y-3">
        {/* Anima Analysis Toolbar - Minimal */}
        <div className="obsidian-panel p-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-obsidian-accent-primary flex-shrink-0"
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
              <span className="text-sm font-semibold text-obsidian-text-primary whitespace-nowrap">
                Anima
              </span>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {availablePersonas.length > 0 ? (
                <select
                  value={selectedPersonaId || ""}
                  onChange={(e) => setSelectedPersonaId(e.target.value)}
                  className="obsidian-input w-full max-w-[280px]"
                  disabled={isExecutingFlow}
                >
                  <option value="">Select anima...</option>
                  {availablePersonas.map((persona) => (
                    <option key={persona.id} value={persona.id}>
                      {persona.corpus_available === false ? "⚠ " : ""}
                      {persona.name}{" "}
                      {persona.corpus_available === false
                        ? "(unavailable)"
                        : persona.chunk_count === 0
                          ? "(empty)"
                          : `· ${persona.chunk_count.toLocaleString()}`}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-obsidian-text-tertiary">
                  No animas
                </span>
              )}
              {/* Model Selector */}
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="obsidian-input max-w-[280px]"
                disabled={isExecutingFlow}
              >
                {availableModels.length > 0 ? (
                  availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="gpt-5">GPT-5</option>
                    <option value="kimi-k2">Kimi K2</option>
                  </>
                )}
              </select>
            </div>
          </div>
          <button
            onClick={handleExecuteFlowClick}
            disabled={isExecutingFlow || !content || !selectedPersonaId}
            className={`whitespace-nowrap ${
              isExecutingFlow || !content || !selectedPersonaId
                ? "obsidian-button bg-obsidian-bg text-obsidian-text-muted cursor-not-allowed"
                : "obsidian-button-primary"
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
            model={selectedModel}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
          <div>
            <WritingArea
              content={content}
              onContentChange={onContentChange}
              autoFocus={true}
              feedback={activeFeedback.filter(
                (item) => !item.status || item.status === "active",
              )}
              hoveredFeedback={hoveredFeedback}
            />
          </div>

          <div>
            <FeedbackPanel
              feedback={activeFeedback}
              resolvedFeedback={resolvedFeedback}
              showResolved={showResolvedFeedback}
              onToggleResolved={() =>
                setShowResolvedFeedback(!showResolvedFeedback)
              }
              isMonitoring={isMonitoring}
              onFeedbackHover={handleFeedbackHover}
              onFeedbackLeave={handleFeedbackLeave}
              hoveredFeedback={hoveredFeedback}
              onDismissSuggestion={currentAnalysis.dismissSuggestion}
              onMarkSuggestionResolved={currentAnalysis.markSuggestionResolved}
              isEvaluating={currentAnalysis.isEvaluating}
              isAnalyzing={currentAnalysis.isAnalyzing}
              onExploreFramework={handleExploreFramework}
              onJumpToText={handleJumpToText}
              onViewCorpusSource={handleViewCorpusSource}
            />
          </div>
        </div>
      </div>

      {/* Unified Agent Customization Panel */}
      <UnifiedAgentCustomizationPanel
        isOpen={showAgentCustomization}
        onClose={() => setShowAgentCustomization(false)}
        initialTab="control" // Start with the control tab
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
        personaId={selectedPersonaId}
        highlightSource={corpusHighlightSource}
      />
    </>
  );
};

export default WritingInterface;
