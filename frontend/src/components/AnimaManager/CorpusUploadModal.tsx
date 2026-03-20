import React, { useState } from "react";
import {
  X,
  Upload,
  File,
  CheckCircle,
  AlertCircle,
  Loader,
  Clock,
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
      for await (const msg of animaService.uploadCorpus(anima.id, selectedFiles)) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-obsidian-surface border border-obsidian-border shadow-obsidian-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-obsidian-border">
          <div>
            <h2 className="text-xl font-semibold text-obsidian-text-primary">
              Upload Corpus
            </h2>
            <p className="text-sm text-obsidian-text-secondary mt-1">
              for{" "}
              <span className="font-medium text-obsidian-accent-primary">
                {anima.name}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-obsidian-text-muted hover:text-obsidian-text-primary hover:bg-obsidian-bg transition-colors"
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
              <div className="flex items-center justify-center w-full h-32 px-4 transition bg-obsidian-bg border-2 border-obsidian-border border-dashed hover:border-obsidian-accent-primary hover:bg-obsidian-accent-pale cursor-pointer">
                <div className="text-center">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-obsidian-text-muted" />
                  <p className="text-sm text-obsidian-text-secondary">
                    <span className="font-medium text-obsidian-accent-primary">
                      Click to upload
                    </span>{" "}
                    or drag and drop
                  </p>
                  <p className="text-xs text-obsidian-text-muted mt-1">
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
                <h3 className="text-sm font-medium text-obsidian-text-primary">
                  Selected Files ({selectedFiles.length})
                </h3>
                <span className="text-sm text-obsidian-text-muted">
                  Total: {formatFileSize(totalSize)}
                </span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {selectedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-obsidian-bg border border-obsidian-border"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <File className="w-5 h-5 text-obsidian-accent-primary flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-obsidian-text-primary truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-obsidian-text-muted">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    {!uploading && (
                      <button
                        onClick={() => removeFile(index)}
                        className="p-1 text-obsidian-text-muted hover:text-obsidian-error hover:bg-red-50 transition-colors"
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
                <div className="flex items-center gap-2 text-sm text-obsidian-text-secondary">
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Sending files...</span>
                </div>
              ) : (
                <>
                  {uploadStatus.steps_completed.map((name) => (
                    <div key={name} className="flex items-center gap-2 text-sm text-obsidian-text-muted">
                      <CheckCircle className="w-4 h-4 text-obsidian-success flex-shrink-0" />
                      <span className="truncate">{name}</span>
                    </div>
                  ))}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-obsidian-text-primary">
                      <Loader className="w-4 h-4 animate-spin text-obsidian-accent-primary flex-shrink-0" />
                      <span className="truncate">{uploadStatus.current_step}</span>
                    </div>
                    {uploadStatus.step_progress !== null ? (
                      <div className="ml-6 w-full bg-obsidian-border h-1">
                        <div
                          className="bg-obsidian-accent-primary h-1 transition-all duration-300"
                          style={{ width: `${uploadStatus.step_progress * 100}%` }}
                        />
                      </div>
                    ) : (
                      <div className="ml-6 w-full bg-obsidian-border h-1 overflow-hidden">
                        <div className="bg-obsidian-accent-primary h-1 w-1/3 animate-slide" />
                      </div>
                    )}
                  </div>
                  {uploadStatus.steps_remaining.map((name) => (
                    <div key={name} className="flex items-center gap-2 text-sm text-obsidian-text-muted opacity-50">
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
            <div className="flex items-center gap-2 p-4 bg-green-50 border border-obsidian-success text-obsidian-success">
              <CheckCircle className="w-5 h-5" />
              <span>Files uploaded and processed successfully!</span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-50 border border-obsidian-error text-obsidian-error">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          )}

          {/* Info */}
          <div className="p-4 bg-obsidian-accent-pale border border-obsidian-accent-lighter">
            <h4 className="text-sm font-medium text-obsidian-accent-secondary mb-2">
              How it works
            </h4>
            <ul className="text-sm text-obsidian-accent-secondary space-y-1">
              <li>Upload writings in the style you want to emulate</li>
              <li>Files will be chunked and vectorized automatically</li>
              <li>More content = better quality feedback</li>
              <li>Aim for at least 10-20 pages of text</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-obsidian-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-obsidian-text-secondary bg-obsidian-bg border border-obsidian-border hover:bg-obsidian-border transition-colors"
            disabled={uploading}
          >
            {success ? "Close" : "Cancel"}
          </button>
          {!success && (
            <button
              onClick={handleUpload}
              className="flex items-center gap-2 px-6 py-2 bg-obsidian-accent-primary text-white hover:bg-obsidian-accent-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={uploading || selectedFiles.length === 0}
            >
              {uploading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
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
