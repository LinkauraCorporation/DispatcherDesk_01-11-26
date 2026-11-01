import React, { useState, useRef, useEffect } from 'react';
import { Conversation, ConversationMessage, MessageType, MessageAttachmentContext } from '../../communication/types.ts';
import { ChatAttachmentView } from '../../communication/components/ChatAttachmentView.tsx';
import { DriverAssignedLoad } from '../DriverPortalView.tsx';
import { getCurrentDriverGps } from '../utils/driverLocation.ts';
import { supabase } from '../../../lib/supabase.ts';
import {
  Send,
  Mic,
  Plus,
  CheckCheck,
  Clock,
  ArrowLeft,
  AlertTriangle,
  HelpCircle,
  ClipboardList,
  CheckCircle,
  Truck,
  RotateCcw,
  Check,
  ShieldAlert,
  MapPin,
  RefreshCw,
  Info,
  Camera,
  Image as ImageIcon,
  FileText,
  X,
  Paperclip,
  ExternalLink,
  Square,
  Trash2,
} from 'lucide-react';
import { StatusBadge } from '../../../components/common/StatusBadge.tsx';

interface PendingAttachment {
  file: File;
  previewUrl: string | null;
  mediaType: 'image' | 'document';
  fileName: string;
  fileSize: number;
}

const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

function getSupportedAudioMimeType(): string | null {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return null;
  }
  for (const candidate of AUDIO_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getAudioFileExtension(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes('webm')) return 'webm';
  if (lower.includes('mp4') || lower.includes('m4a') || lower.includes('aac')) return 'mp4';
  if (lower.includes('ogg')) return 'ogg';
  return 'webm';
}

function formatRecordingDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Client-side image compression for mobile camera / gallery photos.
 * Scales down images with max dimension > 1920px and re-encodes to JPEG at 0.8 quality.
 * Falls back to original file if compression fails or if file is already small.
 */
