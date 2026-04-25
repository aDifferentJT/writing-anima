/**
 * Anima Service
 * Handles all communication with the Writing-Anima backend
 */

import type {
  Anima,
  ModelInfo,
  ChatMessage,
  CompleteMessage,
  CorpusFile,
  ReceivedFeedbackItem,
  StatusMessage,
} from '../types';

import type { CorpusUploadMessage, EmbeddingProviderInfo } from '../apiTypes';
import { websocketStream } from './websocketStream';

const API_URL: string = import.meta.env.VITE_API_URL || window.location.origin;
const WS_URL: string = import.meta.env.VITE_WS_URL ||
  window.location.origin.replace(/^http/, "ws");

interface CorpusDocumentsResponse {
  files?: CorpusFile[];
  [key: string]: unknown;
}

interface HealthCheckResponse {
  status?: string;
  [key: string]: unknown;
}

interface StreamAnalysisContext {
  description: string;
  model: string;
}

interface StreamAnalysisCallbacks {
  onStatus: (status: StatusMessage) => void;
  onFeedback: (item: ReceivedFeedbackItem) => void;
  onComplete: (result: CompleteMessage) => void;
  onError: (error: Error) => void;
}

export interface ChatCallbacks {
  onToken: (token: string) => void;
  onComplete: (response: string) => void;
  onError: (error: Error) => void;
}

