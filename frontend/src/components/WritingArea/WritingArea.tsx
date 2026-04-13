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

      const value = textarea.value;
      let start = -1;
      let end = -1;

      // 1. Exact match
      const exact = value.indexOf(text);
      if (exact !== -1) {
        start = exact;
        end = exact + text.length;
      }

      // 2. Whitespace-normalised match — build an index map so we can
      //    translate the normalised position back to the original string.
      if (start === -1) {
        // Build normalised string + map[normIdx] = origIdx
        const normChars: string[] = [];
        const normMap: number[] = [];
        let i = 0;
        while (i < value.length) {
          if (/\s/.test(value[i])) {
            normChars.push(' ');
            normMap.push(i);
            i++;
            while (i < value.length && /\s/.test(value[i])) i++;
          } else {
            normChars.push(value[i]);
            normMap.push(i);
            i++;
          }
        }
        const normValue = normChars.join('');
        const normText  = text.replace(/\s+/g, ' ').trim();

        const normIdx = normValue.indexOf(normText);
        if (normIdx !== -1) {
          start = normMap[normIdx];
          const lastNorm = Math.min(normIdx + normText.length - 1, normMap.length - 1);
          end = normMap[lastNorm] + 1;
        }
      }

      if (start === -1) return;

      textarea.focus();
      textarea.setSelectionRange(start, end);
      // Scroll the selection into view
      const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
      const lines = value.substring(0, start).split('\n').length;
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

      <div className="relative h-[calc(100%-36px)]" data-color-mode="light" ref={editorRef}>
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

      </div>
    </div>
  );
};

export default WritingArea;
