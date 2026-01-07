import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import PptxGenJS from 'pptxgenjs';
import html2canvas from 'html2canvas';
import PropTypes from 'prop-types';
import { Avatar, IconButton, Tooltip, Snackbar, Alert, CircularProgress, Button } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DownloadIcon from '@mui/icons-material/Download';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check'; // Import the CheckIcon
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import ThumbDownOutlinedIcon from '@mui/icons-material/ThumbDownOutlined';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import powerpoint from '../../assets/powerpoint.svg';

import { useAddMessageFeedbackMutation } from '../../services/threadApi';
import {
  selectUser,
  selectCurrentPage,
  selectCurrentPageConversation,
  clearPageConversation,
  selectSelectedRole,
  selectSelectedIndustry,
} from '../../features/auth/authSlice';

import {
  notifyViaSnackBar,
  openFeedbackDialog,
  selectIsFeedbackEnabled,
  setSelectedMessages,
  getSelectedMessages,
  getConversationDetails,
  addOrUpdateMessageFeedback,
  deleteMessageFeedback,
} from '../../redux/store/conversationSlice';


import classes from './MessageBubble.module.scss';
import ErrorMessage from '../ErrorMessage';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { SENDER_TYPES } from '../../utils/constants';
import { CombinedMessage } from './MessageTypes';
import FileList from '../RenderFiles/RenderFile';
import ReactMarkdown from 'react-markdown';
import { selectRunningMessages } from '../../redux/store/queueSlice';

// Enable this flag for debug logging
const COMPLETED_STATUSES = ['complete', 'completed', 'queued', 'error'];
const PROGRESS_STATUSES = ['processing', 'in_progress', 'pending', 'inprogress'];

const triggerFileDownload = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};


const LoadingDots = () => (
  <div className={classes.loadingDots}>
    <span className={classes.dot}></span>
    <span className={classes.dot}></span>
    <span className={classes.dot}></span>
  </div>
);

