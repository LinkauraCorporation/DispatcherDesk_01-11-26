import React, { useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, X, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface FilePickerProps {
  selectedFile: File | null;
  onFileSelected: (file: File | null) => void;
  isProcessing: boolean;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export const FilePicker: React.FC<FilePickerProps> = ({
  selectedFile,
  onFileSelected,
  isProcessing,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isProcessing) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (isProcessing) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv') || file.type.includes('text')) {
        onFileSelected(file);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelected(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-3">
      {/* Privacy Guarantee Banner */}
      <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-between text-xs text-neutral-300">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
          <span className="font-medium text-white">Local Execution:</span>
          <span>Your FMCSA file stays on your computer. The extractor processes it locally.</span>
        </div>
        <span className="text-neutral-500 hidden sm:inline">No data ever leaves your browser</span>
      </div>

      {!selectedFile ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            isDragOver
              ? 'border-emerald-500/80 bg-emerald-500/5'
              : 'border-neutral-800 hover:border-neutral-700 bg-neutral-900/40 hover:bg-neutral-900/70'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv,text/csv,text/plain"
            className="hidden"
            disabled={isProcessing}
          />

          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center text-neutral-300 border border-neutral-700/60">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                Select or drop your FMCSA Census CSV file
              </div>
              <div className="text-xs text-neutral-400 mt-1">
                Optimized for massive 300MB+ files with millions of rows. Streamed in chunks.
              </div>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Low-RAM Windows PC safe (no full file memory load)
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate max-w-md">
                {selectedFile.name}
              </div>
              <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5">
                <span className="font-mono text-neutral-300">{formatBytes(selectedFile.size)}</span>
                <span aria-hidden="true" className="text-neutral-600">·</span>
                <span>{selectedFile.size > 200 * 1024 * 1024 ? 'Large File (Streaming Active)' : 'Standard CSV'}</span>
                <span aria-hidden="true" className="text-neutral-600">·</span>
                <span className="text-emerald-400">Ready to extract</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700/80 rounded-md transition-colors disabled:opacity-40"
            >
              Change File
            </button>
            <button
              type="button"
              onClick={() => {
                if (fileInputRef.current) fileInputRef.current.value = '';
                onFileSelected(null);
              }}
              disabled={isProcessing}
              className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-40"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".csv,text/csv,text/plain"
              className="hidden"
              disabled={isProcessing}
            />
          </div>
        </div>
      )}
    </div>
  );
};