async function compressImageIfAppropriate(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(file);
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        try {
          const maxDim = 1920;
          let width = img.width;
          let height = img.height;

          // If dimensions are within ceiling and file is small, keep original
          if (width <= maxDim && height <= maxDim && file.size < 2 * 1024 * 1024) {
            resolve(file);
            return;
          }

          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(file);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob && blob.size > 0 && blob.size < file.size) {
                const compressedName = file.name.replace(/\.[^/.]+$/, '.jpg');
                const compressedFile = new File([blob], compressedName, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            },
            'image/jpeg',
            0.8
          );
        } catch {
          resolve(file);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

interface DriverMessageThreadProps {
  conversation: Conversation;
  messages: ConversationMessage[];
  isLoadingMessages: boolean;
  loadContext?: DriverAssignedLoad | null;
  onSendMessage: (content: string, messageType: MessageType, context?: Record<string, any>) => Promise<void>;
  onAcknowledgeMessage: (messageId: string) => Promise<void>;
  onReopenConversation: () => Promise<void>;
  onBackToList?: () => void;
  currentUserId?: string | null;
  isSending: boolean;
}

export const DriverMessageThread: React.FC<DriverMessageThreadProps> = ({
  conversation,
  messages,
  isLoadingMessages,
  loadContext,
  onSendMessage,
  onAcknowledgeMessage,
  onReopenConversation,
  onBackToList,
  currentUserId,
  isSending,
}) => {
  const [draftText, setDraftText] = useState('');
  const [selectedType, setSelectedType] = useState<MessageType>('text');
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Attachment states
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  // Voice Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordingMimeType, setRecordingMimeType] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [isMaxDurationReached, setIsMaxDurationReached] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingDurationRef = useRef(0);

  // Hidden file inputs
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);

  const hasText = draftText.trim().length > 0;
  const isResolved = conversation.status === 'resolved';

  // Derive operational lifecycle state from load context
  const pipelineStatus = loadContext?.pipeline_status || conversation.load?.pipeline_status;
  const isLoadOperational = pipelineStatus === 'booked' || pipelineStatus === 'in_transit';
  const isLoadDelivered = pipelineStatus === 'delivered';
  const isLoadClosed = pipelineStatus === 'invoiced' || pipelineStatus === 'paid';
  const isLoadReadOnly = isLoadDelivered || isLoadClosed;
  const showQuickActions = !isResolved && isLoadOperational;

  // Close attachment menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        attachMenuRef.current &&
        !attachMenuRef.current.contains(e.target as Node)
      ) {
        setShowAttachMenu(false);
      }
    };
    if (showAttachMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showAttachMenu]);

  // Stop all media stream tracks cleanly
  const stopAllMediaTracks = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      mediaStreamRef.current = null;
    }
  };

  // Clean up object URL when pending attachment changes or unmounts
  useEffect(() => {
    return () => {
      if (pendingAttachment?.previewUrl) {
        URL.revokeObjectURL(pendingAttachment.previewUrl);
      }
    };
  }, [pendingAttachment]);

  // Clean up recording object URL and active tracks on unmount or reset
  useEffect(() => {
    return () => {
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      stopAllMediaTracks();
    };
  }, [recordedAudioUrl]);

  // Scroll to bottom directly when messages update
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages.length]);

  const stopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn('[DriverRecording] Error stopping MediaRecorder:', err);
      }
    }

    stopAllMediaTracks();
    setIsRecording(false);
  };

  const handleDiscardRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    stopAllMediaTracks();
    audioChunksRef.current = [];
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setIsRecording(false);
    setRecordedAudioBlob(null);
    setRecordedAudioUrl(null);
    setRecordingDuration(0);
    recordingDurationRef.current = 0;
    setIsMaxDurationReached(false);
    setRecordingError(null);
  };

  const handleStartRecording = async () => {
    if (
      isSending ||
      isUploadingAttachment ||
      isUploadingVoice ||
      isResolved ||
      isLoadReadOnly ||
      isRecording
    ) {
      return;
    }

    setRecordingError(null);
    setAttachmentError(null);
    setIsMaxDurationReached(false);

    // 1. Check browser support
    if (
      typeof window === 'undefined' ||
      !navigator?.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setRecordingError('Voice recording is not supported in this browser.');
      return;
    }

    // 2. Detect supported MIME candidate
    const supportedMime = getSupportedAudioMimeType();
    if (!supportedMime) {
      setRecordingError('No supported audio recording format found in this browser.');
      return;
    }

    // 3. Request microphone permission ONLY on button press
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      console.warn('[DriverRecording] Microphone access error:', err);
      stopAllMediaTracks();
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setRecordingError('Microphone permission denied. Please allow microphone access in your browser settings.');
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setRecordingError('No microphone found on your device.');
      } else {
        setRecordingError('Could not access microphone: ' + (err?.message || 'Unknown error'));
      }
      return;
    }

    try {
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      recordingDurationRef.current = 0;
      setRecordingDuration(0);
      setRecordingMimeType(supportedMime);

      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
        setRecordedAudioUrl(null);
      }
      setRecordedAudioBlob(null);

      const recorder = new MediaRecorder(stream, { mimeType: supportedMime });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event: any) => {
        console.error('[DriverRecording] MediaRecorder error:', event);
        setRecordingError('An error occurred during audio recording.');
        stopRecording();
      };

      recorder.onstop = () => {
        const chunks = audioChunksRef.current;
        const blob = new Blob(chunks, { type: supportedMime });
        audioChunksRef.current = [];
        stopAllMediaTracks();

        if (blob.size === 0) {
          setRecordingError('No audio recorded. Please try again.');
          setRecordedAudioBlob(null);
          setRecordedAudioUrl(null);
          return;
        }

        const url = URL.createObjectURL(blob);
        setRecordedAudioBlob(blob);
        setRecordedAudioUrl(url);
      };

      recorder.start(500);
      setIsRecording(true);

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      recordingTimerRef.current = setInterval(() => {
        recordingDurationRef.current += 1;
        const current = recordingDurationRef.current;
        setRecordingDuration(current);
        if (current >= 120) {
          setIsMaxDurationReached(true);
          stopRecording();
        }
      }, 1000);
    } catch (err: any) {
      console.error('[DriverRecording] Failed to start recorder:', err);
      stopAllMediaTracks();
      setIsRecording(false);
      setRecordingError('Failed to initialize voice recorder: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleSendVoiceRecording = async () => {
    if (
      isSending ||
      isUploadingAttachment ||
      isUploadingVoice ||
      isResolved ||
      isLoadReadOnly ||
      !recordedAudioBlob
    ) {
      return;
    }

    setIsUploadingVoice(true);
    setRecordingError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error('Authentication session expired. Please log in again.');
      }

      const mimeType = recordingMimeType || recordedAudioBlob.type || 'audio/webm';
      const extension = getAudioFileExtension(mimeType);
      const fileName = `voice-message-${Date.now()}.${extension}`;
      const audioFile = new File([recordedAudioBlob], fileName, { type: mimeType });

      const formData = new FormData();
      formData.append('conversationId', conversation.id);
      if (loadContext?.id || conversation.load_id) {
        formData.append('loadId', loadContext?.id || conversation.load_id!);
      }
      formData.append('file', audioFile);

      const uploadRes = await fetch('/api/driver/chat/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => null);
        throw new Error(errData?.error || `Upload failed with status ${uploadRes.status}`);
      }

      const uploadResult = await uploadRes.json();
      const uploadedAtt = uploadResult.attachment;

      if (!uploadedAtt?.storage_path) {
        throw new Error('Invalid upload response received from server.');
      }

      const contextPayload: Record<string, any> = {};
      if (loadContext) {
        contextPayload.load_id = loadContext.id;
        contextPayload.load_number = loadContext.load_number;
        contextPayload.origin = `${loadContext.origin_city || ''}, ${loadContext.origin_state || ''}`.trim();
        contextPayload.destination = `${loadContext.dest_city || ''}, ${loadContext.dest_state || ''}`.trim();
      }

      const attachmentContext: MessageAttachmentContext = {
        storage_path: uploadedAtt.storage_path,
        file_name: uploadedAtt.file_name || fileName,
        file_size: uploadedAtt.file_size || audioFile.size,
        mime_type: uploadedAtt.mime_type || mimeType,
        media_type: 'audio',
        signed_url: uploadedAtt.signed_url || null,
      };

      contextPayload.attachment = attachmentContext;
      if (recordingDuration > 0) {
        contextPayload.duration_seconds = recordingDuration;
      }

      const messageContent = 'Voice message';
      const messageTypeToSend: MessageType = 'document_message';

      await onSendMessage(messageContent, messageTypeToSend, contextPayload);

      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
      }
      setRecordedAudioBlob(null);
      setRecordedAudioUrl(null);
      setRecordingDuration(0);
      recordingDurationRef.current = 0;
      setIsMaxDurationReached(false);
      setRecordingError(null);
    } catch (err: any) {
      console.error('[DriverMessageThread] Voice send failed:', err);
      setRecordingError(err?.message || 'Failed to upload voice message. Please try again.');
    } finally {
      setIsUploadingVoice(false);
    }
  };

  const handleSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    setShowAttachMenu(false);
    setAttachmentError(null);

    if (!files || files.length === 0) return;
    const file = files[0];
    e.target.value = ''; // Reset so the same file can be re-selected if removed

    // Client-side validation: MIME type
    const mime = (file.type || '').toLowerCase();
    const isDocx = file.name.toLowerCase().endsWith('.docx');
    const isAllowed = ALLOWED_MIME_TYPES.has(mime) || (isDocx && (!mime || mime === 'application/octet-stream'));

    if (!isAllowed) {
      setAttachmentError('Unsupported file type. Please select a JPEG, PNG, WEBP, PDF, or DOCX file.');
      return;
    }

    // Client-side validation: Empty file
    if (file.size === 0) {
      setAttachmentError('Selected file is empty (0 bytes).');
      return;
    }

    // Client-side validation: Max 25 MB
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      setAttachmentError('File size exceeds the 25 MB limit.');
      return;
    }

    const isImage = mime.startsWith('image/');
    let finalFile = file;

    if (isImage) {
      try {
        finalFile = await compressImageIfAppropriate(file);
      } catch (err) {
        console.warn('[DriverMessageThread] Image compression warning, falling back to original:', err);
      }
    }

    // Revoke previous preview URL if any
    if (pendingAttachment?.previewUrl) {
      URL.revokeObjectURL(pendingAttachment.previewUrl);
    }

    let previewUrl: string | null = null;
    if (isImage) {
      previewUrl = URL.createObjectURL(finalFile);
    }

    setPendingAttachment({
      file: finalFile,
      previewUrl,
      mediaType: isImage ? 'image' : 'document',
      fileName: finalFile.name,
      fileSize: finalFile.size,
    });
  };

  const handleRemovePendingAttachment = () => {
    if (pendingAttachment?.previewUrl) {
      URL.revokeObjectURL(pendingAttachment.previewUrl);
    }
    setPendingAttachment(null);
    setAttachmentError(null);
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSending || isUploadingAttachment || isResolved || isLoadReadOnly) return;

    const trimmedText = draftText.trim();
    if (!trimmedText && !pendingAttachment) return;

    setAttachmentError(null);

    const contextPayload: Record<string, any> = {};
    if (loadContext) {
      contextPayload.load_id = loadContext.id;
      contextPayload.load_number = loadContext.load_number;
      contextPayload.origin = `${loadContext.origin_city || ''}, ${loadContext.origin_state || ''}`.trim();
      contextPayload.destination = `${loadContext.dest_city || ''}, ${loadContext.dest_state || ''}`.trim();
    }

    // Attachment flow
    if (pendingAttachment) {
      setIsUploadingAttachment(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) {
          throw new Error('Authentication session expired. Please log in again.');
        }

        const formData = new FormData();
        formData.append('conversationId', conversation.id);
        if (loadContext?.id || conversation.load_id) {
          formData.append('loadId', loadContext?.id || conversation.load_id!);
        }
        formData.append('file', pendingAttachment.file);

        const uploadRes = await fetch('/api/driver/chat/upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => null);
          throw new Error(errData?.error || `Upload failed with status ${uploadRes.status}`);
        }

        const uploadResult = await uploadRes.json();
        const uploadedAtt = uploadResult.attachment;

        if (!uploadedAtt?.storage_path) {
          throw new Error('Invalid upload response received from server.');
        }

        const attachmentContext: MessageAttachmentContext = {
          storage_path: uploadedAtt.storage_path,
          file_name: uploadedAtt.file_name || pendingAttachment.fileName,
          file_size: uploadedAtt.file_size || pendingAttachment.fileSize,
          mime_type: uploadedAtt.mime_type || pendingAttachment.file.type || 'application/octet-stream',
          media_type: pendingAttachment.mediaType,
          signed_url: uploadedAtt.signed_url || null,
        };

        contextPayload.attachment = attachmentContext;

        const messageContent = trimmedText || (pendingAttachment.mediaType === 'image' ? 'Photo' : 'Document');
        const messageTypeToSend: MessageType = 'document_message';

        await onSendMessage(messageContent, messageTypeToSend, contextPayload);

        if (pendingAttachment.previewUrl) {
          URL.revokeObjectURL(pendingAttachment.previewUrl);
        }
        setPendingAttachment(null);
        setDraftText('');
        setSelectedType('text');
      } catch (err: any) {
        console.error('[DriverMessageThread] Attachment send failed:', err);
        setAttachmentError(err?.message || 'Failed to upload attachment. Please try again.');
      } finally {
        setIsUploadingAttachment(false);
      }
      return;
    }

    // Text-only flow
    try {
      await onSendMessage(trimmedText, selectedType, contextPayload);
      setDraftText('');
      setSelectedType('text');
    } catch (err) {
      console.error('[DriverMessageThread] Send failed:', err);
    }
  };

  const handleQuickAction = async (actionText: string, messageType: MessageType) => {
    if (isSending || isResolved || !isLoadOperational) return;

    const contextPayload: Record<string, any> = {};
    if (loadContext) {
      contextPayload.load_id = loadContext.id;
      contextPayload.load_number = loadContext.load_number;
      contextPayload.origin = `${loadContext.origin_city || ''}, ${loadContext.origin_state || ''}`.trim();
      contextPayload.destination = `${loadContext.dest_city || ''}, ${loadContext.dest_state || ''}`.trim();
    }

    // Attempt GPS capture ONLY for the Traffic Delay quick action path
    if (messageType === 'exception_update') {
      try {
        const coords = await getCurrentDriverGps(3000);
        if (
          coords &&
          typeof coords.latitude === 'number' &&
          typeof coords.longitude === 'number' &&
          Number.isFinite(coords.latitude) &&
          Number.isFinite(coords.longitude) &&
          coords.latitude >= -90 &&
          coords.latitude <= 90 &&
          coords.longitude >= -180 &&
          coords.longitude <= 180
        ) {
          contextPayload.latitude = coords.latitude;
          contextPayload.longitude = coords.longitude;
          contextPayload.location_timestamp = new Date().toISOString();
        }
      } catch {
        // Geolocation failure must never block sending the delay message
      }
    }

    try {
      await onSendMessage(actionText, messageType, contextPayload);
    } catch (err) {
      console.error('[DriverMessageThread] Quick action failed:', err);
    }
  };

  const handleAcknowledge = async (messageId: string) => {
    setAcknowledgingId(messageId);
    try {
      await onAcknowledgeMessage(messageId);
    } finally {
      setAcknowledgingId(null);
    }
  };

  const handleReopen = async () => {
    setReopening(true);
    try {
      await onReopenConversation();
    } finally {
      setReopening(false);
    }
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const renderTypeBadge = (type: MessageType) => {
    switch (type) {
      case 'instruction':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950/90 text-amber-300 border border-amber-800/80 mb-1">
            <ClipboardList className="w-3 h-3" />
            Dispatch Instruction
          </span>
        );
      case 'question':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-950/90 text-sky-300 border border-sky-800/80 mb-1">
            <HelpCircle className="w-3 h-3" />
            Dispatcher Question
          </span>
        );
      case 'confirmation':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-950/90 text-teal-300 border border-teal-800/80 mb-1">
            <CheckCircle className="w-3 h-3" />
            Confirmation
          </span>
        );
      case 'status_update':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/90 text-emerald-300 border border-emerald-800/80 mb-1">
            <Truck className="w-3 h-3" />
            Status Update
          </span>
        );
      case 'exception_update':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950/90 text-rose-300 border border-rose-800/80 mb-1">
            <AlertTriangle className="w-3 h-3" />
            Delay / Exception Notice
          </span>
        );
      case 'document_message':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-950/90 text-indigo-300 border border-indigo-800/80 mb-1">
            <Paperclip className="w-3 h-3" />
            Document / Photo
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div id="driver-message-thread" className="flex flex-col h-full w-full min-w-0 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Hidden File Inputs for Attachment Chooser */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleSelectFile}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleSelectFile}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept="application/pdf,image/*,.docx"
        className="hidden"
        onChange={handleSelectFile}
      />

      {/* Streamlined Mobile & Desktop Chat Header */}
      <div className="px-3 py-2 sm:px-4 sm:py-3 border-b border-slate-800 bg-slate-900/95 flex flex-col gap-1.5 w-full min-w-0 shrink-0">
        <div className="flex items-center justify-between gap-2.5 w-full min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Navigates back to the load conversations list */}
            {onBackToList && (
              <button
                id="driver-thread-back-btn"
                type="button"
                onClick={onBackToList}
                className="p-1.5 -ml-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center md:hidden shrink-0"
                title="Back to conversations"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0 flex-nowrap">
                <h3 className="text-sm sm:text-base font-bold text-white truncate">
                  {conversation.type === 'general' ? (
                    'Central Dispatch'
                  ) : (
                    <>
                      {loadContext?.load_number
                        ? `Load #${loadContext.load_number}`
                        : conversation.load?.load_number
                        ? `Load #${conversation.load.load_number}`
                        : 'Load Dispatch'}
                    </>
                  )}
                </h3>
                {isResolved ? (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                    Resolved
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/70 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Active
                  </span>
                )}
              </div>
              <p className="hidden sm:block text-[11px] text-slate-400 truncate mt-0.5">
                {conversation.type === 'general'
                  ? 'Direct communications with central fleet dispatch'
                  : 'Operational load thread for stops, arrival notifications, and delays'}
              </p>
            </div>
          </div>
        </div>

        {/* Load Operational Context (Strictly firewalled: no rates, margins, or pay) */}
        {loadContext && (
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs w-full min-w-0">
            <div className="flex items-center gap-1.5 text-slate-300 min-w-0 flex-nowrap">
              <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="font-semibold text-white whitespace-nowrap truncate text-[11px] sm:text-xs">
                {loadContext.origin_city}, {loadContext.origin_state}
              </span>
              <span className="text-slate-500 shrink-0">→</span>
              <span className="font-semibold text-white whitespace-nowrap truncate text-[11px] sm:text-xs">
                {loadContext.dest_city}, {loadContext.dest_state}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <StatusBadge status={loadContext.pipeline_status} type="pipeline" size="sm" />
            </div>
          </div>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 sm:p-4 space-y-2.5 sm:space-y-3.5 w-full min-w-0"
      >
        {isLoadingMessages && messages.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Loading conversation history...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="py-16 text-center px-4 space-y-2">
            <Info className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs font-semibold text-slate-300">No messages yet in this conversation</p>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              Use the message composer or tap a quick operational update below to notify dispatch.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            // Outbound message if sender_id matches current driver session, or marked as driver
            const isOutbound = currentUserId ? msg.sender_id === currentUserId : true;
            const isAcknowledged = Boolean(msg.acknowledged_at);
            const isActionable =
              !isOutbound &&
              !isAcknowledged &&
              (msg.message_type === 'instruction' ||
                msg.message_type === 'question' ||
                msg.message_type === 'status_update' ||
                msg.message_type === 'exception_update');

            return (
              <div
                key={msg.id}
                id={`driver-msg-${msg.id}`}
                className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'} space-y-1`}
              >
                {/* Sender label for inbound messages */}
                {!isOutbound && (
                  <span className="text-[11px] text-slate-400 font-medium px-1">
                    {msg.sender?.full_name || 'Fleet Dispatch'}
                  </span>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-2.5 sm:p-3.5 shadow-sm text-xs sm:text-sm ${
                    isOutbound
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-slate-800 text-slate-100 border border-slate-700/80 rounded-tl-none'
                  }`}
                >
                  {/* Semantic message type pill */}
                  {renderTypeBadge(msg.message_type)}

                  {/* Message body text */}
                  {msg.content && (
                    <p className="whitespace-pre-wrap leading-relaxed break-words font-normal">
                      {msg.content}
                    </p>
                  )}

                  {/* Render Attachment (Photo or Document) */}
                  {msg.context?.attachment && (
                    <div className={`${msg.content ? 'mt-2' : ''} space-y-1.5`}>
                      <ChatAttachmentView
                        attachment={msg.context.attachment}
                        isOutbound={isOutbound}
                      />
                    </div>
                  )}

                  {/* Context snippet if attached */}
                  {(msg.context?.load_number || (typeof msg.context?.latitude === 'number' && typeof msg.context?.longitude === 'number')) && (
                    <div className={`mt-1.5 pt-1.5 text-[11px] border-t flex items-center justify-between gap-2 ${isOutbound ? 'border-indigo-500/50 text-indigo-100' : 'border-slate-700 text-slate-400'}`}>
                      {msg.context?.load_number ? <span>Ref: Load #{msg.context.load_number}</span> : <span />}
                      {typeof msg.context?.latitude === 'number' && typeof msg.context?.longitude === 'number' && (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] opacity-90">
                          <MapPin className="w-2.5 h-2.5 shrink-0" />
                          <span>GPS attached</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Footer: Timestamp, Read/Ack indicators */}
                  <div className={`flex items-center justify-end gap-1.5 mt-1.5 text-[10px] ${isOutbound ? 'text-indigo-200' : 'text-slate-400'}`}>
                    <Clock className="w-3 h-3" />
                    <span>{formatTimestamp(msg.created_at)}</span>

                    {/* Read status for driver outbound messages */}
                    {isOutbound && msg.read_at && (
                      <span className="flex items-center gap-0.5 ml-1 text-emerald-300 font-medium" title={`Read by dispatch at ${new Date(msg.read_at).toLocaleTimeString()}`}>
                        <CheckCheck className="w-3 h-3" />
                        <span>Read</span>
                      </span>
                    )}

                    {/* Acknowledged status */}
                    {isAcknowledged && (
                      <span className="flex items-center gap-0.5 ml-1 text-emerald-400 font-semibold" title={`Acknowledged at ${new Date(msg.acknowledged_at!).toLocaleTimeString()}`}>
                        <Check className="w-3 h-3" />
                        <span>Ack'd</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Driver Acknowledge Button for Actionable Incoming Messages */}
                {isActionable && (
                  <div className="pt-1">
                    <button
                      id={`driver-ack-btn-${msg.id}`}
                      type="button"
                      onClick={() => handleAcknowledge(msg.id)}
                      disabled={acknowledgingId === msg.id}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white font-semibold text-xs flex items-center gap-1.5 shadow transition cursor-pointer"
                    >
                      {acknowledgingId === msg.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      )}
                      <span>Acknowledge Receipt</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Horizontal Chip Strip (Operational & active threads only) */}
      {showQuickActions && (
        <div
          id="driver-quick-actions-strip"
          className="px-2 py-1.5 bg-slate-950/90 border-t border-slate-800/80 w-full min-w-0 shrink-0 overflow-x-auto overflow-y-hidden touch-pan-x overscroll-x-contain flex items-center gap-1.5 scrollbar-none"
        >
          <button
            id="driver-quick-action-arrived-shipper"
            type="button"
            onClick={() => handleQuickAction('Driver status update: Arrived at Shipper', 'status_update')}
            disabled={isSending || isUploadingAttachment}
            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50 text-slate-200 hover:text-white text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 border border-slate-700/80 cursor-pointer"
          >
            <Truck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Arrived at Shipper</span>
          </button>
          <button
            id="driver-quick-action-loaded-rolling"
            type="button"
            onClick={() => handleQuickAction('Driver status update: Loaded & Rolling', 'status_update')}
            disabled={isSending || isUploadingAttachment}
            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50 text-slate-200 hover:text-white text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 border border-slate-700/80 cursor-pointer"
          >
            <Truck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Loaded & Rolling</span>
          </button>
          <button
            id="driver-quick-action-arrived-receiver"
            type="button"
            onClick={() => handleQuickAction('Driver status update: Arrived at Receiver', 'status_update')}
            disabled={isSending || isUploadingAttachment}
            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50 text-slate-200 hover:text-white text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 border border-slate-700/80 cursor-pointer"
          >
            <Truck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Arrived at Receiver</span>
          </button>
          <button
            id="driver-quick-action-delivered-empty"
            type="button"
            onClick={() => handleQuickAction('Driver status update: Delivered / Empty', 'status_update')}
            disabled={isSending || isUploadingAttachment}
            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50 text-slate-200 hover:text-white text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 border border-slate-700/80 cursor-pointer"
          >
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Delivered / Empty</span>
          </button>
          <button
            id="driver-quick-action-traffic-delay"
            type="button"
            onClick={() => handleQuickAction('Driver delay notice: Experiencing traffic delay en route', 'exception_update')}
            disabled={isSending || isUploadingAttachment}
            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 active:bg-rose-950 disabled:opacity-50 text-rose-200 hover:text-white text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 border border-rose-800/80 cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>Traffic Delay</span>
          </button>
        </div>
      )}

      {/* Footer Area: Message Composer, Resolved Notice, or Read-Only Banner */}
      <div className="p-2 sm:p-3 bg-slate-900 border-t border-slate-800 w-full min-w-0 shrink-0 relative">
        {isResolved ? (
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs w-full min-w-0">
            <div className="flex items-center gap-2 text-slate-300 text-center sm:text-left min-w-0">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <strong className="text-white block font-semibold truncate">Conversation Resolved</strong>
                <span className="text-[11px] text-slate-400">
                  This conversation has been closed. Reopen to send additional messages.
                </span>
              </div>
            </div>
            <button
              id="driver-reopen-conv-btn"
              type="button"
              onClick={handleReopen}
              disabled={reopening}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 transition cursor-pointer flex items-center gap-2 shrink-0"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${reopening ? 'animate-spin' : ''}`} />
              <span>{reopening ? 'Reopening...' : 'Reopen Conversation'}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2 w-full min-w-0">
            {isLoadReadOnly && (
              <div
                id="driver-chat-readonly-notice"
                className="px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-2 text-xs text-slate-400"
              >
                <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>
                  {isLoadDelivered
                    ? 'This load has been delivered. Chat is read-only.'
                    : 'This load is closed. Chat is read-only.'}
                </span>
              </div>
            )}

            {/* Inline Attachment Error */}
            {attachmentError && (
              <div
                id="driver-attachment-error"
                className="px-3 py-2 rounded-lg bg-rose-950/80 border border-rose-800/80 text-rose-300 text-xs flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="truncate">{attachmentError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachmentError(null)}
                  className="p-1 text-rose-400 hover:text-white transition"
                  title="Dismiss error"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Inline Recording Error */}
            {recordingError && (
              <div
                id="driver-recording-error"
                className="px-3 py-2 rounded-lg bg-rose-950/80 border border-rose-800/80 text-rose-300 text-xs flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="truncate">{recordingError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setRecordingError(null)}
                  className="p-1 text-rose-400 hover:text-white transition"
                  title="Dismiss error"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Pending Attachment Preview Card */}
            {pendingAttachment && !isRecording && !recordedAudioBlob && (
              <div
                id="driver-pending-attachment-card"
                className="p-2 sm:p-2.5 rounded-xl bg-slate-950/90 border border-indigo-500/40 flex items-center justify-between gap-2.5 shadow-sm"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {pendingAttachment.mediaType === 'image' && pendingAttachment.previewUrl ? (
                    <img
                      src={pendingAttachment.previewUrl}
                      alt="Pending preview"
                      className="w-11 h-11 rounded-lg object-cover border border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-indigo-950/80 border border-indigo-800/80 flex items-center justify-center text-indigo-400 shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white truncate">
                      {pendingAttachment.fileName}
                    </p>
                    <p className="text-[10px] text-slate-400 flex items-center gap-2">
                      <span>{(pendingAttachment.fileSize / (1024 * 1024)).toFixed(2)} MB</span>
                      <span>•</span>
                      <span className="text-indigo-400 font-medium">Ready to send</span>
                    </p>
                  </div>
                </div>

                <button
                  id="driver-remove-pending-attachment-btn"
                  type="button"
                  onClick={handleRemovePendingAttachment}
                  disabled={isUploadingAttachment || isSending}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 transition cursor-pointer shrink-0 disabled:opacity-50"
                  title="Remove attachment"
                  aria-label="Remove attachment"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Attachment Chooser Popover */}
            {showAttachMenu && (
              <div
                ref={attachMenuRef}
                id="driver-attach-menu-popover"
                className="absolute bottom-16 left-2 sm:left-3 z-30 w-56 rounded-xl bg-slate-950 border border-slate-800 shadow-2xl p-1.5 space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-150"
              >
                <button
                  id="driver-attach-action-camera"
                  type="button"
                  onClick={() => {
                    cameraInputRef.current?.click();
                  }}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800/90 flex items-center gap-2.5 transition cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Take Photo</span>
                </button>

                <button
                  id="driver-attach-action-gallery"
                  type="button"
                  onClick={() => {
                    galleryInputRef.current?.click();
                  }}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800/90 flex items-center gap-2.5 transition cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Photo Library</span>
                </button>

                <button
                  id="driver-attach-action-document"
                  type="button"
                  onClick={() => {
                    documentInputRef.current?.click();
                  }}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800/90 flex items-center gap-2.5 transition cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Upload Document</span>
                </button>
              </div>
            )}

            {/* Active Recording State */}
            {isRecording ? (
              <div
                id="driver-active-recording-bar"
                className="p-2.5 rounded-xl bg-slate-950/95 border border-rose-500/60 flex items-center justify-between gap-3 shadow-md"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="relative flex h-3 w-3 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold text-white">
                      <span>Recording...</span>
                      <span className="font-mono text-rose-300">
                        {formatRecordingDuration(recordingDuration)}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Max 02:00 • Tap stop to review
                    </span>
                  </div>
                </div>

                <button
                  id="driver-msg-stop-record-btn"
                  type="button"
                  onClick={stopRecording}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-sm shrink-0"
                  title="Stop recording"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </button>
              </div>
            ) : recordedAudioBlob && recordedAudioUrl ? (
              /* Compact Audio Preview / Review State */
              <div
                id="driver-voice-preview-card"
                className="p-2 sm:p-2.5 rounded-xl bg-slate-950/95 border border-indigo-500/50 flex flex-col gap-2 shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400 shrink-0">
                      <Mic className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        Voice Message
                      </p>
                      <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                        <span className="font-mono text-indigo-300 font-medium">
                          {formatRecordingDuration(recordingDuration)}
                        </span>
                        {isMaxDurationReached && (
                          <span className="text-amber-400 font-medium">
                            (Max duration reached)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      id="driver-voice-discard-btn"
                      type="button"
                      onClick={handleDiscardRecording}
                      disabled={isUploadingVoice || isSending}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50 text-slate-300 hover:text-rose-300 text-xs font-medium transition cursor-pointer flex items-center gap-1 border border-slate-700"
                      title="Discard voice recording"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Discard</span>
                    </button>

                    <button
                      id="driver-voice-send-btn"
                      type="button"
                      onClick={handleSendVoiceRecording}
                      disabled={isUploadingVoice || isSending || isLoadReadOnly}
                      className="min-h-[36px] px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                      title="Send voice message"
                    >
                      {isUploadingVoice ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Send</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <audio
                  controls
                  preload="metadata"
                  src={recordedAudioUrl}
                  className="w-full h-8 accent-indigo-500 rounded"
                />
              </div>
            ) : (
              <form onSubmit={handleSend} className="w-full min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 w-full min-w-0">
                  {/* + Attachment Button */}
                  <button
                    id="driver-msg-attach-btn"
                    type="button"
                    disabled={isSending || isUploadingAttachment || isUploadingVoice || isLoadReadOnly}
                    onClick={() => setShowAttachMenu((prev) => !prev)}
                    className={`min-h-[44px] min-w-[44px] rounded-xl font-semibold transition cursor-pointer flex items-center justify-center shrink-0 border ${
                      showAttachMenu || pendingAttachment
                        ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/50'
                        : 'bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 hover:text-indigo-400 border-slate-700'
                    }`}
                    title="Attach photo or document"
                    aria-label="Add attachment"
                  >
                    <Plus className={`w-5 h-5 transition-transform duration-150 ${showAttachMenu ? 'rotate-45' : ''}`} />
                  </button>

                  <input
                    id="driver-msg-composer-input"
                    type="text"
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    placeholder={
                      isLoadReadOnly
                        ? isLoadDelivered
                          ? 'This load has been delivered. Chat is read-only.'
                          : 'This load is closed. Chat is read-only.'
                        : pendingAttachment
                        ? 'Add a caption (optional)...'
                        : 'Type message to dispatch...'
                    }
                    disabled={isSending || isUploadingAttachment || isUploadingVoice || isLoadReadOnly}
                    className="flex-1 min-w-0 bg-slate-950 border border-slate-800 focus:border-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed rounded-xl px-3.5 sm:px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-hidden min-h-[44px]"
                  />

                  {hasText || pendingAttachment ? (
                    <button
                      id="driver-msg-send-btn"
                      type="submit"
                      disabled={isSending || isUploadingAttachment || isUploadingVoice || isLoadReadOnly}
                      className="min-h-[44px] min-w-[48px] px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition cursor-pointer flex items-center justify-center shadow-sm shrink-0"
                      title={pendingAttachment ? 'Send attachment' : 'Send message to dispatch'}
                    >
                      {isSending || isUploadingAttachment ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  ) : (
                    <button
                      id="driver-msg-record-btn"
                      type="button"
                      onClick={handleStartRecording}
                      disabled={isSending || isUploadingAttachment || isUploadingVoice || isLoadReadOnly}
                      className="min-h-[44px] min-w-[48px] px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-indigo-400 hover:text-indigo-300 font-semibold transition cursor-pointer flex items-center justify-center shadow-sm shrink-0 border border-slate-700"
                      title="Record audio message"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
