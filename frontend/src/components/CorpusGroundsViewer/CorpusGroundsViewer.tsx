import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, FileText, BookOpen } from "lucide-react";
import animaService from "../../services/animaService";
import type { CorpusFile, CorpusChunk, CorpusSource } from "../../types";

interface HighlightSourceData extends CorpusSource {
  _ts?: number;
}

interface CorpusGroundsViewerProps {
  isOpen: boolean;
  onClose: () => void;
  animaId: string | null;
  highlightSource: HighlightSourceData | null;
}

// Pure helpers — no component state/props dependencies

function normalizeFilename(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\.(pdf|txt|md|docx?|epub|rtf|html?)$/i, "")
    .replace(/[_-]/g, " ")
    .trim();
}

function findFileIndex(filesArr: CorpusFile[], sourceFile: string): number {
  if (!sourceFile || filesArr.length === 0) return -1;
  const norm = normalizeFilename(sourceFile);

  let idx = filesArr.findIndex(
    (f) => f.filename.toLowerCase() === sourceFile.toLowerCase(),
  );
  if (idx !== -1) return idx;

  idx = filesArr.findIndex((f) => normalizeFilename(f.filename) === norm);
  if (idx !== -1) return idx;

  idx = filesArr.findIndex((f) => {
    const fn = normalizeFilename(f.filename);
    return fn.includes(norm) || norm.includes(fn);
  });
  if (idx !== -1) return idx;

  const normWords = norm.split(/[\s,]+/).filter(Boolean);
  if (normWords.length > 0) {
    idx = filesArr.findIndex((f) => {
      const fn = normalizeFilename(f.filename);
      return fn.includes(normWords[0]) || normWords[0].includes(fn);
    });
    if (idx !== -1) return idx;
  }

  return -1;
}

function wordNgrams(text: string, n: number): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const grams = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    grams.add(words.slice(i, i + n).join(" "));
  }
  return grams;
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}

function findChunkWithText(chunks: CorpusChunk[], text: string): number {
  if (!chunks || !text) return -1;
  const textLower = text.toLowerCase();

  const idx = chunks.findIndex((c) => c.text.includes(text));
  if (idx !== -1) return idx;

  const ciIdx = chunks.findIndex((c) => c.text.toLowerCase().includes(textLower));
  if (ciIdx !== -1) return ciIdx;

  for (const len of [80, 50, 30]) {
    if (text.length >= len) {
      const prefix = textLower.substring(0, len);
      const prefixIdx = chunks.findIndex((c) => c.text.toLowerCase().includes(prefix));
      if (prefixIdx !== -1) return prefixIdx;
    }
  }

  for (const len of [80, 50, 30]) {
    if (text.length >= len) {
      const suffix = textLower.substring(text.length - len);
      const suffixIdx = chunks.findIndex((c) => c.text.toLowerCase().includes(suffix));
      if (suffixIdx !== -1) return suffixIdx;
    }
  }

  const sourceBigrams = wordNgrams(text, 2);
  const sourceTrigrams = wordNgrams(text, 3);
  if (sourceBigrams.size === 0) return -1;

  let bestIdx = -1;
  let bestScore = 0;
  const threshold = 0.15;

  for (let i = 0; i < chunks.length; i++) {
    const chunkBigrams = wordNgrams(chunks[i].text, 2);
    const chunkTrigrams = wordNgrams(chunks[i].text, 3);
    const bigramScore = jaccardSimilarity(sourceBigrams, chunkBigrams);
    const trigramScore = sourceTrigrams.size > 0
      ? jaccardSimilarity(sourceTrigrams, chunkTrigrams)
      : 0;
    const score = bigramScore * 0.4 + trigramScore * 0.6;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestScore >= threshold) {
    console.log("[CorpusViewer] Fuzzy match: chunk", bestIdx, "score", bestScore.toFixed(3));
    return bestIdx;
  }

  return -1;
}

/**
 * CorpusGroundsViewer — slide-out panel for browsing corpus documents
 * and viewing highlighted source passages that ground feedback.
 */
