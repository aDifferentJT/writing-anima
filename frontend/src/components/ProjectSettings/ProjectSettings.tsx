import React, { useState } from 'react';
import { Send, Plus, X } from 'lucide-react';
import type { Project, WritingCriteria } from '../../types';

interface ProjectSettingsProps {
  project: Project;
  onSubmit: (description: string, writing_criteria: WritingCriteria) => void;
}

const ProjectSettings: React.FC<ProjectSettingsProps> = ({ project, onSubmit }) => {
  const [description, setDescription] = useState(project.description);
  const [criteria, setCriteria] = useState<string[]>(project.writing_criteria?.criteria ?? []);
  const [newCriterion, setNewCriterion] = useState('');

  const handleSubmit = (): void => {
    if (!description.trim()) return;
    onSubmit(description, { criteria });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && e.ctrlKey) handleSubmit();
  };

  const addCriterion = (): void => {
    const trimmed = newCriterion.trim();
    if (!trimmed) return;
    setCriteria(prev => [...prev, trimmed]);
    setNewCriterion('');
  };

  const removeCriterion = (index: number): void => {
    setCriteria(prev => prev.filter((_, i) => i !== index));
  };

  const handleCriterionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') { e.preventDefault(); addCriterion(); }
  };

  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-4">

        {/* Description */}
        <div className="card bg-base-100 border border-base-300 p-4">
          <label className="block text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">
            Description
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your writing: what it's about, who it's for, what you're trying to achieve..."
            className="textarea textarea-bordered w-full h-28 resize-none obsidian-scrollbar text-sm"
            autoFocus
          />
        </div>

        {/* Writing Criteria */}
        <div className="card bg-base-100 border border-base-300 p-4">
          <label className="block text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">
            Evaluation Criteria
          </label>

          {criteria.length > 0 && (
            <ul className="space-y-1.5 mb-3">
              {criteria.map((c, i) => (
                <li key={i} className="flex items-start gap-2 group">
                  <span className="text-sm text-base-content/60 mt-0.5 select-none">·</span>
                  <span className="flex-1 text-sm text-base-content">{c}</span>
                  <button
                    onClick={() => removeCriterion(i)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-base-content/40 hover:text-error transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={newCriterion}
              onChange={e => setNewCriterion(e.target.value)}
              onKeyDown={handleCriterionKeyDown}
              placeholder="Add a criterion..."
              className="input input-bordered input-sm flex-1 text-sm"
            />
            <button
              onClick={addCriterion}
              disabled={!newCriterion.trim()}
              className="btn btn-sm btn-ghost"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-base-content/40">
            <kbd className="px-1.5 py-0.5 bg-base-200 rounded text-xs mono border border-base-300">Ctrl+Enter</kbd>
          </p>
          <button
            onClick={handleSubmit}
            disabled={!description.trim()}
            className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors ${
              !description.trim()
                ? 'text-base-content/40 cursor-not-allowed'
                : 'text-primary hover:bg-primary/10'
            }`}
          >
            <span>Continue</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
};

export default ProjectSettings;
