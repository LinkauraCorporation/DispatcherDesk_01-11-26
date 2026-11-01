import React, { useState, useEffect, useRef } from 'react';
import { Paperclip, FileText, ExternalLink, RefreshCw, Volume2 } from 'lucide-react';
import { MessageAttachmentContext } from '../types.ts';
import { fetchFreshAttachmentUrl } from '../attachmentHelper.ts';

interface ChatAttachmentViewProps {
  attachment: MessageAttachmentContext;
  isOutbound?: boolean;
}

export const ChatAttachmentView: React.FC<ChatAttachmentViewProps> = ({
  attachment,
  isOutbound = false,
}) => {
  const [currentUrl, setCurrentUrl] = useState<string | null>(attachment.signed_url || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const refreshAttemptedRef = useRef(false);

  // If attachment changes (e.g. pagination or prop update)
  useEffect(() => {
    setCurrentUrl(attachment.signed_url || null);
    setLoadError(false);
    refreshAttemptedRef.current = false;
  }, [attachment.storage_path, attachment.signed_url]);

  const handleRefreshUrl = async (): Promise<string | null> => {
    if (isRefreshing || !attachment.storage_path) return null;
    setIsRefreshing(true);
    try {
      const freshUrl = await fetchFreshAttachmentUrl(attachment.storage_path);
      if (freshUrl) {
        setCurrentUrl(freshUrl);
        setLoadError(false);
        return freshUrl;
      } else {
        setLoadError(true);
        return null;
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleImageError = async () => {
    // Only attempt refresh once per mount / image failure to prevent infinite loops
    if (refreshAttemptedRef.current) {
      setLoadError(true);
      return;
    }
    refreshAttemptedRef.current = true;
    await handleRefreshUrl();
  };

  const handleAudioError = async () => {
    // Attempt refresh if signed URL has expired
    if (refreshAttemptedRef.current) {
      setLoadError(true);
      return;
    }
    refreshAttemptedRef.current = true;
    await handleRefreshUrl();
  };

  const handleOpenDocument = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    // If we don't have a URL, or if refresh hasn't been tried yet and loadError is flagged
    if (!currentUrl || loadError) {
      e.preventDefault();
      const fresh = await handleRefreshUrl();
      if (fresh) {
        window.open(fresh, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const isAudio =
    attachment.media_type === 'audio' ||
    attachment.mime_type?.startsWith('audio/');

  if (isAudio) {
    return (
      <div className="space-y-1.5 max-w-xs sm:max-w-sm">
        {currentUrl && !loadError ? (
          <div
            className={`p-2 rounded-xl border flex flex-col gap-1.5 ${
              isOutbound
                ? 'bg-black/30 border-white/15 text-white'
                : 'bg-slate-950/80 border-slate-700/80 text-slate-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2 px-1 text-[11px] opacity-80">
              <div className="flex items-center gap-1.5 min-w-0">
                <Volume2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate font-medium">
                  {attachment.file_name || 'Voice Message'}
                </span>
              </div>
              {attachment.file_size ? (
                <span className="shrink-0 text-[10px] opacity-70">
                  {(attachment.file_size / 1024).toFixed(0)} KB
                </span>
              ) : null}
            </div>
            <div className="relative">
              <audio
                controls
                preload="metadata"
                src={currentUrl}
                onError={handleAudioError}
                className="w-full h-8 sm:h-9 accent-indigo-500 rounded"
              />
              {isRefreshing && (
                <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center">
                  <RefreshCw className="w-4 h-4 text-white animate-spin" />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-black/30 border border-white/10 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Volume2 className="w-4 h-4 text-indigo-300 shrink-0" />
              <span className="truncate">{attachment.file_name || 'Voice message'}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                refreshAttemptedRef.current = false;
                handleRefreshUrl();
              }}
              disabled={isRefreshing}
              className="px-2 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 text-[11px] font-medium transition cursor-pointer flex items-center gap-1 shrink-0"
            >
              {isRefreshing ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <span>Reload</span>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  const isImage =
    attachment.media_type === 'image' ||
    attachment.mime_type?.startsWith('image/');

  if (isImage) {
    return (
      <div className="space-y-1">
        {currentUrl && !loadError ? (
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg overflow-hidden border border-white/20 bg-black/20 max-w-xs hover:opacity-95 transition cursor-pointer relative group"
            title="Tap to view photo"
          >
            <img
              src={currentUrl}
              alt={attachment.file_name || 'Driver Photo'}
              className="max-h-52 w-auto object-cover rounded-lg"
              loading="lazy"
              onError={handleImageError}
            />
            {isRefreshing && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-white animate-spin" />
              </div>
            )}
          </a>
        ) : (
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-black/30 border border-white/10 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Paperclip className="w-4 h-4 text-indigo-300 shrink-0" />
              <span className="truncate">{attachment.file_name || 'Photo attachment'}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                refreshAttemptedRef.current = false;
                handleRefreshUrl();
              }}
              disabled={isRefreshing}
              className="px-2 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 text-[11px] font-medium transition cursor-pointer flex items-center gap-1 shrink-0"
            >
              {isRefreshing ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <span>Reload</span>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Document attachment
  return (
    <div
      className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border max-w-sm ${
        isOutbound
          ? 'bg-black/30 border-white/15 text-white'
          : 'bg-slate-950/80 border-slate-700/80 text-slate-200'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="w-5 h-5 text-indigo-300 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-medium truncate">
            {attachment.file_name || 'Attached Document'}
          </p>
          <p className="text-[10px] opacity-75">
            {attachment.file_size
              ? `${(attachment.file_size / (1024 * 1024)).toFixed(2)} MB`
              : 'Document'}
          </p>
        </div>
      </div>

      <a
        href={currentUrl || '#'}
        onClick={handleOpenDocument}
        target="_blank"
        rel="noopener noreferrer"
        className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 transition shrink-0 cursor-pointer ${
          isOutbound
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40'
        }`}
      >
        {isRefreshing ? (
          <RefreshCw className="w-3 h-3 animate-spin" />
        ) : (
          <>
            <span>{currentUrl ? 'View' : 'Load'}</span>
            <ExternalLink className="w-3 h-3" />
          </>
        )}
      </a>
    </div>
  );
};