const CorpusGroundsViewer: React.FC<CorpusGroundsViewerProps> = ({
  isOpen,
  onClose,
  animaId,
  highlightSource,
}) => {
  const [files, setFiles] = useState<CorpusFile[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const [highlightedChunkIndex, setHighlightedChunkIndex] = useState<number>(-1);
  const [cachedAnimaId, setCachedAnimaId] = useState<string | null>(null);

  const highlightRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch corpus documents (cached by animaId)
  const fetchDocuments = useCallback(async () => {
    if (!animaId) return;
    if (cachedAnimaId === animaId && files.length > 0) return;

    setLoading(true);
    setError(null);
    try {
      const data = await animaService.getCorpusDocuments(animaId);
      setFiles(data.files || []);
      setCachedAnimaId(animaId);
      setSelectedFileIndex(0);
      setHighlightedChunkIndex(-1);
    } catch (err: unknown) {
      console.error("Failed to fetch corpus documents:", err);
      setError("Failed to load corpus documents");
    } finally {
      setLoading(false);
    }
  }, [animaId, cachedAnimaId, files.length]);

  // Fetch on open
  useEffect(() => {
    if (isOpen) {
      fetchDocuments();
    }
  }, [isOpen, fetchDocuments]);

  // Find and highlight the referenced source when highlightSource changes
  useEffect(() => {
    if (!highlightSource || files.length === 0) return;

    const sourceFile = highlightSource.source_file || "";
    const sourceText = highlightSource.text || "";

    console.log(
      "[CorpusViewer] Matching source_file:",
      JSON.stringify(sourceFile),
      "| Available files:",
      files.map((f) => f.filename),
    );
    console.log(
      "[CorpusViewer] Source text (first 60):",
      sourceText.substring(0, 60),
    );

    // Find matching file using fuzzy filename matching
    let fileIdx = findFileIndex(files, sourceFile);
    console.log("[CorpusViewer] findFileIndex result:", fileIdx);

    // If no file match by name, search all files for the text content
    if (fileIdx === -1 && sourceText) {
      for (let i = 0; i < files.length; i++) {
        const chunkIdx = findChunkWithText(files[i].chunks, sourceText);
        if (chunkIdx !== -1) {
          fileIdx = i;
          console.log(
            "[CorpusViewer] Found text in file",
            i,
            files[i].filename,
            "chunk",
            chunkIdx,
          );
          break;
        }
      }
    }

    if (fileIdx === -1) fileIdx = 0;

    setSelectedFileIndex(fileIdx);

    // Find the chunk containing the source text
    if (sourceText && files[fileIdx]) {
      const chunkIdx = findChunkWithText(files[fileIdx].chunks, sourceText);
      console.log("[CorpusViewer] Chunk match in selected file:", chunkIdx);
      setHighlightedChunkIndex(chunkIdx);
    } else {
      setHighlightedChunkIndex(-1);
    }
  }, [highlightSource, files]);

  // Scroll to highlighted chunk
  useEffect(() => {
    if (highlightedChunkIndex >= 0 && highlightRef.current) {
      // Small delay to let DOM render
      const timer = setTimeout(() => {
        highlightRef.current?.scrollIntoView({
          behavior: "instant" as ScrollBehavior,
          block: "center",
        });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [highlightedChunkIndex, selectedFileIndex]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Highlight matching text within a chunk
  const renderChunkText = (chunkText: string, isHighlighted: boolean): React.ReactNode => {
    if (!isHighlighted || !highlightSource?.text) {
      return <span>{chunkText}</span>;
    }

    const sourceText = highlightSource.text;
    const startIdx = chunkText.indexOf(sourceText);

    if (startIdx === -1) {
      // Try partial match with first 80 chars
      const prefix = sourceText.substring(0, 80);
      const partialIdx = chunkText.indexOf(prefix);
      if (partialIdx === -1) return <span>{chunkText}</span>;

      return (
        <>
          <span>{chunkText.substring(0, partialIdx)}</span>
          <mark className="bg-purple-200/80 rounded px-0.5">
            {chunkText.substring(partialIdx, partialIdx + sourceText.length)}
          </mark>
          <span>{chunkText.substring(partialIdx + sourceText.length)}</span>
        </>
      );
    }

    return (
      <>
        <span>{chunkText.substring(0, startIdx)}</span>
        <mark className="bg-purple-200/80 rounded px-0.5">
          {chunkText.substring(startIdx, startIdx + sourceText.length)}
        </mark>
        <span>{chunkText.substring(startIdx + sourceText.length)}</span>
      </>
    );
  };

  if (!isOpen) return null;

  const selectedFile = files[selectedFileIndex];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed inset-y-0 right-0 w-[62vw] max-w-5xl bg-base-100 shadow-xl flex flex-col transition-transform duration-300 ease-out"
        style={{ transform: isOpen ? "translateX(0)" : "translateX(100%)" }}
      >
        {/* Header */}
        <div className="h-[48px] px-4 border-b border-base-300 flex items-center gap-3 flex-shrink-0">
          <BookOpen className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm text-base-content tracking-tight">
            Corpus Grounds
          </span>
          {files.length > 0 && (
            <span className="text-xs text-base-content/40 mono">
              {files.length} file{files.length !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={onClose}
            className="ml-auto p-1.5 hover:bg-base-200 rounded transition-colors"
          >
            <X className="w-4 h-4 text-base-content/50" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* File sidebar */}
          <div className="w-56 border-r border-base-300 bg-base-200 overflow-y-auto obsidian-scrollbar flex-shrink-0">
            <div className="p-2 space-y-0.5">
              {loading && (
                <div className="p-4 text-xs text-base-content/40 text-center">
                  Loading corpus...
                </div>
              )}
              {error && (
                <div className="p-4 text-xs text-red-500 text-center">
                  {error}
                </div>
              )}
              {!loading && files.length === 0 && !error && (
                <div className="p-4 text-xs text-base-content/40 text-center">
                  No corpus files found
                </div>
              )}
              {files.map((file, idx) => (
                <button
                  key={file.filename}
                  onClick={() => {
                    setSelectedFileIndex(idx);
                    setHighlightedChunkIndex(-1);
                    if (readerRef.current) readerRef.current.scrollTop = 0;
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded text-xs transition-colors ${
                    idx === selectedFileIndex
                      ? "bg-base-100 border border-primary/30 text-base-content"
                      : "hover:bg-base-100 text-base-content/70 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <FileText
                      className={`w-3 h-3 flex-shrink-0 ${
                        idx === selectedFileIndex
                          ? "text-primary"
                          : "text-base-content/40"
                      }`}
                    />
                    <span className="truncate font-medium">
                      {file.filename}
                    </span>
                  </div>
                  <div className="mt-0.5 ml-[18px] text-base-content/40 mono text-[10px]">
                    {file.chunk_count} chunk{file.chunk_count !== 1 ? "s" : ""}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Reader area */}
          <div
            ref={readerRef}
            className="flex-1 overflow-y-auto obsidian-scrollbar"
          >
            {selectedFile ? (
              <div className="p-6 max-w-3xl">
                {/* File header */}
                <div className="mb-6 pb-3 border-b border-base-300">
                  <h2 className="text-base font-semibold text-base-content tracking-tight">
                    {selectedFile.filename}
                  </h2>
                  <div className="mt-1 text-xs text-base-content/40 mono">
                    {selectedFile.chunk_count} chunks
                  </div>
                </div>

                {/* Chunks */}
                <div className="space-y-1">
                  {selectedFile.chunks.map((chunk, idx) => {
                    const isHighlighted = idx === highlightedChunkIndex;
                    return (
                      <div
                        key={idx}
                        ref={isHighlighted ? highlightRef : null}
                        className={`py-2 px-3 rounded text-sm leading-relaxed transition-colors text-justify ${
                          isHighlighted
                            ? "bg-purple-100/60 border-l-2 border-purple-500"
                            : "border-l-2 border-transparent"
                        }`}
                      >
                        <span className="text-base-content whitespace-pre-wrap">
                          {renderChunkText(chunk.text, isHighlighted)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-base-content/40 text-sm">
                {loading ? "Loading..." : "Select a file to view"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CorpusGroundsViewer;
