import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, MessageCircle } from "lucide-react";
import animaService from "../../services/animaService";

const AnimaChat = ({ isOpen, onClose, persona }) => {
  const [messages, setMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const streamingRef = useRef("");

  // Load available models once
  useEffect(() => {
    animaService
      .getAvailableModels()
      .then((models) => setAvailableModels(models))
      .catch(() => {
        setAvailableModels([
          { id: "gpt-5", name: "GPT-5", provider: "openai" },
        ]);
      });
  }, []);

  // Reset conversation when persona changes, set default model from persona
  useEffect(() => {
    setMessages([]);
    setStreamingContent("");
    setInput("");
    setError(null);
    setSelectedModel(persona?.model || "gpt-5");
  }, [persona?.id]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      const timer = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
  }, [messages, streamingContent]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !persona) return;

    const userMessage = { role: "user", content: text };
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

      await animaService.streamChat(
        text,
        persona.id,
        history,
        {
          onToken: (token) => {
            streamingRef.current += token;
            setStreamingContent(streamingRef.current);
          },
          onComplete: (fullResponse) => {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: fullResponse },
            ]);
            setStreamingContent("");
            streamingRef.current = "";
            setLoading(false);
          },
          onError: (err) => {
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
        selectedModel,
      );
    } catch (err) {
      console.error("Chat error:", err);
      setError(err.message || "Failed to connect");
      setLoading(false);
    }
  }, [input, loading, persona, messages, selectedModel]);

  const handleKeyDown = (e) => {
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
        className="fixed inset-y-0 right-0 w-[50vw] max-w-2xl bg-obsidian-surface shadow-obsidian-xl flex flex-col transition-transform duration-300 ease-out"
        style={{ transform: isOpen ? "translateX(0)" : "translateX(100%)" }}
      >
        {/* Header */}
        <div className="h-[48px] px-4 border-b border-obsidian-border flex items-center gap-3 flex-shrink-0">
          <MessageCircle className="w-4 h-4 text-obsidian-accent-primary" />
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm text-obsidian-text-primary tracking-tight">
              {persona?.name || "Anima"}
            </span>
            {persona?.description && (
              <span className="ml-2 text-xs text-obsidian-text-muted truncate">
                {persona.description}
              </span>
            )}
          </div>
          <select
            value={selectedModel || ""}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="obsidian-input text-xs py-1 px-2 max-w-[200px]"
            disabled={loading}
          >
            {availableModels.length > 0 ? (
              availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))
            ) : (
              <option value="gpt-5">GPT-5</option>
            )}
          </select>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-obsidian-bg rounded transition-colors"
          >
            <X className="w-4 h-4 text-obsidian-text-tertiary" />
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto obsidian-scrollbar p-4 space-y-3">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <MessageCircle className="w-8 h-8 text-obsidian-border mb-3 opacity-40" />
              <p className="text-sm text-obsidian-text-muted mb-1">
                Start a conversation with {persona?.name || "this anima"}
              </p>
              <p className="text-xs text-obsidian-text-tertiary">
                They will respond in the author's voice, grounded in their
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
                    ? "bg-obsidian-accent-pale text-obsidian-text-primary"
                    : "bg-obsidian-bg border border-obsidian-border text-obsidian-text-primary"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}

          {/* Streaming response */}
          {streamingContent && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed bg-obsidian-bg border border-obsidian-border text-obsidian-text-primary">
                <div className="whitespace-pre-wrap">
                  {streamingContent}
                  <span className="inline-block w-1.5 h-4 bg-obsidian-text-muted animate-pulse ml-0.5 align-text-bottom" />
                </div>
              </div>
            </div>
          )}

          {/* Loading indicator (before tokens arrive) */}
          {loading && !streamingContent && (
            <div className="flex justify-start">
              <div className="bg-obsidian-bg border border-obsidian-border rounded-lg px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-obsidian-text-muted animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-obsidian-text-muted animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-obsidian-text-muted animate-bounce"
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
        <div className="border-t border-obsidian-border p-3 flex-shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${persona?.name || "anima"}...`}
              rows={1}
              className="obsidian-input flex-1 resize-none text-sm py-2 px-3 max-h-32 overflow-y-auto"
              style={{
                height: "auto",
                minHeight: "36px",
              }}
              onInput={(e) => {
                e.target.style.height = "auto";
                e.target.style.height =
                  Math.min(e.target.scrollHeight, 128) + "px";
              }}
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="p-2 rounded bg-obsidian-accent-primary text-white hover:bg-obsidian-accent-primary/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
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
