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
import CreateAnimaModal from "./CreateAnimaModal";
import CorpusUploadModal from "./CorpusUploadModal";
import AnimaChat from "../AnimaChat/AnimaChat";
import animaService from "../../services/animaService";
import type { Anima } from "../../types";

interface AnimaCreateData {
  name: string;
  description: string | null;
  embeddingProvider: string;
}

const AnimaManager: React.FC = () => {
  const [animas, setAnimas] = useState<Anima[]>([]);
  const [selectedAnima, setSelectedAnima] = useState<Anima | null>(null);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [showChat, setShowChat] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("created");

  const loadAnimas = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await animaService.getAnimas();
      console.log("Loaded animas:", data);
      setAnimas(data);
    } catch (err: unknown) {
      console.error("Error loading animas:", err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnimas();
  }, [loadAnimas]);

  const handleCreateAnima = async (animaData: AnimaCreateData) => {
    try {
      const newAnima = await animaService.createAnima(
        animaData.name,
        animaData.description ?? "",
        animaData.embeddingProvider,
      );
      setAnimas((prev) => [...prev, newAnima]);
      setShowCreateModal(false);

      // Automatically open upload modal for new anima
      setSelectedAnima(newAnima);
      setShowUploadModal(true);
    } catch (err: unknown) {
      console.error("Error creating anima:", err);
      alert("Failed to create anima: " + (err as Error).message);
    }
  };

  const handleDeleteAnima = async (animaId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (
      !window.confirm(
        "Are you sure you want to delete this anima? This will remove all corpus files.",
      )
    ) {
      return;
    }

    try {
      await animaService.deleteAnima(animaId);
      setAnimas((prev) => prev.filter((a) => a.id !== animaId));
      if (selectedAnima?.id === animaId) {
        setSelectedAnima(null);
      }
    } catch (err: unknown) {
      console.error("Error deleting anima:", err);
      alert("Failed to delete anima: " + (err as Error).message);
    }
  };

  const handleUploadCorpus = (anima: Anima, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedAnima(anima);
    setShowUploadModal(true);
  };

  const handleOpenChat = (anima: Anima) => {
    setSelectedAnima(anima);
    setShowChat(true);
  };

  const handleCorpusUploaded = () => {
    // Refresh animas to update chunk counts
    loadAnimas();
    setShowUploadModal(false);
  };

  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return "Unknown";

    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    if (diffInMinutes < 10080)
      return `${Math.floor(diffInMinutes / 1440)}d ago`;

    return date.toLocaleDateString();
  };

  const filteredAndSortedAnimas = animas
    .filter(
      (anima) =>
        anima.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (anima.description || "")
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
          return new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime();
      }
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-base-200">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-xs text-base-content/40">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-base-200 overflow-auto">
      <div className="mx-auto px-2 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-base-content">
                Animas
              </h1>
              <p className="text-xs text-base-content/40 mt-0.5 mono">
                {animas.length} total
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary btn-sm flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>New</span>
            </button>
          </div>

          {/* Search and Controls */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-base-content/40 w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                className="input input-bordered input-sm w-full pl-8 pr-3"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSortBy(e.target.value)}
              className="select select-bordered select-sm"
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
        {filteredAndSortedAnimas.length === 0 ? (
          <div className="card bg-base-100 border border-base-300 p-12 text-center max-w-lg mx-auto">
            <FileText className="w-8 h-8 text-base-300 mx-auto mb-3 opacity-40" />
            <h3 className="text-sm font-semibold text-base-content mb-1">
              {searchTerm ? "No matches" : "No animas"}
            </h3>
            <p className="text-xs text-base-content/40 mb-4">
              {searchTerm
                ? "Try different search terms"
                : "Create an anima from writing samples"}
            </p>
            {!searchTerm && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Anima</span>
              </button>
            )}
          </div>
        ) : (
          <div className="card bg-base-100 border border-base-300 overflow-hidden">
            <table className="w-full">
              <thead className="bg-base-200 border-b border-base-300">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-base-content/50 uppercase tracking-wide">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-base-content/50 uppercase tracking-wide">
                    Description
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-base-content/50 uppercase tracking-wide">
                    Created
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-base-content/50 uppercase tracking-wide">
                    Chunks
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-base-content/50 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-300">
                {filteredAndSortedAnimas.map((anima) => (
                  <tr
                    key={anima.id}
                    onClick={() => handleOpenChat(anima)}
                    className={`hover:bg-base-200 cursor-pointer transition-colors group ${
                      anima.corpus_available === false ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-base-content">
                          {anima.name}
                        </span>
                        {anima.corpus_available === false && (
                          <span title="Corpus unavailable - re-upload required">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs text-base-content/70 max-w-md truncate">
                        {anima.corpus_available === false
                          ? "Corpus unavailable - click to re-upload"
                          : anima.description || "\u2014"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs text-base-content/50 mono">
                        {formatDate(anima.created_at)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs text-base-content/50 mono">
                        {(anima.chunk_count || 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e: React.MouseEvent) => handleUploadCorpus(anima, e)}
                          className="p-1 text-base-content/40 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                          title="Edit corpus"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e: React.MouseEvent) => handleDeleteAnima(anima.id, e)}
                          className="p-1 text-base-content/40 hover:text-red-600 hover:bg-red-50/50 rounded transition-colors"
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
        <CreateAnimaModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateAnima}
        />

        {selectedAnima && (
          <CorpusUploadModal
            isOpen={showUploadModal}
            onClose={() => {
              setShowUploadModal(false);
              setSelectedAnima(null);
            }}
            anima={selectedAnima}
            onUploaded={handleCorpusUploaded}
          />
        )}

        <AnimaChat
          isOpen={showChat}
          onClose={() => {
            setShowChat(false);
            setSelectedAnima(null);
          }}
          anima={selectedAnima}
        />
      </div>
    </div>
  );
};

export default AnimaManager;