// Format timestamp to display relative time (e.g., "Just now", "5 min ago")
const formatRelativeTime = (isoString) => {
  if (!isoString) return '';

  try {
    const date = new Date(isoString);
    const now = new Date();

    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date:', isoString);
      return '';
    }

    const diffInSeconds = Math.floor((now - date) / 1000);

    // Just now (less than 30 seconds ago)
    if (diffInSeconds < 30) {
      return 'Just now';
    }

    // Less than a minute
    if (diffInSeconds < 60) {
      return `${diffInSeconds} sec ago`;
    }

    // Less than an hour
    if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} min ago`;
    }

    // Less than a day
    if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hr ago`;
    }

    // Less than a week
    if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} day${days > 1 ? 's' : ''} ago`;
    }

    // More than a week - show date
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  } catch (error) {
    console.error('Error formatting relative timestamp:', error);
    return '';
  }
};

// Calculate time difference in seconds between two timestamps
const calculateTimeDifference = (currentTimestamp, previousTimestamp) => {
  if (!currentTimestamp || !previousTimestamp) {
    return null;
  }

  try {
    const currentDate = new Date(currentTimestamp);
    const previousDate = new Date(previousTimestamp);

    // Check if dates are valid
    if (isNaN(currentDate.getTime()) || isNaN(previousDate.getTime())) {
      return null;
    }

    // Calculate difference in seconds
    const diffInMilliseconds = currentDate.getTime() - previousDate.getTime();
    const diffInSeconds = Math.floor(diffInMilliseconds / 1000);

    return diffInSeconds;
  } catch (error) {
    console.error('Error calculating time difference:', error);
    return null;
  }
};

// Format latency for AI responses (e.g., "Latency: 2 sec")
const formatLatency = (seconds) => {
  if (seconds === null || seconds === undefined || seconds < 1) {
    return '';
  }

  if (seconds < 1) {
    return ''; // Handle edge case where timestamps might be out of order
  }

  if (seconds < 60) {
    return `Thought for: ${seconds} sec`;
  }

  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `Thought for: ${minutes} min ${remainingSeconds} sec` : `Thought for: ${minutes} min`;
  }

  const hours = Math.floor(seconds / 3600);
  const remainingMinutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  let result = `Thought for: ${hours} hr`;
  if (remainingMinutes > 0) result += ` ${remainingMinutes} min`;
  if (remainingSeconds > 0) result += ` ${remainingSeconds} sec`;

  return result;
};

// Helper function to check if content contains HTML tags
const containsHTML = (str) => {
  if (!str || typeof str !== 'string') return false;
  return /<[a-z][\s\S]*>/i.test(str);
};

// Enhanced function to clean and process text content
const processTextContent = (text) => {
  if (!text || typeof text !== 'string') return '';

  // Handle escape sequences and HTML entities - comprehensive list
  return text
    .replace(/\\r\\n/g, '\n') // Replace \r\n with actual line breaks
    .replace(/\\n/g, '\n') // Replace \n with actual line breaks
    .replace(/&#39;/g, "'") // Replace &#39; with apostrophe
    .replace(/&quot;/g, '"') // Replace &quot; with quote
    .replace(/&amp;/g, '&') // Replace &amp; with ampersand
    .replace(/&lt;/g, '<') // Replace &lt; with <
    .replace(/&gt;/g, '>') // Replace &gt; with >
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&bull;/g, '•') // Replace &bull; with bullet
    .replace(/&hellip;/g, '...') // Replace &hellip; with ellipsis
    .replace(/&ldquo;/g, '"') // Replace &ldquo; with left double quote
    .replace(/&rdquo;/g, '"') // Replace &rdquo; with right double quote
    .replace(/&lsquo;/g, "'") // Replace &lsquo; with left single quote
    .replace(/&rsquo;/g, "'") // Replace &rsquo; with right single quote
    .replace(/&ndash;/g, '–') // Replace &ndash; with en dash
    .replace(/&mdash;/g, '—') // Replace &mdash; with em dash
    .trim();
};

const MessageContent = memo(({ message, isInProgress, messageId }) => {
  if (isInProgress) {
    return <LoadingDots />;
  }

  try {
    // Parse message if it's a string in JSON format
    let parsedMessage = message;
    if (typeof message === 'string' && (message.startsWith('{') || message.startsWith('['))) {
      try {
        parsedMessage = JSON.parse(message);
      } catch {
        parsedMessage = message;
      }
    }

    // If parsed message is null or undefined, show loading
    if (parsedMessage == null) {
      return <LoadingDots />;
    }

    // Handle object case (already parsed or complex message)
    if (typeof parsedMessage === 'object') {
      parsedMessage = parsedMessage.result ? parsedMessage.result : parsedMessage;
      if (typeof parsedMessage === 'string' && (parsedMessage.startsWith('{') || parsedMessage.startsWith('['))) {
        try {
          parsedMessage = JSON.parse(parsedMessage);
        } catch {
          parsedMessage = message;
        }
      }

      // For task_id responses that are still loading
      if (parsedMessage.task_id && (!parsedMessage.file_url || !parsedMessage.result)) {
        return <LoadingDots />;
      } else if (parsedMessage.error) {
        return <ErrorMessage errMsg={parsedMessage.error} />;
      }

      // ENHANCED: Always try to route through CombinedMessage for ANY complex content
      const combinedContent = {};

      // Add insight if available (primary content)
      if (parsedMessage.insight) {
        combinedContent.insight = parsedMessage.insight;
      }

      // Add visualization if available
      if (parsedMessage.visualization) {
        combinedContent.visualization = parsedMessage.visualization;
      }

      // Add table if available
      if (parsedMessage.table) {
        combinedContent.table = parsedMessage.table;
      }

      // Add fileUrl if available - route through CombinedMessage
      if (parsedMessage.file_url || parsedMessage.fileUrl) {
        combinedContent.fileUrl = parsedMessage.file_url || parsedMessage.fileUrl;
      }

      // ENHANCED: Check for other potential content types that should be routed through CombinedMessage
      // This includes any structured data that might benefit from unified rendering
      if (parsedMessage.chart || parsedMessage.graph || parsedMessage.plot) {
        combinedContent.visualization = parsedMessage.chart || parsedMessage.graph || parsedMessage.plot;
      }

      // Check for alternative table formats
      if (parsedMessage.data && Array.isArray(parsedMessage.data)) {
        combinedContent.table = parsedMessage.data;
      }

      // If we have any content that can be handled by CombinedMessage, use it
      if (Object.keys(combinedContent).length > 0) {
        return <CombinedMessage content={combinedContent} messageId={messageId} />;
      }

      // FALLBACK: If no complex content, render as text through CombinedMessage with insight
      if (parsedMessage.insight || (typeof parsedMessage === 'object' && Object.keys(parsedMessage).length > 0)) {
        const textContent = parsedMessage.insight || JSON.stringify(parsedMessage, null, 2);
        return <CombinedMessage content={{ insight: textContent }} messageId={messageId}/>;
      }

      // Final fallback for edge cases
      return (
        <div className={classes.answerText}>
          <ReactMarkdown>{JSON.stringify(parsedMessage, null, 2)}</ReactMarkdown>
        </div>
      );
    }

    // Handle string case - route simple text through CombinedMessage for consistency
    const processedMessage = processTextContent(parsedMessage);

    // ENHANCED: Route all text content through CombinedMessage for consistent handling
    return <CombinedMessage content={{ insight: processedMessage }} />;
  } catch (error) {
    console.error('Message rendering error:', {
      error: error.message,
      message: typeof message === 'object' ? 'Complex object' : message,
    });

    // ENHANCED: Fallback also routes through CombinedMessage
    const fallbackContent = typeof message === 'string' ? processTextContent(message) : 'Error rendering message';
    return <CombinedMessage content={{ insight: fallbackContent }} messageId={id}/>;
  }
});

MessageContent.displayName = 'MessageContent';

const MessageBubble = ({
  message,
  isUser,
  userInitials,
  files,
  metadata,
  id,
  created_at,
  updated_at,
  messageid,
  sender_type,
  conversationId,
  feedback_reaction,
  previousMessage, // New prop for calculating time difference
}) => {
  const dispatch = useDispatch();
  const selectedMessages = useSelector(getSelectedMessages);
  const activeConversationId = useSelector(selectCurrentPageConversation);
  const runningMessagesRaw = useSelector(selectRunningMessages);
  // OPTIMIZED: Memoized runningMessages to prevent dependency changes
  const runningMessages = useMemo(() => runningMessagesRaw || {}, [runningMessagesRaw]);
  const conversationDetails = useSelector(getConversationDetails);
  const user = useSelector(selectUser);
  const selectedRole = useSelector(selectSelectedRole);
  const selectedIndustry = useSelector(selectSelectedIndustry);
  const selectedIndustryId = user?.industries?.find((i) => i.name === selectedIndustry)?.id;

  const selectedPersonaId = user?.industries
  ?.find((i) => i.name === selectedIndustry)
  ?.personas?.find((p) => p.name === selectedRole)?.id;

  // ADDED: Get the feedback toggle state from Redux
  const isFeedbackEnabled = useSelector(selectIsFeedbackEnabled);
  // const [currentReaction, setCurrentReaction] = useState(null);

  // Instantiate the mutation hook for submitting feedback
  const [addFeedback, { isLoading: isFeedbackLoading }] = useAddMessageFeedbackMutation();

  // Get the current reaction directly from the message's feedback_reaction prop
  const currentReaction = useMemo(() => {
    if (!feedback_reaction) return null;
    try {
      // The database may store the feedback as a JSON string, so we parse it
      const feedback = typeof feedback_reaction === 'string'
        ? JSON.parse(feedback_reaction)
        : feedback_reaction;
      return feedback?.reaction || null;
    } catch {
      // Fallback for simple string values
      return typeof feedback_reaction === 'string' ? feedback_reaction : null;
    }
  }, [feedback_reaction]);
    // Like button handler
    const handleLikeClick = async () => {
      const userEmail = user?.email;
      const baseURL = import.meta.env.VITE_API_BASE_URL;

      if (!userEmail) {
        console.error("User email missing.");
        return;
      }

      try {
        if (currentReaction === "like") {
          // DELETE feedback
          await fetch(`${baseURL}/api/conversation/${id}/feedback`, {
            method: "DELETE",
            credentials: 'include',
          });

          // Update Redux
          dispatch(deleteMessageFeedback(id));

          dispatch(
            notifyViaSnackBar({
              open: true,
              message: "Feedback removed",
              severity: "info",
            })
          );
        } else {
          // PATCH like
          const payload = {
            reaction: "like",
            email: userEmail,
            personaId: selectedPersonaId,
            conversationId: activeConversationId,
          };

          await fetch(`${baseURL}/api/conversation/${id}/feedback`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: 'include',
            body: JSON.stringify(payload),
          });

          // Update Redux
          dispatch(addOrUpdateMessageFeedback({ messageId: id, reaction: "like", comment: "" }));

          dispatch(
            notifyViaSnackBar({
              open: true,
              message: "Great!",
              severity: "success",
            })
          );
        }
      } catch (error) {
        console.error("Feedback error:", error);
        dispatch(
          notifyViaSnackBar({
            open: true,
            message: "Could not submit feedback",
            severity: "error",
          })
        );
      }
    };

    // Dislike / comment button handler
    const handleUnlikeClick = () => {
      // Open dialog to enter comment
      dispatch(openFeedbackDialog({ messageId: id }));

      // Optional: you could prefill the comment if previously disliked
      // const previousComment = messageFeedback[id]?.comment || "";
    };

  // Create separate refs for user and AI message bubbles
  const userMessageBubbleRef = useRef(null);
  const aiMessageBubbleRef = useRef(null);

  // Add a stable ref for files to prevent flickering
  const prevFilesRef = useRef(files);
  const lastRenderStateRef = useRef({
    isInProgress: false,
    showQueuedMessage: false,
  });

  // Add ref to track previous status
  const prevStatusRef = useRef(null);
  const isMountedRef = useRef(true);

  // --- START: Added state for copy feedback ---
  const [isCopied, setIsCopied] = useState(false);
  // --- END: Added state for copy feedback ---

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  // Add state to stabilize UI transitions
  const [stableQueuedMessage, setStableQueuedMessage] = useState(false);
  // Track stable state for isInProgress to prevent flickering
  const [stableIsInProgress, setStableIsInProgress] = useState(false);

  // --- START: Added effect for copy feedback timer ---
  useEffect(() => {
    if (isCopied) {
      const timer = setTimeout(() => {
        setIsCopied(false);
      }, 2000); // Reset after 2 seconds

      // Cleanup timer if the component unmounts
      return () => clearTimeout(timer);
    }
  }, [isCopied]);
  // --- END: Added effect for copy feedback timer ---

  // OPTIMIZED: Memoized selected state check with stable comparison
  const isSelected = useMemo(() => {
    return selectedMessages.some((selectedId) => String(selectedId) === String(id));
  }, [selectedMessages, id]);

  // Use the provided conversation ID if available, otherwise fall back to the active conversation ID
  const effectiveConversationId = conversationId || activeConversationId;

  // OPTIMIZED: Memoized source-to-response mapping with stable reference
  const sourceToResponseMap = useMemo(() => {
    if (!conversationDetails || !Array.isArray(conversationDetails)) {
      return new Map();
    }

    const map = new Map();
    conversationDetails.forEach((msg) => {
      if (msg && msg.source_msg_id) {
        const sourceId = String(msg.source_msg_id);
        if (!map.has(sourceId)) {
          map.set(sourceId, []);
        }
        map.get(sourceId).push(String(msg.id));
      }
    });

    return map;
  }, [conversationDetails]);

  // Track component unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Keep file reference stable during re-renders to prevent flickering
  useEffect(() => {
    // Only update the ref when files actually change in a meaningful way
    if (files && files.length > 0) {
      // Check if files actually changed (not just reference)
      const filesChanged =
        !prevFilesRef.current ||
        files.length !== prevFilesRef.current.length ||
        files.some(
          (file, index) => !prevFilesRef.current[index] || file.file_url !== prevFilesRef.current[index].file_url,
        );

      if (filesChanged) {
        prevFilesRef.current = files;
      }
    } else if (prevFilesRef.current && prevFilesRef.current.length > 0) {
      // Only clear if we actually had files before
      prevFilesRef.current = [];
    }
  }, [files]);

  // Helper function to check if a message has valid content to display
  const hasValidMessageContent = useMemo(() => {
    if (!message) return false;
    if (typeof message === 'string' && message.trim() === '') return false;
    if (typeof message === 'string' && message.toLowerCase() === 'null') return false;

    // Check if it's JSON with no meaningful content
    if (typeof message === 'string' && (message.startsWith('{') || message.startsWith('['))) {
      try {
        const parsed = JSON.parse(message);

        // Check if the parsed object is empty or null
        if (!parsed || (typeof parsed === 'object' && Object.keys(parsed).length === 0)) {
          return false;
        }

        // Check for important keys that indicate meaningful content
        if (parsed.insight || parsed.visualization || parsed.table || parsed.file_url || parsed.result?.file_url) {
          return true;
        }

        // Check for empty insight in parsed message
        if (parsed.insight === '' || parsed.insight === null) {
          return false;
        }
      } catch {
        // If we can't parse it, consider it valid content
      }
    }

    return true;
  }, [message]);

  // ENHANCED: Comprehensive message status extraction using priority order
  const extractMessageStatus = useCallback((msg) => {
    // STEP 1: Check metadata.agent_response.status (first priority)
    if (msg?.metadata?.agent_response?.status) {
      return String(msg.metadata.agent_response.status).toLowerCase();
    }

    // STEP 2: Check metadata.api_response_on_call.status (second priority)
    if (msg?.metadata?.api_response_on_call?.status) {
      return String(msg.metadata.api_response_on_call.status).toLowerCase();
    }

    // STEP 3: Check metadata.status (third priority)
    if (msg?.metadata?.status) {
      return String(msg.metadata.status).toLowerCase();
    }

    // STEP 4: Check direct status property of the message (last priority)
    if (msg?.status) {
      return String(msg.status).toLowerCase();
    }

    // If no status found, return null
    return null;
  }, []);

  // Determine message status using comprehensive function
  const messageStatus = useMemo(() => {
    // Only process status for AI messages
    if (isUser || sender_type === SENDER_TYPES.USER) {
      return null;
    }

    // First check the metadata
    if (metadata) {
      const metaStatus = extractMessageStatus({ metadata });
      if (metaStatus) return metaStatus;
    }

    // Try to parse message if it's a string
    if (typeof message === 'string') {
      try {
        const parsedMessage = JSON.parse(message);
        const parsedStatus = extractMessageStatus(parsedMessage);
        if (parsedStatus) return parsedStatus;
      } catch {
        // Not valid JSON, ignore
      }
    } else if (typeof message === 'object' && message) {
      // Direct message object
      const directStatus = extractMessageStatus(message);
      if (directStatus) return directStatus;
    }

    // Default status
    return files?.length > 0 ? 'completed' : null;
  }, [metadata, message, sender_type, files, extractMessageStatus, isUser]);

  // Determine if message is queued (showing message about background processing)
  const isQueued = useMemo(() => {
    if (!messageStatus) return false;
    return ['queued'].includes(messageStatus.toLowerCase());
  }, [messageStatus]);

  // Check if the message is in running queue - improved to handle both string and number IDs
  const isInRunningQueue = useMemo(() => {
    // Special handling for placeholder messages in new conversations
    if (id === 'ai_message_pending' || (conversationId && !isUser && !hasValidMessageContent)) {
      return true;
    }

    if (!effectiveConversationId || !messageid) return false;

    return runningMessages[effectiveConversationId]?.includes(messageid.toString());
  }, [runningMessages, effectiveConversationId, messageid, id, isUser, hasValidMessageContent, conversationId]);

  const isInProgress = useMemo(() => {
    // STEP 1: Check completed statuses first (highest priority)
    if (messageStatus && COMPLETED_STATUSES.includes(messageStatus.toLowerCase())) {
      return false;
    }

    // STEP 2: Check user messages (never show loading)
    if (isUser) {
      return false;
    }

    // STEP 3: Check metadata flags
    if (metadata?.isLocalPending || metadata?.isInProgress) {
      return true;
    }

    // STEP 4: For AI messages, check status and content
    if (sender_type === SENDER_TYPES.CHATAI || !isUser) {
      // Check for progress status indicators
      const statusIndicatesProgress = messageStatus && PROGRESS_STATUSES.includes(messageStatus.toLowerCase());

      if (statusIndicatesProgress) {
        return true;
      }

      // Check running queue status and content validity
      if (isInRunningQueue && !hasValidMessageContent) {
        return true;
      }
    }

    return false;
  }, [
    messageStatus,
    isUser,
    metadata?.isLocalPending,
    metadata?.isInProgress,
    sender_type,
    isInRunningQueue,
    hasValidMessageContent,
  ]);

  useEffect(() => {
    if (isInProgress) {
      setStableIsInProgress(true);
    } else {
      const timer = setTimeout(() => {
        if (isMountedRef.current) {
          setStableIsInProgress(false);
        }
      }, 100); // Faster transition out of loading state
      return () => clearTimeout(timer);
    }
  }, [isInProgress]);

  useEffect(() => {
    prevStatusRef.current = messageStatus;

    if ((isQueued || isInRunningQueue) && !isInProgress) {
      const timer = setTimeout(() => {
        if (isMountedRef.current) {
          setStableQueuedMessage(true);
        }
      }, 200); // Reduced delay for better responsiveness
      return () => clearTimeout(timer);
    } else if (!isQueued && !isInRunningQueue) {
      const timer = setTimeout(() => {
        if (isMountedRef.current) {
          setStableQueuedMessage(false);
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isQueued, isInRunningQueue, isInProgress, messageStatus]);

  // Store last render state to prevent flickering
  useEffect(() => {
    lastRenderStateRef.current = {
      isInProgress: stableIsInProgress,
      showQueuedMessage: stableQueuedMessage,
    };
  }, [stableIsInProgress, stableQueuedMessage]);

  // FIXED: Checkboxes are now always shown on AI messages, ignoring progress status
  const showCheckbox = !isUser;

  // Determine which timestamp to use - prefer updated_at if available
  const timestamp = useMemo(() => {
    // Get current message timestamp
    const currentTimestamp = updated_at || created_at;

    // First check metadata.updated_at (sometimes stored there)
    const effectiveTimestamp = metadata?.updated_at || currentTimestamp;

    // Always format the relative timestamp first
    const relativeTimestamp = formatRelativeTime(effectiveTimestamp);

    // For user messages, show only relative timestamp
    if (isUser) {
      return relativeTimestamp;
    }

    // For AI messages, show relative timestamp
    // If we have a previous message (user question), also calculate latency
    if (!previousMessage || !effectiveTimestamp) {
      return relativeTimestamp;
    }

    // Get previous message timestamp (should be the user question)
    const previousTimestamp = previousMessage.updated_at || previousMessage.created_at;

    // If we can't get previous timestamp, show relative timestamp only
    if (!previousTimestamp) {
      return relativeTimestamp;
    }

    // Calculate latency from the user question
    const latencySeconds = calculateTimeDifference(effectiveTimestamp, previousTimestamp);
    const latencyFormatted = formatLatency(latencySeconds);

    // If latency calculation failed, show relative timestamp only
    if (!latencyFormatted) {
      return relativeTimestamp;
    }

    // For AI messages, show relative timestamp and latency on separate lines
    return relativeTimestamp;
  }, [updated_at, created_at, metadata, previousMessage, isUser]);

  // Calculate latency separately for AI messages to display as a separate element
  const latency = useMemo(() => {
    // Only calculate latency for AI messages
    if (isUser || !previousMessage) {
      return null;
    }

    const currentTimestamp = updated_at || created_at;
    const effectiveTimestamp = metadata?.updated_at || currentTimestamp;
    const previousTimestamp = previousMessage.updated_at || previousMessage.created_at;

    if (!effectiveTimestamp || !previousTimestamp) {
      return null;
    }

    const latencySeconds = calculateTimeDifference(effectiveTimestamp, previousTimestamp);
    return formatLatency(latencySeconds);
  }, [updated_at, created_at, metadata, previousMessage, isUser]);

  // FIXED: Simplified handleSelect function, as "select mode" is removed
  const handleSelect = useCallback(
    (messageId) => {
      const messageIdStr = String(messageId);
      const isCurrentlySelected = selectedMessages.some((id) => String(id) === messageIdStr);

      if (isCurrentlySelected) {
        // Deselecting the message
        const updatedMessages = selectedMessages.filter((id) => String(id) !== messageIdStr);
        dispatch(setSelectedMessages(updatedMessages));
      } else {
        // Selecting the message
        const updatedMessages = [...selectedMessages, messageIdStr];
        dispatch(setSelectedMessages(updatedMessages));
      }
    },
    [dispatch, selectedMessages],
  );

  // Extract plain text content from the message bubble
  const extractTextContent = useCallback(() => {
    // Helper function to strip HTML and format text
    const stripHtmlAndFormat = (htmlString) => {
      if (!htmlString || typeof htmlString !== 'string') return '';
    
      if (containsHTML(htmlString)) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;
    
        const processList = (list, depth = 0) => {
          let text = '';
          const items = Array.from(list.children);
          items.forEach((item) => {
            if (item.tagName.toLowerCase() === 'li') {
              const clone = item.cloneNode(true);
              const nestedLists = clone.querySelectorAll('ul, ol');
              nestedLists.forEach((nested) => nested.remove());
    
              const itemText = clone.textContent.trim();
              if (itemText) {
                const prefix = '  '.repeat(depth) + '• ';
                text += prefix + itemText + '\n';
              }
    
              const originalNestedLists = item.querySelectorAll('ul, ol');
              originalNestedLists.forEach((nestedList) => {
                text += processList(nestedList, depth + 1);
              });
            }
          });
          return text;
        };
    
        const lists = tempDiv.querySelectorAll('ul, ol');
        let listText = '';
        lists.forEach((list) => {
          listText += processList(list);
        });
    
        lists.forEach((list) => list.remove());
    
        const content = tempDiv.textContent || tempDiv.innerText || '';
    
        // ✅ Merge normal text + list text
        let finalText = '';
        if (content.trim()) {
          finalText += content.replace(/\s+/g, ' ').trim() + '\n';
        }
        if (listText.trim()) {
          finalText += listText;
        }
    
        return finalText.trim();
      }
    
      return processTextContent(htmlString);
    };
    
    let content = '';
    if (isUser) {
      content = typeof message === 'string' ? stripHtmlAndFormat(message) : JSON.stringify(message, null, 2);
    } else {
      // For AI responses, try to extract content from various formats
      if (typeof message === 'string') {
        try {
          const parsed = JSON.parse(message);
          if (parsed.insight) {
            content = stripHtmlAndFormat(parsed.insight);
          } else {
            content = JSON.stringify(parsed, null, 2);
          }
        } catch {
          content = stripHtmlAndFormat(message);
        }
      } else if (typeof message === 'object' && message) {
        if (message.insight) {
          content = stripHtmlAndFormat(message.insight);
        } else {
          content = JSON.stringify(message, null, 2);
        }
      }
    }
    return content || '';
  }, [isUser, message]);

  // --- START: Updated handleCopyContent function ---
  const handleCopyContent = useCallback(async () => {
    if (isCopied) return; // Prevent re-copying while checkmark is visible

    try {
      const text = extractTextContent();
      await navigator.clipboard.writeText(text);
      setIsCopied(true); // Set state to show checkmark
    } catch (err) {
      console.error('Failed to copy content:', err);
      // Optionally show an error snackbar
      setSnackbarMessage('Failed to copy content');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  }, [extractTextContent, isCopied]);
  // --- END: Updated handleCopyContent function ---


  const fileInfo = useMemo(() => {
    if (isUser || !message || typeof message !== "string") {
      return { fileLink: null, fileType: null };
    }

    try {
      const outer = JSON.parse(message);

      // Check file_info first
      if (outer.file_info?.link) {
        return {
          fileLink: outer.file_info.link,
          fileType: outer.file_info.file_type || "file",
        };
      }

      // Fallback: check outer.result
      if (outer.result && typeof outer.result === "string") {
        const inner = JSON.parse(outer.result);
        if (inner.file_url) {
          return { fileLink: inner.file_url, fileType: "file" }; // Assume generic file type if not specified
        }
      }
    } catch (err) {
      // Not a JSON string or parsing failed, do nothing
    }

    return { fileLink: null, fileType: null };
  }, [message, isUser, id]);

  const handleDownloadFile = (blobLink, messageId, fallbackName = "chat.pptx") => {
    if (!blobLink) {
      console.warn(`[MessageBubble ID: ${messageId}] - Tried to download but no file link`);
      dispatch(
        notifyViaSnackBar({
          open: true,
          message: "⚠️ No PPT file available for this response,try to create ppt first",
          severity: "warning",
        })
      );
      return;
    }
  
    console.log(`[Download Clicked] Message ID: ${messageId}, File Link: ${blobLink}`);
  
    const a = document.createElement("a");
    a.href = blobLink;
    a.download = fallbackName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  
    console.log(`[MessageBubble ID: ${messageId}] - Download started for ${fallbackName}`);
  
    dispatch(
      notifyViaSnackBar({
        open: true,
        message: "📥 Your PPT download has started!",
        severity: "success",
      })
    );
  };

  // Enhanced function to download message as PDF with progress
  const handleDownloadPDF = useCallback(async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      // First hide the action buttons and select button
      if (isUser && userMessageBubbleRef.current) {
        const actionButtons = userMessageBubbleRef.current.querySelector(`.${classes.messageActions}`);
        const selectButton = userMessageBubbleRef.current
          .closest(`.${classes.messageContainer}`)
          .querySelector(`.${classes.selectButton}`);

        if (actionButtons) actionButtons.style.display = 'none';
        if (selectButton) selectButton.style.display = 'none';

        // Create a reference to the message bubble
        const element = userMessageBubbleRef.current;

        // Import dependencies
        const { jsPDF } = await import('jspdf');
        const html2canvas = (await import('html2canvas')).default;

        // Initialize PDF document
        const pdf = new jsPDF('p', 'pt', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 40;

        // Get canvas from html
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
        });

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = pageWidth - 2 * margin;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // Check if content fits on a single page
        if (imgHeight <= pageHeight - 2 * margin) {
          // Content fits on single page - simply add it
          pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
        } else {
          // Content requires multiple pages
          // First page
          pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, Math.min(imgHeight, pageHeight - 2 * margin));

          let remainingHeight = imgHeight - (pageHeight - 2 * margin);
          let sourceY = pageHeight - 2 * margin;

          // Add additional pages only if needed
          while (remainingHeight > 0) {
            pdf.addPage();

            // Calculate how much can fit on this page
            const heightOnThisPage = Math.min(remainingHeight, pageHeight - 2 * margin);

            // Add portion of the image to this page
            pdf.addImage(
              imgData,
              'PNG',
              margin, // x position
              margin, // y position on page
              imgWidth,
              heightOnThisPage,
              '', // alias
              'FAST', // compression
              -sourceY, // vertical offset in original image
            );

            // Update remaining height and source position
            remainingHeight -= heightOnThisPage;
            sourceY += heightOnThisPage;
          }
        }

        setDownloadProgress(95);

        // Generate the PDF file
        pdf.save(`message-${id}.pdf`);

        // Restore the action buttons and select button
        if (actionButtons) actionButtons.style.display = '';
        if (selectButton) selectButton.style.display = '';
      } else if (!isUser && aiMessageBubbleRef.current) {
        const actionButtons = aiMessageBubbleRef.current.querySelector(`.${classes.messageActions}`);
        const selectButton = aiMessageBubbleRef.current
          .closest(`.${classes.messageContainer}`)
          .querySelector(`.${classes.selectButton}`);

        if (actionButtons) actionButtons.style.display = 'none';
        if (selectButton) selectButton.style.display = 'none';

        // Find all chart canvases in the message
        const chartCanvases = aiMessageBubbleRef.current.querySelectorAll(`.${classes.chartCanvas}`);

        // Get html2canvas and jsPDF
        const { jsPDF } = await import('jspdf');
        const html2canvas = (await import('html2canvas')).default;

        // Initialize PDF document
        const pdf = new jsPDF('p', 'pt', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 40;

        // Wait for all charts to render completely before capturing
        // This is crucial for proper chart rendering
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Prepare canvas options with special handling for Chart.js
        const canvasOptions = {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          // This is key for Chart.js canvases
          onclone: (clonedDoc) => {
            // Find charts in the cloned document and ensure they're visible
            const clonedCharts = clonedDoc.querySelectorAll(`.${classes.chartCanvas}`);
            clonedCharts.forEach((canvas, i) => {
              if (chartCanvases[i] && canvas) {
                // Copy the rendered chart to the cloned canvas
                const context = canvas.getContext('2d');
                context.drawImage(chartCanvases[i], 0, 0);
              }
            });
          },
        };

        // Get canvas from html with chart handling
        const canvas = await html2canvas(aiMessageBubbleRef.current, canvasOptions);

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = pageWidth - 2 * margin;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // Check if content fits on a single page
        if (imgHeight <= pageHeight - 2 * margin) {
          // Content fits on single page - simply add it
          pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
        } else {
          // Content requires multiple pages
          // First page
          pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, Math.min(imgHeight, pageHeight - 2 * margin));

          let remainingHeight = imgHeight - (pageHeight - 2 * margin);
          let sourceY = pageHeight - 2 * margin;

          // Add additional pages only if needed
          while (remainingHeight > 0) {
            pdf.addPage();

            // Calculate how much can fit on this page
            const heightOnThisPage = Math.min(remainingHeight, pageHeight - 2 * margin);

            // Add portion of the image to this page
            pdf.addImage(
              imgData,
              'PNG',
              margin, // x position
              margin, // y position on page
              imgWidth,
              heightOnThisPage,
              '', // alias
              'FAST', // compression
              -sourceY, // vertical offset in original image
            );

            // Update remaining height and source position
            remainingHeight -= heightOnThisPage;
            sourceY += heightOnThisPage;
          }
        }

        setDownloadProgress(95);

        // Generate the PDF file
        pdf.save(`message-${id}.pdf`);

        // Restore the action buttons and select button
        if (actionButtons) actionButtons.style.display = '';
        if (selectButton) selectButton.style.display = '';
      }

      setDownloadProgress(100);
    } catch (err) {
      console.error('Failed to download as PDF:', err);
      setSnackbarMessage('Failed to download PDF. Please try again.');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress(0);
      }, 500);
    }
  }, [isUser, id, isDownloading]);

  // Handle closing the snackbar
  const handleCloseSnackbar = useCallback((event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
  }, []);

  // Safely get user initials
  const safeUserInitials = useMemo(() => {
    if (userInitials) return userInitials;
    if (!user || !user.given_name) return '';

    return user.given_name
      .split(' ')
      .map((name) => name[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  }, [user, userInitials]);

  return (
    <div
      className={`${classes.messageContainer} ${isUser ? classes.userMessage : classes.aiMessage}`}
      data-message-id={id}
      data-conversation-id={conversationId}>
      <div className={classes.messageContent}>
        {!isUser && (
          <div className={classes.aiAvatarContainer}>
            <Avatar className={classes.aiAvatar}>
              <SmartToyOutlinedIcon />
            </Avatar>
          </div>
        )}

        <div
          className={`${isUser ? classes.userMessageBubble: classes.aiMessageBubble}`}
          ref={isUser ? userMessageBubbleRef : aiMessageBubbleRef}>

          {/* updated today - FIX: Made file type check case-insensitive */}
          {/* Conditionally render Download button or Message content */}
          {fileInfo.fileLink && fileInfo.fileType && ['ppt', 'pptx'].includes(fileInfo.fileType.toLowerCase()) ? (
              <div className={classes.fileViewerContainer}>
                  <Button
                      variant="outlined"
                      startIcon={isDownloading ? <CircularProgress size={16} /> :  <img src={powerpoint} alt="ppt" style={{ width: 20, height: 20 }} />}
                      onClick={() => handleDownloadFile(fileInfo.fileLink, id, `presentation_${id}.pptx`)}
                      disabled={isDownloading}
                      className={classes.viewFileButton}
                  >
                      {isDownloading ? 'Downloading...' : 'Download PPT'}
                  </Button>
              </div>
          ) : (
              <MessageContent message={message} isInProgress={stableIsInProgress} messageId={id} />
          )}


          {/* Render files below the message content */}
          {files && files.length > 0 && <FileList files={files} messageid={id} />}

          {/* Action buttons and timestamp container */}
          <div className={classes.actionAndTimeContainer}>
            <div className={classes.timestampContainer}>
              <div className={classes.timestamp}>{timestamp}</div>
              {/* Show latency for AI messages */}
              {!isUser && (
                <div className={classes.latency}>
                  {stableIsInProgress ? 'Thinking...' : latency && latency !== 'Thought for: 0 sec' ? latency : null}
                </div>
              )}
            </div>
            {!isUser && !stableIsInProgress && (
              <div className={classes.messageActions}>
                {/* --- START: Updated Copy Button --- */}
                <Tooltip title={isCopied ? "Copied!" : "Copy"}>
                  <IconButton
                    onClick={handleCopyContent}
                    disabled={isDownloading}
                    className={`${classes.actionButton} ${isCopied ? classes.copied : ''}`}
                    size="small">
                    <ContentCopyIcon className={classes.copyIcon} fontSize="small" />
                    <CheckIcon className={classes.checkIcon} fontSize="small" />
                  </IconButton>
                </Tooltip>
                {/* --- END: Updated Copy Button --- */}
                <Tooltip title="Download as PDF">
                  <IconButton
                    onClick={handleDownloadPDF}
                    disabled={isDownloading}
                    className={classes.actionButton}
                    size="small">
                    {isDownloading ? (
                      <CircularProgress variant="determinate" value={downloadProgress} size={18} thickness={5} />
                    ) : (
                      <PictureAsPdfIcon fontSize="small" />
                    )}
                  </IconButton>
                </Tooltip>

                {/* ADDED: Conditional rendering block for feedback icons */}
                {/* {isFeedbackEnabled && ( */}
                  <>
                   <Tooltip title="Like">
                    <IconButton
                      size="small"
                      className={classes.actionButton}
                      onClick={handleLikeClick}
                      sx={{ color: currentReaction === 'like' ? 'primary.main' : 'inherit' }}
                    >
                      {currentReaction === 'like' ? <ThumbUpIcon fontSize="small" /> : <ThumbUpOutlinedIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Dislike">
                    <IconButton
                      size="small"
                      className={classes.actionButton}
                      onClick={handleUnlikeClick}
                      sx={{ color: currentReaction === 'dislike' ? 'error.main' : 'inherit' }}
                    >
                      {currentReaction === 'dislike' ? <ThumbDownIcon fontSize="small" /> : <ThumbDownOutlinedIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  </>
                {/* )} */}
              </div>
            )}
            {isUser && (
              <div className={classes.messageActions}>
                {/* --- START: Updated Copy Button for User Messages --- */}
                <Tooltip title={isCopied ? "Copied!" : "Copy"}>
                  <IconButton
                    onClick={handleCopyContent}
                    disabled={isDownloading}
                    className={`${classes.actionButton} ${isCopied ? classes.copied : ''}`}
                    size="small">
                    <ContentCopyIcon className={classes.copyIcon} fontSize="small" />
                    <CheckIcon className={classes.checkIcon} fontSize="small" />
                  </IconButton>
                </Tooltip>
                {/* --- END: Updated Copy Button for User Messages --- */}
              </div>
            )}
          </div>

          {/* Show selection checkbox - positioned on top right edge of bubble */}
          {/* {showCheckbox && (
            <IconButton
              className={`${classes.selectButton} ${isSelected ? classes.selected : ''}`}
              onClick={() => handleSelect(id)}
              size="small">
              {isSelected ? (
                <CheckCircleIcon fontSize="small" className={classes.selectedIcon} />
              ) : (
                <RadioButtonUncheckedIcon fontSize="small" className={classes.unselectedIcon} />
              )}
            </IconButton>
          )} */}
        </div>

        {isUser && (
          <div className={classes.userAvatarContainer}>
            <Avatar className={classes.userAvatar}>{safeUserInitials}</Avatar>
          </div>
        )}
      </div>

      <Snackbar open={snackbarOpen} autoHideDuration={3000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbarSeverity}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </div>
  );
};

MessageContent.propTypes = {
  message: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  isInProgress: PropTypes.bool.isRequired,
};

MessageBubble.propTypes = {
  message: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  isUser: PropTypes.bool.isRequired,
  userInitials: PropTypes.string,
  files: PropTypes.arrayOf(
    PropTypes.shape({
      file_name: PropTypes.string,
      file_url: PropTypes.string,
    }),
  ),
  metadata: PropTypes.shape({
    status: PropTypes.string,
    agent_response: PropTypes.object,
    updated_at: PropTypes.string,
    isLocalPending: PropTypes.bool,
    isInProgress: PropTypes.bool,
  }),
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  created_at: PropTypes.string,
  updated_at: PropTypes.string,
  messageid: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  sender_type: PropTypes.string,
  conversationId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  feedback_reaction: PropTypes.any,
  previousMessage: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    created_at: PropTypes.string,
    updated_at: PropTypes.string,
    metadata: PropTypes.object,
  }),
};

export default memo(MessageBubble);