class AnimaService {
  /**
   * Analyze writing with streaming updates via WebSocket
   */
  async analysis(
    content: string,
    animaId: string,
    context: StreamAnalysisContext,
    callbacks: StreamAnalysisCallbacks,
  ): Promise<WebSocket> {
    const {
      onStatus,
      onFeedback,
      onComplete,
      onError,
    } = callbacks;

    return new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}/api/analyze`);
      let feedbackReceived = 0;
      let completionReceived = false;

      ws.onopen = () => {
        console.log("WebSocket connected");

        // Send analysis request
        ws.send(
          JSON.stringify({
            content,
            anima_id: animaId,
            model: context.model,
            context: {
              description: context.description || null,
            },
          }),
        );

        resolve(ws);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data);

          switch (message.type) {
            case "status":
              onStatus(message);
              break;

            case "feedback":
              feedbackReceived++;
              onFeedback(message.item);
              break;

            case "complete":
              completionReceived = true;
              onComplete(message);
              ws.close();
              break;

            case "error":
              onError(new Error(message.message || "Analysis failed"));
              ws.close();
              break;

            default:
              console.warn("Unknown message type:", message.type);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
          onError(error as Error);
        }
      };

      ws.onerror = (error: Event) => {
        console.error(
          "WebSocket error (may be transient during AI processing):",
          error,
        );
        // Don't immediately report errors - wait for onclose to determine if it's a real failure
        // This prevents premature error alerts during long AI inference
      };

      ws.onclose = (event: CloseEvent) => {
        console.log("WebSocket closed", {
          code: event.code,
          reason: event.reason,
        });

        // If we got feedback but no completion message, treat as partial success
        if (feedbackReceived > 0 && !completionReceived) {
          console.log(
            `Stream closed after ${feedbackReceived} items without completion message`,
          );
          onComplete({
            total_items: feedbackReceived,
            processing_time: 0,
            partial: true,
          });
        }
        // Only report error if connection closed abnormally with NO feedback received
        else if (feedbackReceived === 0 && event.code !== 1000) {
          console.error("WebSocket closed without receiving any feedback");
          onError(
            new Error(
              "Connection closed without receiving feedback. Backend may be down.",
            ),
          );
          reject(new Error("Connection failed"));
        }
      };
    });
  }

  /**
   * Subscribe to live anima list updates via WebSocket.
   * Yields the full anima list on connect and after every mutation.
   * The generator closes cleanly when the caller calls .return() (e.g. on unmount).
   */
  async *watchAnimas(): AsyncGenerator<Anima[]> {
    yield* websocketStream<Anima[]>(
      `${WS_URL}/api/animas/subscribe`,
      (data, push) => push((data as { animas?: Anima[] }).animas ?? []),
    );
  }

  /**
   * Get all animas for a user
   */
  async getAnimas(): Promise<Anima[]> {
    try {
      const response = await fetch(`${API_URL}/api/animas`);

      if (!response.ok) {
        throw new Error("Failed to fetch animas");
      }

      const data = await response.json();
      return data.animas || [];
    } catch (error) {
      console.error("Error fetching animas:", error);
      throw error;
    }
  }

  /**
   * Get a specific anima
   */
  async getAnima(animaId: string): Promise<Anima> {
    try {
      const response = await fetch(
        `${API_URL}/api/animas/${animaId}`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch anima");
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching anima:", error);
      throw error;
    }
  }

  /**
   * Get available models for anima selection
   */
  async getAvailableModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${API_URL}/api/animas/models`);

      if (!response.ok) {
        throw new Error("Failed to fetch available models");
      }

      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error("Error fetching available models:", error);
      throw error;
    }
  }

  /**
   * Get available embedding providers
   */
  async getEmbeddingProviders(): Promise<EmbeddingProviderInfo[]> {
    try {
      const response = await fetch(`${API_URL}/api/animas/embedding-providers`);
      if (!response.ok) throw new Error("Failed to fetch embedding providers");
      const data = await response.json();
      return data.providers || [];
    } catch (error) {
      console.error("Error fetching embedding providers:", error);
      throw error;
    }
  }

  /**
   * Create a new anima
   */
  async createAnima(name: string, description: string, embeddingProvider: string): Promise<Anima> {
    try {
      const response = await fetch(`${API_URL}/api/animas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
          embedding_provider: embeddingProvider,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to create anima");
      }

      return await response.json();
    } catch (error) {
      console.error("Error creating anima:", error);
      throw error;
    }
  }

  /**
   * Delete an anima
   */
  async deleteAnima(animaId: string): Promise<void> {
    try {
      const response = await fetch(
        `${API_URL}/api/animas/${animaId}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error("Failed to delete anima");
      }
    } catch (error) {
      console.error("Error deleting anima:", error);
      throw error;
    }
  }

  /**
   * Upload corpus files for an anima via WebSocket.
   * Yields status messages during processing and a final complete message.
   * Throws on error.
   */
  async *uploadCorpus(
    animaId: string,
    files: File[],
    corpusConfig?: { chunk_size?: number; chunk_overlap?: number; min_chunk_length?: number },
  ): AsyncGenerator<CorpusUploadMessage> {
    const toBase64 = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

    yield* websocketStream<CorpusUploadMessage>(
      `${WS_URL}/api/animas/${animaId}/corpus`,
      (data, push, close, error) => {
        const msg = data as CorpusUploadMessage;
        if (msg.type === "error") {
          error(new Error(msg.message || "Upload failed"));
        } else {
          push(msg);
          if (msg.type === "complete") close();
        }
      },
      async (send) => {
        const filesData = await Promise.all(
          files.map(async (file: File) => ({
            name: file.name,
            size: file.size,
            content: await toBase64(file),
          })),
        );
        send(JSON.stringify({ files: filesData, corpus_config: corpusConfig ?? {} }));
      },
    );
  }

  /**
   * Get all corpus documents for an anima, grouped by source file
   */
  async getCorpusDocuments(animaId: string): Promise<CorpusDocumentsResponse> {
    try {
      const response = await fetch(
        `${API_URL}/api/animas/${animaId}/corpus/documents`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch corpus documents");
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching corpus documents:", error);
      throw error;
    }
  }

  /**
   * Chat with an anima using streaming WebSocket
   */
  chat(
    message: string,
    animaId: string,
    conversationHistory: ChatMessage[],
    callbacks: ChatCallbacks,
    model: string,
  ): Promise<WebSocket> {
    const {
      onToken = () => {},
      onComplete = () => {},
      onError = () => {},
    } = callbacks;

    return new Promise<WebSocket>((resolve) => {
      const ws = new WebSocket(`${WS_URL}/api/chat`);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            message,
            anima_id: animaId,
            conversation_history: conversationHistory,
            model,
          }),
        );
        resolve(ws);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case "token":
              onToken(data.content);
              break;
            case "status":
              // TODO unused onStatus(data.message);
              break;
            case "complete":
              onComplete(data.response);
              ws.close();
              break;
            case "error":
              onError(new Error(data.message || "Chat failed"));
              ws.close();
              break;
            default:
              break;
          }
        } catch (err) {
          console.error("Error parsing chat stream message:", err);
        }
      };

      ws.onerror = (error: Event) => {
        console.error("Chat WebSocket error:", error);
      };

      ws.onclose = (event: CloseEvent) => {
        if (event.code !== 1000 && event.code !== 1005) {
          onError(new Error("Connection closed unexpectedly"));
        }
      };
    });
  }

  /**
   * Check if backend is healthy
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    try {
      const response = await fetch(`${API_URL}/api/health`);

      if (!response.ok) {
        throw new Error("Backend is unhealthy");
      }

      return await response.json();
    } catch (error) {
      console.error("Health check failed:", error);
      throw error;
    }
  }
}

// Export singleton instance
const animaService = new AnimaService();
export default animaService;
