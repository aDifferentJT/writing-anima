/**
 * Anima Service
 * Handles all communication with the Writing-Anima backend
 */

import type {
  Persona,
  ModelInfo,
  StreamAnalysisCallbacks,
  StreamAnalysisContext,
  ChatCallbacks,
  ChatMessage,
  CorpusFile,
} from '../types';

const API_URL: string = import.meta.env.VITE_API_URL || "http://localhost:8000";
const WS_URL: string = import.meta.env.VITE_WS_URL || "ws://localhost:8000";

interface UploadCorpusResponse {
  message?: string;
  files_processed?: number;
  [key: string]: unknown;
}

interface IngestionStatusResponse {
  status?: string;
  [key: string]: unknown;
}

interface CorpusDocumentsResponse {
  files?: CorpusFile[];
  [key: string]: unknown;
}

interface HealthCheckResponse {
  status?: string;
  [key: string]: unknown;
}

interface PersonaUpdates {
  name?: string;
  description?: string;
  model?: string;
}

class AnimaService {
  /**
   * Analyze writing with streaming updates via WebSocket
   */
  async streamAnalysis(
    content: string,
    personaId: string,
    context: StreamAnalysisContext = {},
    callbacks: StreamAnalysisCallbacks = {},
  ): Promise<WebSocket> {
    const {
      onStatus = () => {},
      onFeedback = () => {},
      onComplete = () => {},
      onError = () => {},
    } = callbacks;

    return new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}/api/analyze/stream`);
      let feedbackReceived = 0;
      let completionReceived = false;

      ws.onopen = () => {
        console.log("WebSocket connected");

        // Send analysis request
        ws.send(
          JSON.stringify({
            content,
            persona_id: personaId,
            model: context.model,
            context: {
              purpose: context.purpose || null,
              criteria: context.criteria || [],
              feedback_history: context.feedbackHistory || [],
            },
            max_feedback_items: context.maxFeedbackItems || 10,
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
   * Get all personas for a user
   */
  async getPersonas(): Promise<Persona[]> {
    try {
      const response = await fetch(`${API_URL}/api/personas`);

      if (!response.ok) {
        throw new Error("Failed to fetch personas");
      }

      const data = await response.json();
      return data.personas || [];
    } catch (error) {
      console.error("Error fetching personas:", error);
      throw error;
    }
  }

  /**
   * Get a specific persona
   */
  async getPersona(personaId: string): Promise<Persona> {
    try {
      const response = await fetch(
        `${API_URL}/api/personas/${personaId}`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch persona");
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching persona:", error);
      throw error;
    }
  }

  /**
   * Get available models for persona selection
   */
  async getAvailableModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${API_URL}/api/personas/models`);

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
   * Create a new persona
   */
  async createPersona(name: string, description: string, model: string = "gpt-5"): Promise<Persona> {
    try {
      const response = await fetch(`${API_URL}/api/personas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
          model,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to create persona");
      }

      return await response.json();
    } catch (error) {
      console.error("Error creating persona:", error);
      throw error;
    }
  }

  /**
   * Update a persona's settings
   */
  async updatePersona(personaId: string, updates: PersonaUpdates): Promise<Persona> {
    try {
      const response = await fetch(
        `${API_URL}/api/personas/${personaId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updates),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to update persona");
      }

      return await response.json();
    } catch (error) {
      console.error("Error updating persona:", error);
      throw error;
    }
  }

  /**
   * Delete a persona
   */
  async deletePersona(personaId: string): Promise<void> {
    try {
      const response = await fetch(
        `${API_URL}/api/personas/${personaId}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error("Failed to delete persona");
      }
    } catch (error) {
      console.error("Error deleting persona:", error);
      throw error;
    }
  }

  /**
   * Upload corpus files for a persona
   */
  async uploadCorpus(personaId: string, files: FileList): Promise<UploadCorpusResponse> {
    try {
      const formData = new FormData();

      Array.from(files).forEach((file: File) => {
        formData.append("files", file);
      });

      const response = await fetch(
        `${API_URL}/api/personas/${personaId}/corpus`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Upload failed");
      }

      return await response.json();
    } catch (error) {
      console.error("Error uploading corpus:", error);
      throw error;
    }
  }

  /**
   * Get corpus ingestion status
   */
  async getIngestionStatus(personaId: string): Promise<IngestionStatusResponse> {
    try {
      const response = await fetch(
        `${API_URL}/api/personas/${personaId}/corpus/status`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch ingestion status");
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching ingestion status:", error);
      throw error;
    }
  }

  /**
   * Get all corpus documents for a persona, grouped by source file
   */
  async getCorpusDocuments(personaId: string): Promise<CorpusDocumentsResponse> {
    try {
      const response = await fetch(
        `${API_URL}/api/personas/${personaId}/corpus/documents`,
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
   * Chat with a persona using streaming WebSocket
   */
  streamChat(
    message: string,
    personaId: string,
    conversationHistory: ChatMessage[],
    callbacks: ChatCallbacks,
    model: string,
  ): Promise<WebSocket> {
    const {
      onToken = () => {},
      onStatus = () => {},
      onComplete = () => {},
      onError = () => {},
    } = callbacks;

    return new Promise<WebSocket>((resolve) => {
      const ws = new WebSocket(`${WS_URL}/api/chat/stream`);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            message,
            persona_id: personaId,
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
              onStatus(data.message);
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
