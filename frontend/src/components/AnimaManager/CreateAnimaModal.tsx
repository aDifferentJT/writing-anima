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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="card bg-base-100 border border-base-300 shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-base-300">
          <h2 className="text-xl font-semibold text-base-content">
            Create New Anima
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-base-content/40 hover:text-base-content hover:bg-base-200 transition-colors rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-base-content mb-2">
              Anima Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="e.g., Hemingway, Academic Writer, Technical Documentation"
              className="input input-bordered w-full"
              maxLength={100}
              required
            />
            <p className="mt-1 text-xs text-base-content/40">
              Choose a descriptive name for this writing style
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-base-content mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
              placeholder="e.g., Short, direct sentences with minimal adjectives"
              className="textarea textarea-bordered w-full resize-none"
              rows={3}
              maxLength={500}
            />
            <p className="mt-1 text-xs text-base-content/40">
              Optional description of the writing style
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-base-content mb-2">
              Embedding Provider *
            </label>
            <select
              value={embeddingProvider ?? ""}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setEmbeddingProvider(e.target.value || null)
              }
              className="select select-bordered w-full"
            >
              <option value="" disabled>Select a provider...</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-sm"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
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
