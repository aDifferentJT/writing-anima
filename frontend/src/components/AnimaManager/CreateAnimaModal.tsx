import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import animaService from "../../services/animaService";
import type { EmbeddingProviderInfo } from "../../apiTypes";

interface AnimaCreateData {
  name: string;
  description: string | null;
  embeddingProvider: string;
}

interface CreateAnimaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: AnimaCreateData) => Promise<void>;
}

const CreateAnimaModal: React.FC<CreateAnimaModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [embeddingProvider, setEmbeddingProvider] = useState<string | null>(null);
  const [providers, setProviders] = useState<EmbeddingProviderInfo[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    animaService.getEmbeddingProviders().then(setProviders);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    if (!name.trim()) {
      alert("Please enter an anima name");
      return;
    }

    if (!embeddingProvider) {
      alert("Please select an embedding provider");
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || null,
        embeddingProvider: embeddingProvider!,
      });
    } catch (error) {
      console.error("Error creating anima:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-obsidian-surface border border-obsidian-border shadow-obsidian-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-obsidian-border">
          <h2 className="text-xl font-semibold text-obsidian-text-primary">
            Create New Anima
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-obsidian-text-muted hover:text-obsidian-text-primary hover:bg-obsidian-bg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-obsidian-text-primary mb-2">
              Anima Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="e.g., Hemingway, Academic Writer, Technical Documentation"
              className="w-full px-4 py-2 bg-obsidian-bg border border-obsidian-border text-obsidian-text-primary placeholder-obsidian-text-muted focus:outline-none focus:border-obsidian-accent-primary"
              maxLength={100}
              required
            />
            <p className="mt-1 text-xs text-obsidian-text-muted">
              Choose a descriptive name for this writing style
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-obsidian-text-primary mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
              placeholder="e.g., Short, direct sentences with minimal adjectives"
              className="w-full px-4 py-2 bg-obsidian-bg border border-obsidian-border text-obsidian-text-primary placeholder-obsidian-text-muted focus:outline-none focus:border-obsidian-accent-primary resize-none"
              rows={3}
              maxLength={500}
            />
            <p className="mt-1 text-xs text-obsidian-text-muted">
              Optional description of the writing style
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-obsidian-text-primary mb-2">
              Embedding Provider *
            </label>
            <select
              value={embeddingProvider ?? ""}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setEmbeddingProvider(e.target.value || null)
              }
              className="w-full px-4 py-2 bg-obsidian-bg border border-obsidian-border text-obsidian-text-primary focus:outline-none focus:border-obsidian-accent-primary"
            >
              <option value="" disabled>Select a provider...</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-obsidian-text-muted">
              Must match the provider used when uploading corpus
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-obsidian-text-secondary bg-obsidian-bg border border-obsidian-border hover:bg-obsidian-border transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-obsidian-accent-primary text-white hover:bg-obsidian-accent-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Create Anima"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateAnimaModal;
