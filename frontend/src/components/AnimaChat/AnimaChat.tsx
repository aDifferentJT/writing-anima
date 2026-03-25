import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, MessageCircle } from "lucide-react";
import animaService from "../../services/animaService";
import type { ChatMessage, ModelInfo, Anima } from "../../types";

interface AnimaChatProps {
  isOpen: boolean;
  onClose: () => void;
  anima: Anima | null;
}

const AnimaChat: React.FC<AnimaChatProps> = ({ isOpen, onClose, anima }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef<string>("");

  // Reset conversation state when anima changes (render-time adjustment, avoids effect)
  const [currentAnimaId, setCurrentAnimaId] = useState(anima?.id);
  if (currentAnimaId !== anima?.id) {
    setCurrentAnimaId(anima?.id);
    setMessages([]);
    setStreamingContent("");
    setInput("");
    setError(null);
    setSelectedModel(null);
  }

  // Load available models once
  useEffect(() => {
    animaService
      .getAvailableModels()
      .then((models: ModelInfo[]) => setAvailableModels(models))
      .catch((err: unknown) => {
        console.error("Failed to load models:", err);
        setError("Failed to load available models.");
      });
  }, []);


  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      const timer = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
  }, [messages, streamingContent]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !anima) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);
    setStreamingContent("");
    streamingRef.current = "";

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      await animaService.chat(
        text,
        anima.id,
        history,
        {
          onToken: (token: string) => {
            streamingRef.current += token;
            setStreamingContent(streamingRef.current);
          },
          onComplete: (fullResponse: string) => {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: fullResponse },
            ]);
            setStreamingContent("");
            streamingRef.current = "";
            setLoading(false);
          },
          onError: (err: Error) => {
            console.error("Chat stream error:", err);
            // If we had partial content, keep it as a message
            if (streamingRef.current) {
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: streamingRef.current },
              ]);
              setStreamingContent("");
              streamingRef.current = "";
            }
            setError(err.message || "Failed to get response");
            setLoading(false);
          },
        },
        selectedModel ?? "gpt-5",
      );
    } catch (err: unknown) {
      console.error("Chat error:", err);
      setError((err as Error).message || "Failed to connect");
      setLoading(false);
    }
  }, [input, loading, anima, messages, selectedModel]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed inset-y-0 right-0 w-[50vw] max-w-2xl bg-base-100 shadow-xl flex flex-col transition-transform duration-300 ease-out"
        style={{ transform: isOpen ? "translateX(0)" : "translateX(100%)" }}
      >
        {/* Header */}
        <div className="h-[48px] px-4 border-b border-base-300 flex items-center gap-3 flex-shrink-0">
          <MessageCircle className="w-4 h-4 text-primary" />
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm text-base-content tracking-tight">
              {anima?.name || "Anima"}
            </span>
            {anima?.description && (
              <span className="ml-2 text-xs text-base-content/40 truncate">
                {anima.description}
              </span>
            )}
          </div>
          <select
            value={selectedModel || ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedModel(e.target.value)}
            className="select select-bordered select-sm text-xs max-w-[200px]"
            disabled={loading || availableModels.length === 0}
          >
            {availableModels.length > 0 ? (
              availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))
            ) : (
              <option value="">No Models Available</option>
            )}
          </select>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-base-200 rounded transition-colors"
          >
            <X className="w-4 h-4 text-base-content/50" />
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto obsidian-scrollbar p-4 space-y-3">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <MessageCircle className="w-8 h-8 text-base-300 mb-3 opacity-40" />
              <p className="text-sm text-base-content/40 mb-1">
                Start a conversation with {anima?.name || "this anima"}
              </p>
              <p className="text-xs text-base-content/50">
                They will respond in the author&apos;s voice, grounded in their
                corpus.
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary/10 text-base-content"
                    : "bg-base-200 border border-base-300 text-base-content"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}

          {/* Streaming response */}
          {streamingContent && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed bg-base-200 border border-base-300 text-base-content">
                <div className="whitespace-pre-wrap">
                  {streamingContent}
                  <span className="inline-block w-1.5 h-4 bg-base-content/40 animate-pulse ml-0.5 align-text-bottom" />
                </div>
              </div>
            </div>
          )}

          {/* Loading indicator (before tokens arrive) */}
          {loading && !streamingContent && (
            <div className="flex justify-start">
              <div className="bg-base-200 border border-base-300 rounded-lg px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-base-content/40 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-base-content/40 animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-base-content/40 animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex justify-center">
              <div className="text-xs text-red-500 bg-red-50/50 border border-red-200 rounded px-3 py-1.5">
                {error}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-base-300 p-3 flex-shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${anima?.name || "anima"}...`}
              rows={1}
              className="textarea textarea-bordered flex-1 resize-none text-sm py-2 px-3 max-h-32 overflow-y-auto"
              style={{
                height: "auto",
                minHeight: "36px",
              }}
              onInput={(e: React.FormEvent<HTMLTextAreaElement>) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height =
                  Math.min(target.scrollHeight, 128) + "px";
              }}
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="btn btn-primary btn-sm p-2 rounded disabled:opacity-30 flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnimaChat;
