import React, { useRef, useEffect, useImperativeHandle } from 'react';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';
export interface WritingAreaHandle {
  selectText: (text: string) => void;
}

interface WritingAreaProps {
  content: string;
  onContentChange: (value: string) => void;
  ref?: React.Ref<WritingAreaHandle>;
}

const WritingArea: React.FC<WritingAreaProps> = ({ content, onContentChange, ref }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cycleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get textarea reference after MDEditor mounts
  useEffect(() => {
    if (editorRef.current) {
      const textarea = editorRef.current.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement | null;
      if (textarea) {
        textareaRef.current = textarea;
      }
    }
  }, []);

  useImperativeHandle(ref, () => ({
    selectText(text: string) {
      const textarea = textareaRef.current
        ?? (editorRef.current?.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement | null);
      if (!textarea) return;
      const start = textarea.value.indexOf(text);
      if (start === -1) return;
      textarea.focus();
      textarea.setSelectionRange(start, start + text.length);
      // Scroll the selection into view
      const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
      const lines = textarea.value.substring(0, start).split('\n').length;
      textarea.scrollTop = (lines - 3) * lineHeight;
    },
  }));

  // Auto-scroll to highlighted feedback when hovered
  // TODO does this do anything now?
  useEffect(() => {
    if (cycleIntervalRef.current) {
      clearInterval(cycleIntervalRef.current);
      cycleIntervalRef.current = null;
    }

    return () => {
      if (cycleIntervalRef.current) {
        clearInterval(cycleIntervalRef.current);
        cycleIntervalRef.current = null;
      }
    };
  }, [content]);

  useEffect(() => {
    if (editorRef.current) {
      const textarea = editorRef.current.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement | null;
      if (textarea) {
        textarea.focus();
      }
    }
  }, []); // TODO should this be an effect?

  return (
    <div className="card bg-base-100 border border-base-300 h-[calc(100vh-180px)]">
      <div className="h-[36px] px-3 border-b border-base-300 flex items-center">
        <h2 className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">Editor</h2>
      </div>

      <div className="relative h-[calc(100%-36px)]" data-color-mode="dark" ref={editorRef}>
        <MDEditor
          value={content}
          onChange={(val) => onContentChange(val ?? '')}
          height="100%"
          preview="edit"
          hideToolbar={false}
          visibleDragbar={false}
          style={{
            background: 'var(--obsidian-surface)',
            border: 'none',
            fontSize: '15px'
          }}
          textareaProps={{
            placeholder: 'Start writing...'
          }}
          previewOptions={{
            style: {
              fontSize: '15px',
              lineHeight: '1.6',
              background: 'var(--obsidian-surface)',
              color: 'var(--obsidian-text-primary)'
            }
          }}
        />

        {/* Obsidian theme customization for markdown editor */}
        <style>{`
          .w-md-editor {
            background: var(--obsidian-surface) !important;
            color: var(--obsidian-text-primary) !important;
            border: none !important;
          }

          .w-md-editor-toolbar {
            background: var(--obsidian-bg) !important;
            border-bottom: 1px solid var(--obsidian-border) !important;
            padding: 4px 8px !important;
          }

          .w-md-editor-toolbar button {
            color: var(--obsidian-text-secondary) !important;
            opacity: 0.7;
            transition: opacity 0.2s;
          }

          .w-md-editor-toolbar button:hover {
            background: var(--obsidian-accent-pale) !important;
            color: var(--obsidian-accent-primary) !important;
            opacity: 1;
          }

          /* Hide fullscreen button */
          .w-md-editor-toolbar button[aria-label*="fullscreen"],
          .w-md-editor-toolbar button[data-name="fullscreen"] {
            display: none !important;
          }

          /* Make vertical divider reach the top */
          .w-md-editor-area {
            height: 100% !important;
          }

          .w-md-editor-preview {
            border-left: 1px solid var(--obsidian-border) !important;
            height: 100% !important;
          }

          .w-md-editor-text-pre,
          .w-md-editor-text-input {
            background: var(--obsidian-surface) !important;
            color: var(--obsidian-text-primary) !important;
          }

          .w-md-editor-preview {
            background: var(--obsidian-surface) !important;
            color: var(--obsidian-text-primary) !important;
            padding: 16px !important;
          }

          .wmde-markdown {
            background: var(--obsidian-surface) !important;
            color: var(--obsidian-text-primary) !important;
          }

          .wmde-markdown h1,
          .wmde-markdown h2,
          .wmde-markdown h3,
          .wmde-markdown h4,
          .wmde-markdown h5,
          .wmde-markdown h6 {
            color: var(--obsidian-text-primary) !important;
            border-bottom-color: var(--obsidian-border) !important;
          }

          .wmde-markdown a {
            color: var(--obsidian-accent-primary) !important;
          }

          .wmde-markdown code {
            background: var(--obsidian-bg) !important;
            color: var(--obsidian-accent-primary) !important;
            border: 1px solid var(--obsidian-border) !important;
          }

          .wmde-markdown pre {
            background: var(--obsidian-bg) !important;
            border: 1px solid var(--obsidian-border) !important;
          }

          .wmde-markdown blockquote {
            border-left-color: var(--obsidian-accent-primary) !important;
            color: var(--obsidian-text-secondary) !important;
          }

          /* Scrollbar styling */
          .w-md-editor-text,
          .w-md-editor-preview {
            scrollbar-width: thin;
            scrollbar-color: var(--obsidian-border) var(--obsidian-surface);
          }

          .w-md-editor-text::-webkit-scrollbar,
          .w-md-editor-preview::-webkit-scrollbar {
            width: 8px;
          }

          .w-md-editor-text::-webkit-scrollbar-track,
          .w-md-editor-preview::-webkit-scrollbar-track {
            background: var(--obsidian-surface);
          }

          .w-md-editor-text::-webkit-scrollbar-thumb,
          .w-md-editor-preview::-webkit-scrollbar-thumb {
            background: var(--obsidian-border);
            border-radius: 4px;
          }

          .w-md-editor-text::-webkit-scrollbar-thumb:hover,
          .w-md-editor-preview::-webkit-scrollbar-thumb:hover {
            background: var(--obsidian-text-muted);
          }
        `}</style>
      </div>
    </div>
  );
};

export default WritingArea;
