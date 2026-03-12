import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  FileText,
  AlertCircle,
  Pencil,
  Trash2,
  Search,
  AlertTriangle,
} from "lucide-react";
import CreatePersonaModal from "./CreatePersonaModal";
import CorpusUploadModal from "./CorpusUploadModal";
import AnimaChat from "../AnimaChat/AnimaChat";

const PersonaManager = () => {
  const [personas, setPersonas] = useState([]);
  const [selectedPersona, setSelectedPersona] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("created");

  const loadPersonas = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";
      const response = await fetch(
        `${API_URL}/api/personas`,
      );

      if (!response.ok) {
        throw new Error("Failed to load animas");
      }

      const data = await response.json();
      console.log("Loaded animas:", data.personas);
      setPersonas(data.personas || []);
    } catch (err) {
      console.error("Error loading animas:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPersonas();
  }, [loadPersonas]);

  const handleCreatePersona = async (personaData) => {
    try {
      const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";
      const response = await fetch(`${API_URL}/api/personas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...personaData,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create anima");
      }

      const newPersona = await response.json();
      setPersonas((prev) => [...prev, newPersona]);
      setShowCreateModal(false);

      // Automatically open upload modal for new anima
      setSelectedPersona(newPersona);
      setShowUploadModal(true);
    } catch (err) {
      console.error("Error creating anima:", err);
      alert("Failed to create anima: " + err.message);
    }
  };

  const handleDeletePersona = async (personaId, e) => {
    e.stopPropagation();

    if (
      !window.confirm(
        "Are you sure you want to delete this anima? This will remove all corpus files.",
      )
    ) {
      return;
    }

    try {
      const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";
      const response = await fetch(
        `${API_URL}/api/personas/${personaId}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error("Failed to delete anima");
      }

      setPersonas((prev) => prev.filter((p) => p.id !== personaId));
      if (selectedPersona?.id === personaId) {
        setSelectedPersona(null);
      }
    } catch (err) {
      console.error("Error deleting anima:", err);
      alert("Failed to delete anima: " + err.message);
    }
  };

  const handleUploadCorpus = (persona, e) => {
    e.stopPropagation();
    setSelectedPersona(persona);
    setShowUploadModal(true);
  };

  const handleOpenChat = (persona) => {
    setSelectedPersona(persona);
    setShowChat(true);
  };

  const handleCorpusUploaded = () => {
    // Refresh personas to update chunk counts
    loadPersonas();
    setShowUploadModal(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Unknown";

    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));

    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    if (diffInMinutes < 10080)
      return `${Math.floor(diffInMinutes / 1440)}d ago`;

    return date.toLocaleDateString();
  };

  const filteredAndSortedPersonas = personas
    .filter(
      (persona) =>
        persona.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (persona.description || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase()),
    )
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "chunks":
          return (b.chunk_count || 0) - (a.chunk_count || 0);
        case "created":
        default:
          return new Date(b.created_at) - new Date(a.created_at);
      }
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-obsidian-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-obsidian-accent-primary mx-auto mb-2"></div>
          <p className="text-xs text-obsidian-text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-obsidian-bg overflow-auto">
      <div className="mx-auto px-2 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-obsidian-text-primary">
                Animas
              </h1>
              <p className="text-xs text-obsidian-text-muted mt-0.5 mono">
                {personas.length} total
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="obsidian-button-primary flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>New</span>
            </button>
          </div>

          {/* Search and Controls */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-obsidian-text-muted w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="obsidian-input w-full pl-8 pr-3"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="obsidian-input"
            >
              <option value="created">Recent</option>
              <option value="name">Name</option>
              <option value="chunks">Size</option>
            </select>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2 mt-3 bg-red-50/50 border border-red-300 rounded text-xs text-red-700">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Animas List */}
        {filteredAndSortedPersonas.length === 0 ? (
          <div className="obsidian-panel p-12 text-center max-w-lg mx-auto">
            <FileText className="w-8 h-8 text-obsidian-border mx-auto mb-3 opacity-40" />
            <h3 className="text-sm font-semibold text-obsidian-text-primary mb-1">
              {searchTerm ? "No matches" : "No animas"}
            </h3>
            <p className="text-xs text-obsidian-text-muted mb-4">
              {searchTerm
                ? "Try different search terms"
                : "Create an anima from writing samples"}
            </p>
            {!searchTerm && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="obsidian-button-primary inline-flex items-center gap-1.5 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Anima</span>
              </button>
            )}
          </div>
        ) : (
          <div className="obsidian-panel overflow-hidden">
            <table className="w-full">
              <thead className="bg-obsidian-bg border-b border-obsidian-border">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-obsidian-text-tertiary uppercase tracking-wide">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-obsidian-text-tertiary uppercase tracking-wide">
                    Description
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-obsidian-text-tertiary uppercase tracking-wide">
                    Created
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-obsidian-text-tertiary uppercase tracking-wide">
                    Chunks
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-obsidian-text-tertiary uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-obsidian-border">
                {filteredAndSortedPersonas.map((persona) => (
                  <tr
                    key={persona.id}
                    onClick={() => handleOpenChat(persona)}
                    className={`hover:bg-obsidian-bg cursor-pointer transition-colors group ${
                      persona.corpus_available === false ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-obsidian-text-primary">
                          {persona.name}
                        </span>
                        {persona.corpus_available === false && (
                          <span title="Corpus unavailable - re-upload required">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs text-obsidian-text-secondary max-w-md truncate">
                        {persona.corpus_available === false
                          ? "Corpus unavailable - click to re-upload"
                          : persona.description || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs text-obsidian-text-tertiary mono">
                        {formatDate(persona.created_at)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs text-obsidian-text-tertiary mono">
                        {(persona.chunk_count || 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleUploadCorpus(persona, e)}
                          className="p-1 text-obsidian-text-muted hover:text-obsidian-accent-primary hover:bg-obsidian-accent-pale rounded transition-colors"
                          title="Edit corpus"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeletePersona(persona.id, e)}
                          className="p-1 text-obsidian-text-muted hover:text-red-600 hover:bg-red-50/50 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modals */}
        <CreatePersonaModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreatePersona}
        />

        {selectedPersona && (
          <CorpusUploadModal
            isOpen={showUploadModal}
            onClose={() => {
              setShowUploadModal(false);
              setSelectedPersona(null);
            }}
            persona={selectedPersona}
            onUploaded={handleCorpusUploaded}
          />
        )}

        <AnimaChat
          isOpen={showChat}
          onClose={() => {
            setShowChat(false);
            setSelectedPersona(null);
          }}
          persona={selectedPersona}
        />
      </div>
    </div>
  );
};

export default PersonaManager;
