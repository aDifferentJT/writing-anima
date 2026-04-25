import React, { useState } from "react";
import {
  X,
  Upload,
  File,
  CheckCircle,
  AlertCircle,
  Loader,
  Clock,
  ChevronDown,
} from "lucide-react";
import { Anima } from "../../types";
import animaService from "../../services/animaService";
import type { CorpusStatusMessage } from "../../apiTypes";

interface CorpusUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  anima: Anima;
  onUploaded: () => void;
}

const CorpusUploadModal: React.FC<CorpusUploadModalProps> = ({
  isOpen,
  onClose,
  anima,
  onUploaded,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<CorpusStatusMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [chunkSize, setChunkSize] = useState(800);
  const [chunkOverlap, setChunkOverlap] = useState(100);
  const [minChunkLength, setMinChunkLength] = useState(100);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles((prev) => [...prev, ...files]);
    setError(null);
    setSuccess(false);
  };

  const removeFile = (index: number): void => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async (): Promise<void> => {
    if (selectedFiles.length === 0) {
      setError("Please select at least one file");
      return;
    }

    setUploading(true);
    setError(null);
    setUploadStatus(null);

    try {
      for await (const msg of animaService.uploadCorpus(anima.id, selectedFiles, {
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap,
        min_chunk_length: minChunkLength,
      })) {
        if (msg.type === "status") {
          setUploadStatus(msg);
        } else if (msg.type === "complete") {
          setSuccess(true);
          setTimeout(() => onUploaded(), 1500);
        }
      }
    } catch (err) {
      console.error("Error uploading corpus:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="card bg-base-100 border border-base-300 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-base-300">
          <div>
            <h2 className="text-xl font-semibold text-base-content">
              Upload Corpus
            </h2>
            <p className="text-sm text-base-content/70 mt-1">
              for{" "}
              <span className="font-medium text-primary">
                {anima.name}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-base-content/40 hover:text-base-content hover:bg-base-200 transition-colors rounded"
            disabled={uploading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* File Input */}
          <div>
            <label className="block w-full">
              <div className="flex items-center justify-center w-full h-32 px-4 transition bg-base-200 border-2 border-base-300 border-dashed hover:border-primary hover:bg-primary/5 cursor-pointer rounded">
                <div className="text-center">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-base-content/40" />
                  <p className="text-sm text-base-content/70">
                    <span className="font-medium text-primary">
                      Click to upload
                    </span>{" "}
                    or drag and drop
                  </p>
                  <p className="text-xs text-base-content/40 mt-1">
                    PDF, TXT, MD, DOCX (max 100MB per file)
                  </p>
                </div>
              </div>
              <input
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.txt,.md,.docx"
                onChange={handleFileSelect}
                disabled={uploading}
              />
            </label>
          </div>

          {/* Selected Files */}
          {selectedFiles.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-base-content">
                  Selected Files ({selectedFiles.length})
                </h3>
                <span className="text-sm text-base-content/40">
                  Total: {formatFileSize(totalSize)}
                </span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {selectedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-base-200 border border-base-300 rounded"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <File className="w-5 h-5 text-primary flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-base-content truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-base-content/40">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    {!uploading && (
                      <button
                        onClick={() => removeFile(index)}
                        className="p-1 text-base-content/40 hover:text-error hover:bg-error/10 transition-colors rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress */}
          {uploading && (
            <div className="space-y-1">
              {!uploadStatus ? (
                <div className="flex items-center gap-2 text-sm text-base-content/70">
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Sending files...</span>
                </div>
              ) : (
                <>
                  {uploadStatus.steps_completed.map((name) => (
                    <div key={name} className="flex items-center gap-2 text-sm text-base-content/40">
                      <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                      <span className="truncate">{name}</span>
                    </div>
                  ))}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-base-content">
                      <Loader className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                      <span className="truncate">{uploadStatus.current_step}</span>
                    </div>
                    {uploadStatus.step_progress !== null ? (
                      <div className="ml-6 bg-base-300 h-1 rounded">
                        <div
                          className="bg-primary h-1 transition-all duration-300 rounded"
                          style={{ width: `${uploadStatus.step_progress * 100}%` }}
                        />
                      </div>
                    ) : (
                      <div className="ml-6 bg-base-300 h-1 overflow-hidden rounded">
                        <div className="bg-primary h-1 w-1/3 animate-slide" />
                      </div>
                    )}
                  </div>
                  {uploadStatus.steps_remaining.map((name) => (
                    <div key={name} className="flex items-center gap-2 text-sm text-base-content/40 opacity-50">
                      <Clock className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{name}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="flex items-center gap-2 p-4 bg-success/10 border border-success text-success rounded">
              <CheckCircle className="w-5 h-5" />
              <span>Files uploaded and processed successfully!</span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-4 bg-error/10 border border-error text-error rounded">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          )}

          {/* Advanced */}
          <div>
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center gap-1 text-xs text-base-content/40 hover:text-base-content/70"
              disabled={uploading}
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
              Advanced chunking options
            </button>
            {showAdvanced && (
              <div className="mt-3 grid grid-cols-3 gap-3">
                {[
                  { label: "Chunk size", value: chunkSize, set: setChunkSize },
                  { label: "Chunk overlap", value: chunkOverlap, set: setChunkOverlap },
                  { label: "Min chunk length", value: minChunkLength, set: setMinChunkLength },
                ].map(({ label, value, set }) => (
                  <div key={label}>
                    <label className="block text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-1">{label}</label>
                    <input
                      type="number" min={0} value={value}
                      onChange={e => set(parseInt(e.target.value) || 0)}
                      className="input input-bordered input-sm w-full"
                      disabled={uploading}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="p-4 bg-primary/10 border border-primary/20 rounded">
            <h4 className="text-sm font-medium text-primary mb-2">
              How it works
            </h4>
            <ul className="text-sm text-primary/80 space-y-1">
              <li>Upload writings in the style you want to emulate</li>
              <li>Files will be chunked and vectorized automatically</li>
              <li>More content = better quality feedback</li>
              <li>Aim for at least 10-20 pages of text</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-base-300">
          <button
            onClick={onClose}
            className="btn btn-sm"
            disabled={uploading}
          >
            {success ? "Close" : "Cancel"}
          </button>
          {!success && (
            <button
              onClick={handleUpload}
              className="btn btn-primary btn-sm flex items-center gap-2"
              disabled={uploading || selectedFiles.length === 0}
            >
              {uploading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Upload Files</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CorpusUploadModal;
