import React from 'react';
import { Send } from 'lucide-react';
import { Purpose } from '../../types';

interface PurposeStepProps {
  purpose: Purpose;
  setPurpose: (purpose: Purpose) => void;
  onSubmit: (purpose: Purpose) => void;
}

const PurposeStep: React.FC<PurposeStepProps> = ({ purpose, setPurpose, onSubmit }) => {
  const handleSubmit = (): void => {
    if (!purpose.topic.trim()) return;
    onSubmit(purpose);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center p-2">
      <div className="max-w-2xl w-full">
        <div className="mb-8">

        </div>

        <div className="card bg-base-100 border border-base-300 p-4">
          <div className="space-y-4">
            <div>
              <textarea
                value={purpose.topic}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setPurpose({ ...purpose, topic: e.target.value })
                }
                onKeyDown={handleKeyDown}
                placeholder="What are you writing about?"
                className="textarea textarea-bordered w-full h-20 resize-none obsidian-scrollbar text-sm"
              />
            </div>

            <div>
              <textarea
                value={purpose.context}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setPurpose({ ...purpose, context: e.target.value })
                }
                onKeyDown={handleKeyDown}
                placeholder="Who's your audience? What's the setting?"
                className="textarea textarea-bordered w-full h-20 resize-none obsidian-scrollbar text-sm"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-base-content/40">
              <kbd className="px-1.5 py-0.5 bg-base-200 rounded text-xs mono border border-base-300">Ctrl+Enter</kbd>
            </p>
            <button
              onClick={handleSubmit}
              disabled={!purpose.topic.trim()}
              className={`p-2 rounded transition-colors ${
                !purpose.topic.trim()
                  ? 'text-base-content/40 cursor-not-allowed'
                  : 'text-primary hover:bg-primary/10'
              }`}
              title="Continue to editor"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurposeStep;
