import React, { useState } from 'react';
import { Send } from 'lucide-react';
import type { Project } from '../../types';

interface ProjectSettingsProps {
  project: Project;
  onSubmit: (name: string, description: string) => void;
}

const ProjectSettings: React.FC<ProjectSettingsProps> = ({ project, onSubmit }) => {
  const [name, setName] = useState(project.title === 'New Project' ? '' : project.title);
  const [description, setDescription] = useState(project.description);

  const handleSubmit = (): void => {
    if (!description.trim()) return;
    onSubmit(name.trim() || 'Untitled Project', description);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && e.ctrlKey) handleSubmit();
  };

  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-4">

        {/* Name */}
        <div className="card bg-base-100 border border-base-300 p-4">
          <label className="block text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Give your project a name..."
            className="input input-bordered w-full text-sm"
            autoFocus
          />
        </div>

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
          />
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
            <span>Continue to Editor</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
};

export default ProjectSettings;
