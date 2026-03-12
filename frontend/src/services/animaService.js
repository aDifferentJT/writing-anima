/**
 * Anima Service
 * Handles all communication with the Writing-Anima backend
 */

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";
const WS_URL = process.env.REACT_APP_WS_URL || "ws://localhost:8000";

class AnimaService {
  /**
   * Analyze writing with streaming updates via WebSocket
   * @param {string} content - The writing content to analyze
   * @param {string} personaId - ID of the persona to use
   * @param {object} context - Optional context (purpose, criteria, history)
   * @param {function} onStatus - Callback for status updates
   * @param {function} onFeedback - Callback for feedback items
   * @param {function} onComplete - Callback when analysis completes
   * @param {function} onError - Callback for errors
   * @returns {Promise<WebSocket>} WebSocket connection
   */
  async streamAnalysis(
    content,
    personaId,
    context = {},
    callbacks = {},
  ) {
    const {
      onStatus = () => {},
      onFeedback = () => {},
      onComplete = () => {},
      onError = () => {},
    } = callbacks;

    return new Promise((resolve, reject) => {
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

      ws.onmessage = (event) => {
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
          onError(error);
        }
      };

      ws.onerror = (error) => {
        console.error(
          "WebSocket error (may be transient during AI processing):",
          error,
        );
        // Don't immediately report errors - wait for onclose to determine if it's a real failure
        // This prevents premature error alerts during long AI inference
      };

      ws.onclose = (event) => {
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
   * @returns {Promise<Array>} List of personas
   */
  async getPersonas() {
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
   * @param {string} personaId - Persona ID
   * @returns {Promise<object>} Persona details
   */
  async getPersona(personaId) {
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
   * @returns {Promise<Array>} List of available models
   */
  async getAvailableModels() {
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
   * @param {string} name - Persona name
   * @param {string} description - Persona description
   * @param {string} model - Model ID to use for this persona
   * @returns {Promise<object>} Created persona
   */
  async createPersona(name, description, model = "gpt-5") {
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
   * @param {string} personaId - Persona ID
   * @param {object} updates - Fields to update (name, description, model)
   * @returns {Promise<object>} Updated persona
   */
  async updatePersona(personaId, updates) {
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
   * @param {string} personaId - Persona ID
   * @returns {Promise<void>}
   */
  async deletePersona(personaId) {
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
   * @param {string} personaId - Persona ID
   * @param {FileList} files - Files to upload
   * @returns {Promise<object>} Upload response
   */
  async uploadCorpus(personaId, files) {
    try {
      const formData = new FormData();

      Array.from(files).forEach((file) => {
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
   * @param {string} personaId - Persona ID
   * @returns {Promise<object>} Ingestion status
   */
  async getIngestionStatus(personaId) {
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
   * @param {string} personaId - Persona ID
   * @returns {Promise<object>} Corpus documents response with files array
   */
  async getCorpusDocuments(personaId) {
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
   * @param {string} message - User's message
   * @param {string} personaId - Persona ID
   * @param {Array} conversationHistory - Previous messages [{role, content}]
   * @param {object} callbacks - { onToken, onStatus, onComplete, onError }
   * @param {string} model - Model to use
   * @returns {Promise<WebSocket>} WebSocket connection
   */
  streamChat(
    message,
    personaId,
    conversationHistory,
    callbacks,
    model,
  ) {
    const {
      onToken = () => {},
      onStatus = () => {},
      onComplete = () => {},
      onError = () => {},
    } = callbacks;

    return new Promise((resolve, reject) => {
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

      ws.onmessage = (event) => {
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

      ws.onerror = (error) => {
        console.error("Chat WebSocket error:", error);
      };

      ws.onclose = (event) => {
        if (event.code !== 1000 && event.code !== 1005) {
          onError(new Error("Connection closed unexpectedly"));
        }
      };
    });
  }

  /**
   * Check if backend is healthy
   * @returns {Promise<object>} Health status
   */
  async healthCheck() {
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
