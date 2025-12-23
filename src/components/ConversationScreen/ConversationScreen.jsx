import React,{ useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import PropTypes from 'prop-types';
import { Box, Skeleton, Typography, Button } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { useGetConversationDetailsByIdQuery } from '../../services/conversationApi';
import {
  getConversationDetails,
  notifyViaSnackBar,
  getIsCreatingConversation,
  getIsLoadingConversationData,
  updateMessageResponseInConversation,
} from '../../redux/store/conversationSlice';
import { selectCurrentPageConversation as getConversationId } from '../../features/auth/authSlice';
import keycloak from '../../utils/keycloak';
import MessageBubble from '../MessageBubble/MessageBubble';
import { addToRunning, removeFromRunning, addToQueue, selectRunningMessages } from '../../redux/store/queueSlice';
import { getSocket, initSocket } from '../../utils/socket';
import { joinConversation, leaveConversation } from '../../utils/socket/socketActions';
import { SENDER_TYPES, CONVERSATION_SCREEN, SOCKET_EVENTS } from '../../utils/constants';
import { store } from '../../redux/store';
import classes from './ConversationScreen.module.scss';
import SuggestedQuestions from '../SuggestedQuestions/SuggestedQuestions';

const LoadingSkeleton = memo(() => (
  <Box className={classes.loadingSkeleton}>
    {[...Array(3)].map((_, index) => (
      <Box key={index} className={`${classes.skeletonItem} ${index % 2 === 0 ? classes.left : classes.right}`}>
        <Box className={classes.avatarSkeleton}>
          <Skeleton variant="circular" width={32} height={32} />
        </Box>
        <Box className={classes.contentSkeleton}>
          <Skeleton variant="text" width="60%" height={20} sx={{ mb: 1 }} />
          <Skeleton variant="rectangular" height={60} />
          {index === 1 && (
            <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
              <Skeleton variant="rectangular" width={100} height={32} />
              <Skeleton variant="rectangular" width={100} height={32} />
            </Box>
          )}
        </Box>
      </Box>
    ))}
  </Box>
));

LoadingSkeleton.displayName = 'LoadingSkeleton';

// Azure-optimized polling intervals for responsive updates
const MAX_RECONNECTION_ATTEMPTS = 3; // Increased from 2
const MIN_POLL_INTERVAL = 3000; // Reduced from 10000

/**
 * ConversationScreen component - Displays chat messages with Azure-optimized WebSocket management
 *
 * Improved for Azure:
 * - Stable component ID to prevent reconnection loops
 * - Coordinated room management with ThreadsPanel
 * - Graceful fallback to polling when WebSockets fail
 * - Improved reconnection logic for Azure Load Balancer
 * - Support for Redis-based messaging patterns
 * - Status-triggered polling for in-progress messages
 * - Local loading state management for pending AI responses
 * - Optimized polling intervals for better responsiveness
 */
const ConversationScreen = ({ id, stableInstanceId = 'main', onSuggestedQuestionClick }) => {
  const dispatch = useDispatch();
  const messageContainerRef = useRef(null);
  const isCurrentlyClearing = useRef(false);
  const previousMessagesRef = useRef([]);
  const currentChatIdRef = useRef(null);
  const fallbackPollingRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const componentIdRef = useRef(`ConversationScreen-${stableInstanceId}`);
  const lastPollTimeRef = useRef(0);
  const componentMountedRef = useRef(true);
  const previousConversationIdRef = useRef(null);

  const user = keycloak?.idTokenParsed;
  const runningMessages = useSelector(selectRunningMessages);

  // Socket reference
  const socket = getSocket();
  const [socketConnected, setSocketConnected] = useState(socket?.connected || false);

  const [messages, setMessages] = useState([]);
  const [hasError, setHasError] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);

  // NEW: Local state for pending AI responses
  const [pendingAIResponses, setPendingAIResponses] = useState(new Map());
  const pendingResponseTimeouts = useRef(new Map());

  // New state for tracking processing messages that need polling
  const [processingMessages, setProcessingMessages] = useState(new Set());
  const processingPollingRef = useRef(null);

  const conversationDetails = useSelector(getConversationDetails);
  const isCreatingConversation = useSelector(getIsCreatingConversation);
  const isLoadingConversationData = useSelector(getIsLoadingConversationData);
  const storedConversationId = useSelector(getConversationId);

  // Track mounted state for safer async operations
  useEffect(() => {
    componentMountedRef.current = true;
    return () => {
      componentMountedRef.current = false;
      // Clean up pending response timeouts - copy ref to avoid stale closure
      const currentTimeouts = { ...pendingResponseTimeouts.current };
      Object.values(currentTimeouts).forEach((timeoutId) => clearTimeout(timeoutId));
      pendingResponseTimeouts.current = {};
    };
  }, []);

  const effectiveId = useMemo(() => {
    const newId = id === 'new' ? storedConversationId : id;
    if (newId !== currentChatIdRef.current) {
      currentChatIdRef.current = newId;
    }
    return newId;
  }, [id, storedConversationId]);

  const userInitials = useMemo(() => {
    if (!user?.given_name) return '';
    return user.given_name
      .split(' ')
      .map((name) => name[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  }, [user]);

  const { error: conversationError, refetch: refetchConversation } = useGetConversationDetailsByIdQuery(effectiveId, {
    skip: !effectiveId || effectiveId === 'new',
    // Disable automatic refetching since WebSockets handle real-time updates
    refetchOnMountOrArgChange: false,
    refetchOnReconnect: false,
    refetchOnFocus: false,
    // Only fetch initial data, let WebSockets handle updates
  });

  // FIXED: Function to create a local AI loading message with stable key
  const createLocalAILoadingMessage = useCallback(
    (userMessage, sourceMessageId) => {
      const loadingMessageId = `ai-loading-${sourceMessageId}`;

      return {
        id: loadingMessageId,
        conversation_id: effectiveId,
        source_msg_id: sourceMessageId,
        message: '',
        message_type: 'text',
        sender_type: SENDER_TYPES.AI,
        files: userMessage?.files || [],
        metadata: {
          status: 'PENDING',
          isLocalPending: true,
          userQuery: userMessage?.message || '',
          userFiles: userMessage?.files || [],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        isUser: false,
        // Use sourceMessageId for stable key instead of Date.now()
        _statusKey: `pending-${sourceMessageId}-${effectiveId}`,
      };
    },
    [effectiveId],
  );
   

  const removePendingAIResponse = useCallback((sourceMessageId) => {
    setPendingAIResponses((prev) => {
      if (!prev.has(sourceMessageId)) return prev;
      const newMap = new Map(prev);
      newMap.delete(sourceMessageId);
      return newMap;
    });
    const timeoutId = pendingResponseTimeouts.current.get(sourceMessageId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      pendingResponseTimeouts.current.delete(sourceMessageId);
    }
  }, []);

  // FIXED: Function to add a pending AI response with better duplicate prevention
  const addPendingAIResponse = useCallback((userMessage, sourceMessageId) => {
    if (!effectiveId || effectiveId === 'new') return;
    const loadingMessage = createLocalAILoadingMessage(userMessage, sourceMessageId);
    setPendingAIResponses((prev) => {
      if (prev.has(sourceMessageId)) return prev;
      const newMap = new Map(prev);
      newMap.set(sourceMessageId, loadingMessage);
      return newMap;
    });
    const timeoutId = setTimeout(() => {
      if (componentMountedRef.current) {
        removePendingAIResponse(sourceMessageId);
      }
    }, 30000);
    pendingResponseTimeouts.current.set(sourceMessageId, timeoutId);
  }, [effectiveId, createLocalAILoadingMessage, removePendingAIResponse]);

  

  // FIXED: Effect to prevent multiple triggers
  useEffect(() => {
    if (!conversationDetails?.length || !componentMountedRef.current) return;

    const userMessages = conversationDetails.filter((msg) => msg.sender_type === SENDER_TYPES.USER);
    const aiMessages = conversationDetails.filter((msg) => msg.sender_type === SENDER_TYPES.AI);

    userMessages.forEach((userMsg) => {
      // Check if this user message has a corresponding AI response
      const hasAIResponse = aiMessages.some(
        (aiMsg) => aiMsg.source_msg_id === userMsg.id && !aiMsg.metadata?.isLocalPending,
      );

      // Only add pending response for recent messages and if not already exists
      if (!hasAIResponse && !pendingAIResponses.has(userMsg.id)) {
        const messageAge = Date.now() - new Date(userMsg.created_at).getTime();
        if (messageAge < 30000) {
          // Only for messages less than 30 seconds old
          addPendingAIResponse(userMsg, userMsg.id);
        }
      }

      // Remove pending response if real response exists
      if (hasAIResponse && pendingAIResponses.has(userMsg.id)) {
        removePendingAIResponse(userMsg.id);
      }
    });
  }, [conversationDetails, pendingAIResponses, addPendingAIResponse, removePendingAIResponse]);

  // FIXED: Better cleanup when conversation changes
  useEffect(() => {
    // Clear all pending responses when conversation changes
    const currentTimeouts = pendingResponseTimeouts.current;
    return () => {
      currentTimeouts.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      currentTimeouts.clear();
    };
  }, [effectiveId]);

  // Helper function to check if all messages for a conversation are complete and clean up
  const checkAndCleanupConversation = useCallback(() => {
    if (!effectiveId || effectiveId === 'new') return;

    // Check if conversation has any running messages
    const hasRunningMessages = Boolean(runningMessages[effectiveId]?.length);

    // Check if any messages are still being processed
    const hasProcessingMessages = processingMessages.size > 0;

    // Check if there are any pending AI responses
    const hasPendingResponses = pendingAIResponses.size > 0;

    // If all messages are completed, clean up polling but NOT the queue state
    if (!hasRunningMessages && !hasProcessingMessages && !hasPendingResponses) {
      // Clean up fallback polling
      if (fallbackPollingRef.current) {
        clearInterval(fallbackPollingRef.current);
        fallbackPollingRef.current = null;
      }

      // Clean up processing polling
      if (processingPollingRef.current) {
        clearInterval(processingPollingRef.current);
        processingPollingRef.current = null;
      }
    }
  }, [effectiveId, runningMessages, processingMessages, pendingAIResponses.size]);

  // Throttled refetch function - for both initial load and backup polling
  const throttledRefetch = useCallback(
    async (forceInitialLoad = false, isBackupPoll = false) => {
      // Don't refetch if component is unmounted
      if (!componentMountedRef.current) return;

      // For backup polling and initial load, always allow refetch regardless of WebSocket status
      // Only skip for regular calls when WebSocket is connected
      if (socketConnected && !forceInitialLoad && !isBackupPoll) {
        return;
      }

      const now = Date.now();
      const timeSinceLastPoll = now - lastPollTimeRef.current;

      // Ensure polls are at least MIN_POLL_INTERVAL apart (except for initial load)
      if (!forceInitialLoad && timeSinceLastPoll < MIN_POLL_INTERVAL) {
        return;
      }

      // Record this poll time
      lastPollTimeRef.current = now;

      // Add random jitter (0-1000ms) to prevent synchronized requests (except for initial load)
      if (!forceInitialLoad) {
        // const jitter = Math.floor(Math.random() * 1000);
        const jitter = window.crypto.getRandomValues(new Uint32Array(1))[0]%1000;
        await new Promise((resolve) => setTimeout(resolve, jitter));
      }

      try {
        await refetchConversation();
      } catch (error) {
        if (componentMountedRef.current) {
          console.error('Refetch error:', error);
        }
      }
    },
    [refetchConversation, socketConnected],
  );

  // Initialize socket if needed - specifically for Azure environments
  useEffect(() => {
    if (!socket && keycloak?.token) {
      initSocket(keycloak.token);
    }
  }, [socket]);

  // Socket connection status monitoring with Azure-specific improvements
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      if (componentMountedRef.current) {
        setSocketConnected(true);
        reconnectAttemptsRef.current = 0;

        // When reconnected, rejoin the conversation room and refetch to ensure latest data
        if (effectiveId && effectiveId !== 'new') {
          joinConversation(effectiveId, dispatch, componentIdRef.current);
          throttledRefetch();
        }
      }
    };

    const handleDisconnect = (reason) => {
      if (componentMountedRef.current) {
        setSocketConnected(false);

        // Clear any existing polling timer first
        if (fallbackPollingRef.current) {
          clearInterval(fallbackPollingRef.current);
          fallbackPollingRef.current = null;
        }

        // Only show notification for non-normal disconnects (Azure Load Balancer disconnects are normal)
        if (reason !== 'io client disconnect' && reason !== 'io server disconnect') {
          dispatch(
            notifyViaSnackBar({
              message: `Real-time updates temporarily unavailable. Using fallback mode.`,
              severity: 'warning',
              open: true,
            }),
          );
        }
      }
    };

    const handleConnectError = (error) => {
      reconnectAttemptsRef.current++;
      console.error(
        `Socket connection error (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECTION_ATTEMPTS}):`,
        error.message,
      );

      // After max attempts, notify user about fallback mode
      if (reconnectAttemptsRef.current >= MAX_RECONNECTION_ATTEMPTS && componentMountedRef.current) {
        dispatch(
          notifyViaSnackBar({
            message: 'Using fallback polling mode for updates.',
            severity: 'info',
            open: true,
          }),
        );
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    // Initialize connection state
    setSocketConnected(socket.connected);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
    };
  }, [socket, dispatch, effectiveId, throttledRefetch]);

  // Join/Leave conversation rooms for WebSocket with Azure-specific improvements
  useEffect(() => {
    if (!effectiveId || effectiveId === 'new' || !socket) return;

    // Use the stable component ID to prevent reconnection issues
    const currentComponentId = componentIdRef.current;
    joinConversation(effectiveId, dispatch, currentComponentId);

    // ENHANCED: Verify we're actually in the room by emitting a test event
    setTimeout(() => {
      if (socket && socket.connected) {
        socket.emit('verify-room-membership', { conversationId: effectiveId, componentId: currentComponentId });
      }
    }, 1000);

    return () => {
      // Only leave when this specific component unmounts
      if (effectiveId && effectiveId !== 'new') {
        leaveConversation(dispatch, currentComponentId);
      }
    };
  }, [effectiveId, socket, dispatch]);

  // Add status-triggered polling for processing/pending/in-progress messages - ONLY when WebSocket disconnected
  useEffect(() => {
    // Don't set up new polling if it's already active with the same configuration
    const isPollingActive = processingPollingRef.current !== null;
    const shouldPoll = processingMessages.size > 0 && effectiveId && effectiveId !== 'new' && !socketConnected; // ONLY poll when WebSocket disconnected

    // Only clear and recreate if the polling state actually changed
    if (isPollingActive && !shouldPoll) {
      // Stop polling - no more messages to poll OR WebSocket is connected
      clearInterval(processingPollingRef.current);
      processingPollingRef.current = null;
    } else if (!isPollingActive && shouldPoll) {
      // Start polling - we have messages to poll AND WebSocket is disconnected
      processingPollingRef.current = setInterval(() => {
        if (componentMountedRef.current && processingMessages.size > 0 && !socketConnected) {
          throttledRefetch();
        }
      }, 5000); // Use 5 second interval
    }

    return () => {
      if (processingPollingRef.current) {
        clearInterval(processingPollingRef.current);
        processingPollingRef.current = null;
      }
    };
  }, [processingMessages, effectiveId, throttledRefetch, socketConnected]);

  // Listen for message updates from socket - Azure optimized
  useEffect(() => {
    if (!socket || !effectiveId || effectiveId === 'new') return;

    // ENHANCED DEBUG: Log all socket events to trace missing completion events
    const logAllEvents = (eventName) => (data) => {
      console.log(`[SOCKET DEBUG] RAW EVENT ${eventName}:`, {
        eventName,
        conversationId: data?.conversation_id,
        messageId: data?.message_id || data?.chataiMessageId || data?.request_id,
        status: data?.status,
        hasContent: !!data?.content,
        hasResult: !!data?.result,
        hasInsight: !!(data?.result?.insight || data?.metadata?.agent_response?.result?.insight),
        timestamp: new Date().toISOString(),
        rawData: JSON.stringify(data, null, 2).substring(0, 300) + '...',
      });
    };

    // Register debug loggers for ALL socket events to trace missing events
    socket.onAny(logAllEvents('ANY_EVENT'));

    // Handler for regular message updates
    const handleConversationMessage = (data) => {
      if (!componentMountedRef.current) return;

      // Only process if it's for the current conversation
      if (data.conversation_id === effectiveId) {
        // Get message ID from any possible field name
        const messageId = data.message_id || data.chataiMessageId || data.request_id;

        // For completed messages, move from running to completed queue
        if ((data.status === 'COMPLETED' || data.status === 'completed') && messageId) {
          // Check if message is in running queue before trying to remove
          const isInRunningQueue = runningMessages[effectiveId]?.includes(messageId);
          // Check if already in queue
          const isInQueue = store.getState().queue.queuedMessages[effectiveId]?.includes(messageId);

          if (isInRunningQueue) {
            dispatch(
              removeFromRunning({
                chatId: effectiveId,
                messageId: messageId,
              }),
            );

            // Only add to queue if not already in queue
            if (!isInQueue) {
              dispatch(
                addToQueue({
                  chatId: effectiveId,
                  messageId: messageId,
                }),
              );
            }
          }

          // Remove from processing messages to stop polling for this message
          setProcessingMessages((prev) => {
            // Return the same Set if message isn't in the set
            if (!prev.has(messageId)) return prev;

            // Only create a new Set if we need to remove something
            const newSet = new Set(prev);
            newSet.delete(messageId);
            return newSet;
          });

          // Check if all messages are now completed
          setTimeout(checkAndCleanupConversation, 100);
        }

        // Add a small delay for Azure event propagation
        // Update conversation state via Redux instead of refetch
        setTimeout(() => {
          if (componentMountedRef.current) {

            // Ensure conversation_id is set if missing
            let dataWithConversationId = {
              ...data,
              conversation_id: data.conversation_id || effectiveId,
              message_id: data.message_id || data.chataiMessageId || data.request_id,
            };

            // ENHANCED: Better parsing for nested JSON structures in message field
            if (data.message && typeof data.message === 'string') {
              try {
                const parsedMessage = JSON.parse(data.message);

                // Handle task_id responses with nested result
                if (parsedMessage.task_id && parsedMessage.result) {
                  let resultContent = parsedMessage.result;

                  // If result is a string, try to parse it as JSON again (double-encoded)
                  if (typeof resultContent === 'string') {
                    try {
                      resultContent = JSON.parse(resultContent);
                    } catch {
                      console.log('[WEBSOCKET UPDATE] Result is string but not JSON:', resultContent);
                    }
                  }

                  // Now extract the content from the properly parsed result
                  if (resultContent && typeof resultContent === 'object') {
                    if (resultContent.file_url) {
                      // For file responses, create appropriate content
                      dataWithConversationId.content = `File ready: ${resultContent.file_url}`;
                      dataWithConversationId.parsedResult = resultContent;
                    } else if (resultContent.insight) {
                      dataWithConversationId.content = resultContent.insight;
                      dataWithConversationId.parsedResult = resultContent;
                    } else {
                      // Fallback for other result structures
                      dataWithConversationId.content = JSON.stringify(resultContent, null, 2);
                      dataWithConversationId.parsedResult = resultContent;
                    }
                  } else if (typeof resultContent === 'string') {
                    dataWithConversationId.content = resultContent;
                  }

                  // Also pass through the original parsed message structure
                  dataWithConversationId.messageData = parsedMessage;
                }
                // Handle other message structures
                else if (parsedMessage.insight) {
                  dataWithConversationId.content = parsedMessage.insight;
                } else if (parsedMessage.content) {
                  dataWithConversationId.content = parsedMessage.content;
                } else {
                  dataWithConversationId.content = JSON.stringify(parsedMessage, null, 2);
                }
              } catch (parseError) {
                console.log('[WEBSOCKET UPDATE] Failed to parse message as JSON:', parseError);
                // If parsing fails, use the message as-is
                dataWithConversationId.content = data.message;
              }
            }

            // Extract content from various possible locations in the data (fallback logic)
            if (!dataWithConversationId.content && data.result) {
              if (typeof data.result === 'string') {
                dataWithConversationId.content = data.result;
              } else if (data.result.insight) {
                dataWithConversationId.content = data.result.insight;
              } else if (data.result.content) {
                dataWithConversationId.content = data.result.content;
              } else if (typeof data.result === 'object') {
                dataWithConversationId.content = JSON.stringify(data.result, null, 2);
              }
            }

            // Try extracting from message field if it looks like it contains result data
            if (!dataWithConversationId.content && data.message) {
              // Skip basic status messages
              if (data.message !== 'Request received and processing started in the background.') {
                dataWithConversationId.content = data.message;
              }
            }

            // Also try metadata sources
            if (!dataWithConversationId.content && data.metadata) {
              if (data.metadata.agent_response?.result) {
                const result = data.metadata.agent_response.result;
                if (typeof result === 'string') {
                  dataWithConversationId.content = result;
                } else if (result.insight) {
                  dataWithConversationId.content = result.insight;
                } else if (typeof result === 'object') {
                  dataWithConversationId.content = JSON.stringify(result, null, 2);
                }
              }
              // Also check if the agent_response itself contains content
              else if (data.metadata.agent_response && typeof data.metadata.agent_response === 'object') {
                if (data.metadata.agent_response.insight) {
                  dataWithConversationId.content = data.metadata.agent_response.insight;
                } else if (data.metadata.agent_response.content) {
                  dataWithConversationId.content = data.metadata.agent_response.content;
                }
              }
            }

            // Enhanced: Try to extract from any nested result structures
            if (!dataWithConversationId.content) {
              // Check if any top-level field contains result-like data
              const possibleResultFields = ['insight', 'response', 'answer', 'output'];
              for (const field of possibleResultFields) {
                if (data[field]) {
                  dataWithConversationId.content = data[field];
                  break;
                }
              }
            }

            // Enhanced: Try to parse content field if it's JSON and looks like it contains a result
            if (!dataWithConversationId.content && dataWithConversationId.content !== data.content) {
              try {
                if (typeof data.content === 'string' && data.content.startsWith('{')) {
                  const parsed = JSON.parse(data.content);
                  if (parsed.insight) {
                    dataWithConversationId.content = parsed.insight;
                  } else if (parsed.result) {
                    dataWithConversationId.content =
                      typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result);
                  } else if (parsed.content) {
                    dataWithConversationId.content = parsed.content;
                  }
                }
              } catch {
                // If JSON parsing fails, keep the original content
              }
            }

            // Dispatch Redux action to update conversation with latest message data
            dispatch(updateMessageResponseInConversation(dataWithConversationId));

            // ENHANCED: Trigger immediate polling if this is a completion event to ensure we get latest data
            const currentStatus = dataWithConversationId.status?.toString().toLowerCase();
            if (currentStatus === 'complete' || currentStatus === 'completed') {
              setTimeout(() => {
                if (componentMountedRef.current) {
                  throttledRefetch(false, true); // Immediate aggressive poll
                }
              }, 500); // Quick delay to allow backend to finish processing
            }
          }
        }, 1000);
      }
    };

    // Handler for queued message status updates
    const handleQueuedMessage = (data) => {
      if (!componentMountedRef.current) return;

      // Only process if it's for the current conversation
      if (data.conversation_id === effectiveId) {
        // Only add message to running queue if it has 'queued' status and NOT already there
        if (data.message_id) {
          // Check if already in running queue
          const isInRunningQueue = runningMessages[effectiveId]?.includes(data.message_id);

          if (!isInRunningQueue) {
            dispatch(
              addToRunning({
                chatId: effectiveId,
                messageId: data.message_id,
              }),
            );
          }
        }

        // Ensure conversation_id is set if missing
        let dataWithConversationId = {
          ...data,
          conversation_id: data.conversation_id || effectiveId,
          message_id: data.message_id || data.chataiMessageId || data.request_id,
        };

        // Dispatch Redux action to update conversation with latest message data
        dispatch(updateMessageResponseInConversation(dataWithConversationId));

        // Show notification about background processing
        dispatch(
          notifyViaSnackBar({
            message:
              'This request is taking longer than expected and will complete in the background. You can view progress in the Threads panel.',
            severity: 'info',
            open: true,
            autoHideDuration: 6000,
          }),
        );
      }
    };

    // Handler for status update events
    const handleStatusUpdate = (data) => {
      if (!componentMountedRef.current) return;

      // If conversation_id is undefined but we have a message_id, try to use the current conversation
      const conversationId = data.conversation_id || effectiveId;

      if (conversationId === effectiveId) {
        // Get message ID from any possible field name
        const messageId = data.message_id || data.chataiMessageId || data.request_id;

        if (messageId) {
          const status =
            data.metadata?.agent_response?.status ||
            data.metadata?.api_response_on_call?.status ||
            data.metadata?.status ||
            data.status ||
            '';

          const statusLower = status.toString().toLowerCase();
          // Handle COMPLETED status with enhanced handling
          if (
            statusLower === 'complete' ||
            statusLower === 'completed' ||
            statusLower === 'error' ||
            statusLower === 'failed'
          ) {
            // Remove from processing messages to stop polling
            setProcessingMessages((prev) => {
              // Return the same Set if message isn't in the set
              if (!prev.has(messageId)) return prev;

              // Only create a new Set if we need to remove something
              const newSet = new Set(prev);
              newSet.delete(messageId);
              return newSet;
            });

            // Check if message is in running queue before removing
            const isInRunningQueue = runningMessages[effectiveId]?.includes(messageId);
            // Check if message is already in queue
            const isInQueue = store.getState().queue.queuedMessages[effectiveId]?.includes(messageId);

            if (isInRunningQueue) {
              // Only remove and add to queue if it was in running queue
              dispatch(
                removeFromRunning({
                  chatId: effectiveId,
                  messageId: messageId,
                }),
              );

              // Only add to queue if not already there
              if (!isInQueue) {
                dispatch(
                  addToQueue({
                    chatId: effectiveId,
                    messageId: messageId,
                  }),
                );
              }

              // After removing, check if ALL messages for this conversation are complete
              setTimeout(checkAndCleanupConversation, 100);
            }
          }
          // Handle processing/in-progress/pending status by triggering polling
          else if (statusLower === 'processing' || statusLower === 'in_progress' || statusLower === 'pending') {
            // Add to processing messages to start polling only if not already present
            setProcessingMessages((prev) => {
              // Don't create a new Set if message is already there
              if (prev.has(messageId)) {
                return prev; // Return the same object, preventing re-render
              }

              // Only create a new Set when really adding a new message
              const newSet = new Set(prev);
              newSet.add(messageId);
              return newSet;
            });
          }
          // Handle queued status - only add to running queue if status is queued AND not already in running
          else if (statusLower === 'queued') {
            // Check if already in running queue
            const isInRunningQueue = runningMessages[effectiveId]?.includes(messageId);

            if (!isInRunningQueue) {
              dispatch(
                addToRunning({
                  chatId: effectiveId,
                  messageId: messageId,
                }),
              );
            }
          }
        }

        // Ensure conversation_id is set if missing
        let dataWithConversationId = {
          ...data,
          conversation_id: data.conversation_id || effectiveId,
          message_id: data.message_id || data.chataiMessageId || data.request_id,
        };

        // Extract content from various possible locations in the data
        if (!dataWithConversationId.content && data.result) {
          if (typeof data.result === 'string') {
            dataWithConversationId.content = data.result;
          } else if (data.result.insight) {
            dataWithConversationId.content = data.result.insight;
          } else if (data.result.content) {
            dataWithConversationId.content = data.result.content;
          } else if (typeof data.result === 'object') {
            dataWithConversationId.content = JSON.stringify(data.result, null, 2);
          }
        }

        // Try extracting from message field if it looks like it contains result data
        if (!dataWithConversationId.content && data.message) {
          // Skip basic status messages
          if (data.message !== 'Request received and processing started in the background.') {
            dataWithConversationId.content = data.message;
          }
        }

        // Also try metadata sources
        if (!dataWithConversationId.content && data.metadata) {
          if (data.metadata.agent_response?.result) {
            const result = data.metadata.agent_response.result;
            if (typeof result === 'string') {
              dataWithConversationId.content = result;
            } else if (result.insight) {
              dataWithConversationId.content = result.insight;
            } else if (typeof result === 'object') {
              dataWithConversationId.content = JSON.stringify(result, null, 2);
            }
          }
          // Also check if the agent_response itself contains content
          else if (data.metadata.agent_response && typeof data.metadata.agent_response === 'object') {
            if (data.metadata.agent_response.insight) {
              dataWithConversationId.content = data.metadata.agent_response.insight;
            } else if (data.metadata.agent_response.content) {
              dataWithConversationId.content = data.metadata.agent_response.content;
            }
          }
        }

        // Enhanced: Try to extract from any nested result structures
        if (!dataWithConversationId.content) {
          // Check if any top-level field contains result-like data
          const possibleResultFields = ['insight', 'response', 'answer', 'output'];
          for (const field of possibleResultFields) {
            if (data[field]) {
              dataWithConversationId.content = data[field];
              break;
            }
          }
        }

        // Enhanced: Try to parse content field if it's JSON and looks like it contains a result
        if (!dataWithConversationId.content && dataWithConversationId.content !== data.content) {
          try {
            if (typeof data.content === 'string' && data.content.startsWith('{')) {
              const parsed = JSON.parse(data.content);
              if (parsed.insight) {
                dataWithConversationId.content = parsed.insight;
              } else if (parsed.result) {
                dataWithConversationId.content =
                  typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result);
              } else if (parsed.content) {
                dataWithConversationId.content = parsed.content;
              }
            }
          } catch {
            // If JSON parsing fails, keep the original content
          }
        }

        // Dispatch Redux action to update conversation with latest message data
        dispatch(updateMessageResponseInConversation(dataWithConversationId));

        // ENHANCED: Trigger immediate polling for completion events to ensure we get the latest data immediately
        const currentStatus = dataWithConversationId.status?.toString().toLowerCase();
        if (currentStatus === 'complete' || currentStatus === 'completed') {

          if (componentMountedRef.current) {
            setTimeout(() => {
              if (componentMountedRef.current) {
                throttledRefetch(false, true); // Immediate aggressive poll
              }
            }, 500); // Quick delay to allow backend to finish processing
          }
        }
      }
    };

    // Handler for error notifications
    const handleErrorNotification = (data) => {
      if (!componentMountedRef.current) return;

      console.error('Received error notification:', data);

      if (data.conversation_id === effectiveId) {
        // Show error notification
        dispatch(
          notifyViaSnackBar({
            message: `${data.error || 'Error'}: ${data.details || ''}`,
            severity: 'error',
            open: true,
            autoHideDuration: 8000,
          }),
        );

        // Remove from processing messages to stop polling
        if (data.message_id) {
          setProcessingMessages((prev) => {
            // Return the same Set if message isn't in the set
            if (!prev.has(data.message_id)) return prev;

            // Only create a new Set if we need to remove something
            const newSet = new Set(prev);
            newSet.delete(data.message_id);
            return newSet;
          });

          // Move message from running to completed only if it was in running queue
          const isInRunningQueue = runningMessages[effectiveId]?.includes(data.message_id);
          // Check if message is already in queue
          const isInQueue = store.getState().queue.queuedMessages[effectiveId]?.includes(data.message_id);

          if (isInRunningQueue) {
            dispatch(
              removeFromRunning({
                chatId: effectiveId,
                messageId: data.message_id,
              }),
            );

            // Add to queue for visibility only if not already in queue
            if (!isInQueue) {
              dispatch(
                addToQueue({
                  chatId: effectiveId,
                  messageId: data.message_id,
                }),
              );
            }

            // Check if all messages are now completed
            setTimeout(checkAndCleanupConversation, 100);
          }
        }

        // Ensure conversation_id is set if missing
        let dataWithConversationId = {
          ...data,
          conversation_id: data.conversation_id || effectiveId,
          message_id: data.message_id || data.chataiMessageId || data.request_id,
        };

        // For error cases, extract error message as content
        if (!dataWithConversationId.content) {
          if (data.error) {
            dataWithConversationId.content = `Error: ${data.error}${data.details ? ` - ${data.details}` : ''}`;
          } else if (data.message) {
            dataWithConversationId.content = data.message;
          }
        }

        // Dispatch Redux action to update conversation with latest message data
        dispatch(updateMessageResponseInConversation(dataWithConversationId));
      }
    };

    // Register all event handlers
    socket.on(SOCKET_EVENTS.CONVERSATION_MESSAGE, handleConversationMessage);
    socket.on(SOCKET_EVENTS.CONVERSATION_QUEUED, handleQueuedMessage);
    socket.on(SOCKET_EVENTS.CONVERSATION_STATUS, handleStatusUpdate);
    socket.on(SOCKET_EVENTS.ERROR_NOTIFICATION, handleErrorNotification);

    // Cleanup on unmount
    return () => {
      // Remove debug logger
      socket.offAny(logAllEvents('ANY_EVENT'));

      socket.off(SOCKET_EVENTS.CONVERSATION_MESSAGE, handleConversationMessage);
      socket.off(SOCKET_EVENTS.CONVERSATION_QUEUED, handleQueuedMessage);
      socket.off(SOCKET_EVENTS.CONVERSATION_STATUS, handleStatusUpdate);
      socket.off(SOCKET_EVENTS.ERROR_NOTIFICATION, handleErrorNotification);
    };
  }, [socket, effectiveId, throttledRefetch, dispatch, runningMessages, checkAndCleanupConversation]);

  // BACKUP POLLING LOGIC: Always poll as backup to ensure UI updates even if WebSocket events are missed
  // This ensures the UI always gets updates regardless of WebSocket reliability
  useEffect(() => {
    // Clear any existing polling first to avoid duplicate intervals
    if (fallbackPollingRef.current) {
      clearInterval(fallbackPollingRef.current);
      fallbackPollingRef.current = null;
    }

    // Always poll when we have a valid conversation to ensure updates are never missed
    if (effectiveId && effectiveId !== 'new') {

      fallbackPollingRef.current = setInterval(() => {
        if (componentMountedRef.current) {
          throttledRefetch(false, true); // Backup polling - pass isBackupPoll=true
        }
      }, MIN_POLL_INTERVAL); // Poll every 3 seconds as backup
    }

    return () => {
      if (fallbackPollingRef.current) {
        clearInterval(fallbackPollingRef.current);
        fallbackPollingRef.current = null;
      }
    };
  }, [effectiveId, throttledRefetch]);

  

  const scrollToBottom = useCallback(() => {
    if (messageContainerRef.current && isScrolledToBottom) {
      messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
    }
  }, [isScrolledToBottom]);

  // Scroll listener
 

  // Reset component-specific state (not global queue state) on conversation change
  useEffect(() => {
    // Check if conversation has actually changed
    const isConversationChange = previousConversationIdRef.current !== effectiveId;
    previousConversationIdRef.current = effectiveId;

    // Reset local component state
    setHasError(false);
    setIsInitialLoad(true);
    setIsScrolledToBottom(true);
    previousMessagesRef.current = [];

    // Only clear processing message state when conversation changes
    if (isConversationChange) {
      // Reset component-specific processing messages when conversation changes
      setProcessingMessages(new Set());
      // Clear pending AI responses when conversation changes
      setPendingAIResponses(new Map());
      // Clear all pending timeouts
      pendingResponseTimeouts.current.forEach((timeoutId) => clearTimeout(timeoutId));
      pendingResponseTimeouts.current.clear();
    }

    // Initial fetch when conversation changes - needed for first load
    if (effectiveId && effectiveId !== 'new') {
      throttledRefetch(true); // Force initial load regardless of socket status
    }

    return () => {
      // Clean up component-specific resources
      if (fallbackPollingRef.current) {
        clearInterval(fallbackPollingRef.current);
        fallbackPollingRef.current = null;
      }
      if (processingPollingRef.current) {
        clearInterval(processingPollingRef.current);
        processingPollingRef.current = null;
      }

      // NOTE: We no longer call clearRunningForChat here when component unmounts
      // This allows the running message queue to be preserved between chat switches
    };
  }, [effectiveId, throttledRefetch]);

  // ENHANCED: Improved message status detection with multiple fallbacks
  const extractMessageStatus = useCallback((msg) => {
    // STEP 1: Check metadata.agent_response.status (first priority)
    if (msg?.metadata?.agent_response?.status) {
      const apiStatus = String(msg.metadata.agent_response.status).toLowerCase();
      // If API explicitly says completed/done, trust that
      if (apiStatus === 'completed' || apiStatus === 'done' || apiStatus === 'complete') {
        return 'completed';
      }
      // Return the API status for other values
      return apiStatus;
    }

    // STEP 2: Check metadata.api_response_on_call.status (second priority)
    if (msg?.metadata?.api_response_on_call?.status) {
      const onCallStatus = String(msg.metadata.api_response_on_call.status).toLowerCase();
      // If API explicitly says completed/done, trust that
      if (onCallStatus === 'completed' || onCallStatus === 'done' || onCallStatus === 'complete') {
        return 'completed';
      }
      // Return the API status for other values
      return onCallStatus;
    }

    // STEP 3: Check metadata.status (third priority)
    if (msg?.metadata?.status) {
      const metaStatus = String(msg.metadata.status).toLowerCase();
      // If metadata explicitly says completed/done, trust that
      if (metaStatus === 'completed' || metaStatus === 'done' || metaStatus === 'complete') {
        return 'completed';
      }
      // Return the metadata status for other values
      return metaStatus;
    }

    // STEP 4: Check direct status property of the message (last priority)
    if (msg?.status) {
      const directStatus = String(msg.status).toLowerCase();
      // If explicitly says completed/done, trust that
      if (directStatus === 'completed' || directStatus === 'done' || directStatus === 'complete') {
        return 'completed';
      }
      // Return the direct status for other values
      return directStatus;
    }

    // STEP 5: Check if this is an AI message with files but no response yet
    if (msg?.sender_type === SENDER_TYPES.AI && msg?.files?.length > 0 && (!msg.message || msg.message === 'null')) {
      return 'processing';
    }

    // STEP 6: Check for status in JSON message content if available
    if (typeof msg?.message === 'string' && (msg.message.startsWith('{') || msg.message.startsWith('['))) {
      try {
        const parsed = JSON.parse(msg.message);
        if (parsed?.status) {
          const parsedStatus = String(parsed.status).toLowerCase();
          if (parsedStatus === 'completed' || parsedStatus === 'done' || parsedStatus === 'complete') {
            return 'completed';
          }
          return parsedStatus;
        }
      } catch {
        // Ignore parsing errors
      }
    }

    // If no status determined, return null (caller will handle default status)
    return null;
  }, []);

  // ENHANCED: Helper function to determine if a message is in progress
  const isMessageInProgress = useCallback(
    (msg) => {
      // Check if this is a local pending message
      if (msg?.metadata?.isLocalPending) {
        return true;
      }

      // Extract status using our comprehensive function
      const status = extractMessageStatus(msg);

      // Check for processing/pending/in-progress statuses
      const processingStatuses = ['pending', 'processing', 'in_progress', 'queued', 'loading'];

      if (status && processingStatuses.includes(status)) {
        return true;
      }

      // Check if message is in running queue
      if (msg.id && runningMessages[effectiveId]?.includes(String(msg.id))) {
        return true;
      }

      // Check if message is in our local processing set
      if (msg.id && processingMessages.has(String(msg.id))) {
        return true;
      }

      // For AI messages with no content or null message, consider them in progress
      if (msg.sender_type === SENDER_TYPES.AI && (!msg.message || msg.message === 'null' || msg.message === '')) {
        return true;
      }

      return false;
    },
    [extractMessageStatus, runningMessages, effectiveId, processingMessages],
  );

  // FIXED: Message processing to prevent duplicates
  const processedMessages = useMemo(() => {
    if (!conversationDetails?.length) return [];

    // Create a Set to track processed message IDs
    const processedIds = new Set();

    return conversationDetails
      .filter((msg) => {
        // Skip duplicates
        if (processedIds.has(msg.id)) return false;
        processedIds.add(msg.id);
        return true;
      })
      .map((msg) => {
        const statusLower = extractMessageStatus(msg);
        const isInProgressMsg = isMessageInProgress(msg);

        // FIXED: Properly determine if message is from user
        const isUserMessage = msg.sender_type === SENDER_TYPES.USER || msg.isUser === true;

        return {
          ...msg,
          isUser: isUserMessage, // Explicitly set isUser based on sender_type
          isInProgress: isInProgressMsg,
          _statusKey: `${msg.id}-${statusLower || 'unknown'}-${msg.updated_at || msg.created_at}`, // Use updated_at for stability
        };
      });
  }, [conversationDetails, extractMessageStatus, isMessageInProgress]);

  // Process messages and handle queue effect with improved status handling + local pending responses
  useEffect(() => {
    // Skip processing if we're switching conversations
    if (isLoadingConversationData) {
      return;
    }

    if (!componentMountedRef.current || effectiveId !== currentChatIdRef.current) return;

    if (conversationError) {
      setHasError(true);
      setIsInitialLoad(false);
      return;
    }

    try {
      // Enhanced queue handling for in-progress and queued messages
      processedMessages.forEach((msg) => {
        if (msg.sender_type === SENDER_TYPES.AI && msg.id) {
          const messageId = String(msg.id);
          const isInQueue = runningMessages[effectiveId]?.includes(messageId);
          const statusLower = extractMessageStatus(msg);

          // Remove pending AI response if we have a real AI message
          if (msg.source_msg_id && !msg.metadata?.isLocalPending) {
            removePendingAIResponse(msg.source_msg_id);
          }

          // Add to processing messages for polling if status indicates processing
          if (statusLower === 'processing' || statusLower === 'in_progress' || statusLower === 'pending') {
            setProcessingMessages((prev) => {
              // Don't create a new Set if message is already there
              if (prev.has(messageId)) {
                return prev;
              }

              // Only create a new Set when really adding a new message
              const newSet = new Set(prev);
              newSet.add(messageId);
              return newSet;
            });
          }

          // Check for queued status directly from all possible places
          const needsProcessing =
            statusLower === 'queued' ||
            msg.metadata?.status === 'queued' ||
            msg.metadata?.agent_response?.status === 'queued';

          if (needsProcessing && !isCurrentlyClearing.current) {
            const isInRunningQueue = runningMessages[effectiveId]?.includes(messageId);
            if (!isInRunningQueue) {
              dispatch(addToRunning({ chatId: effectiveId, messageId }));
            }
          }

          // Check for file-specific processing - if AI message has files but no response yet
          if (msg.files?.length > 0 && (!msg.message || msg.message === 'null')) {
            setProcessingMessages((prev) => {
              if (prev.has(messageId)) return prev;

              const newSet = new Set(prev);
              newSet.add(messageId);
              return newSet;
            });

            // FIX: Only add to running queue if status is 'queued'
            const hasQueuedStatus =
              statusLower === 'queued' ||
              msg.metadata?.status === 'queued' ||
              msg.metadata?.agent_response?.status === 'queued';

            if (hasQueuedStatus && !isInQueue && !isCurrentlyClearing.current) {
              dispatch(addToRunning({ chatId: effectiveId, messageId }));
            }
          }

          // Check if message is completed and needs cleanup
          if (statusLower === 'complete' || statusLower === 'completed') {
            // Check if in running queue and not in queue
            const isInRunningQueue = runningMessages[effectiveId]?.includes(messageId);
            const isInQueue = store.getState().queue.queuedMessages[effectiveId]?.includes(messageId);
            if (isInRunningQueue) {
              dispatch(removeFromRunning({ chatId: effectiveId, messageId }));

              // Only add to queue if not already there
              if (!isInQueue) {
                dispatch(addToQueue({ chatId: effectiveId, messageId }));
              }
            }

            setProcessingMessages((prev) => {
              if (!prev.has(messageId)) return prev;
              const newSet = new Set(prev);
              newSet.delete(messageId);
              return newSet;
            });
          }
        }
      });

      // NEW: Merge processed messages with pending AI responses
      const allMessages = [...processedMessages];

      // Add pending AI responses for user messages that don't have real AI responses yet
      pendingAIResponses.forEach((pendingMsg, sourceMessageId) => {
        // Check if there's already a real AI response for this specific user message
        const hasRealAIResponse = processedMessages.some(
          (msg) =>
            msg.sender_type === SENDER_TYPES.AI &&
            String(msg.source_msg_id) === String(sourceMessageId) && // Ensure string comparison
            !msg.metadata?.isLocalPending &&
            (msg.message || msg.files?.length > 0), // Must have actual content
        );

        // Only add pending response if no real response exists for THIS specific message
        if (!hasRealAIResponse) {
          // Mark the pending message as in progress for MessageBubble
          const pendingWithProgress = {
            ...pendingMsg,
            metadata: {
              ...pendingMsg.metadata,
              isInProgress: true,
              isLocalPending: true, // Keep this flag
            },
          };
          allMessages.push(pendingWithProgress);
        }
      });

      // Sort messages by creation date and id to maintain proper order
      allMessages.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return (a.id || 0) - (b.id || 0);
      });

      // Set the updated messages
      setMessages(allMessages);
      previousMessagesRef.current = allMessages;

      // Scroll to bottom if we're already at the bottom or this is a new message
      if (isScrolledToBottom || isInitialLoad) {
        setTimeout(scrollToBottom, 100);
      }

      setIsInitialLoad(false);

      // Check if we need to clean up any queues
      const shouldClear =
        !runningMessages[effectiveId]?.length &&
        !processingMessages.size &&
        pendingAIResponses.size === 0 &&
        processedMessages.every(
          (msg) =>
            extractMessageStatus(msg) === 'completed' ||
            extractMessageStatus(msg) === 'complete' ||
            msg.sender_type === SENDER_TYPES.USER,
        );

      // When all messages are completed, only clean up polling, not the running/queue stores
      if (shouldClear) {
        // Only cleanup polling refs, don't dispatch clearRunningForChat
        if (fallbackPollingRef.current) {
          clearInterval(fallbackPollingRef.current);
          fallbackPollingRef.current = null;
        }

        if (processingPollingRef.current) {
          clearInterval(processingPollingRef.current);
          processingPollingRef.current = null;
        }
      } else {
        checkAndCleanupConversation();
      }
    } catch (error) {
      console.error('Error processing conversation messages:', error);
      setHasError(true);
      setIsInitialLoad(false);
    }
  }, [
    processedMessages,
    conversationError,
    effectiveId,
    dispatch,
    isInitialLoad,
    isScrolledToBottom,
    scrollToBottom,
    runningMessages,
    socketConnected,
    checkAndCleanupConversation,
    extractMessageStatus,
    isLoadingConversationData,
    pendingAIResponses,
    removePendingAIResponse,
    isMessageInProgress,
  ]);

  const showLoading = useMemo(
    () =>
      (isInitialLoad && !messages.length) ||
      isCreatingConversation ||
      (!id && !storedConversationId) ||
      (isLoadingConversationData && !messages.length),
    [isInitialLoad, messages.length, isCreatingConversation, id, storedConversationId, isLoadingConversationData],
  );

  // Optimize message key generation to prevent unnecessary re-renders
  const generateMessageKey = useCallback((msg) => {
    return `msg-${msg.id}-${msg.sender_type}-${msg.updated_at || msg.created_at}`;
  }, []);

  const renderContent = useCallback(() => {
    if (showLoading) {
      return <LoadingSkeleton />;
    }

    if (hasError) {
      return (
        <div className={classes.errorContainer}>
          <Typography className={classes.errorMessage}>
            {conversationError?.message || 'Failed to load conversation'}
          </Typography>
          <Button onClick={() => throttledRefetch(true)} className={classes.retryButton} variant="contained">
            Retry
          </Button>
        </div>
      );
    }

    if (!messages.length) {
      return (
        <div className={classes.emptyConversation}>
          <Typography className={classes.welcomeText}>{CONVERSATION_SCREEN.EMPTY_CONVERSATION_MESSAGE}</Typography>
        </div>
      );
    }

    return (
      <div className={classes.messagesContainer}>
        {messages.map((msg, index) => {
        // REMOVED: Do not pre-process and strip the message content here.
        // let insightContent = msg.message; // This logic should be removed.

        let suggestions = [];
        const isLastMessage = index === messages.length - 1;

        // This block should only be used to extract side effects like suggested questions,
        // not to modify the core message content.
        if (isLastMessage && msg.sender_type === SENDER_TYPES.AI && typeof msg.message === 'string') {
        try {
            const parsed = JSON.parse(msg.message);
            if (Array.isArray(parsed.suggested_questions) && parsed.suggested_questions.length > 0) {
            suggestions = parsed.suggested_questions;
            }
        } catch (e) { /* Not a JSON message, ignore */ }
        }

        const previousMessage = !msg.isUser && index > 0 ? messages.slice(0, index).reverse().find(m => m.isUser) : null;

        return (
        <React.Fragment key={generateMessageKey(msg)}>
            <MessageBubble
            // FIX: Pass the original, unmodified message.
            // The fallback to msg.content is good to keep.
            message={msg.message || msg.content}
            isUser={msg.isUser}
            userInitials={userInitials}
            files={msg.files}
            metadata={msg.metadata}
            id={msg.id}
            created_at={msg.created_at}
            updated_at={msg.updated_at}
            messageid={msg.id}
            sender_type={msg.sender_type}
            conversationId={effectiveId}
            previousMessage={previousMessage}
            feedback_reaction={msg.feedback_reaction}
            />
            {suggestions.length > 0 && (
            <SuggestedQuestions
                questions={suggestions}
                onQuestionClick={onSuggestedQuestionClick}
            />
            )}
        </React.Fragment>
        );
    })}
    </div>
    );
  }, [showLoading, hasError, messages, userInitials, conversationError, throttledRefetch, effectiveId, generateMessageKey, onSuggestedQuestionClick]);

  const handleScroll = useCallback(() => {
    if (!messageContainerRef.current) return;
    const { scrollHeight, scrollTop, clientHeight } = messageContainerRef.current;
    setIsScrolledToBottom(Math.abs(scrollHeight - scrollTop - clientHeight) < 5);
}, []);

useEffect(() => {
  const container = messageContainerRef.current;
  if (!container) return;
  container.addEventListener('scroll', handleScroll);
  return () => container.removeEventListener('scroll', handleScroll);
}, [handleScroll]);

  return (
    <div className={classes.conversationScreen}>
      <div className={classes.messagesWrapper} ref={messageContainerRef}>
        {renderContent()}
      </div>
    </div>
  );
};

ConversationScreen.propTypes = {
  id: PropTypes.string.isRequired,
  stableInstanceId: PropTypes.string,
  onSuggestedQuestionClick: PropTypes.func,
};

// Memoize ConversationScreen to prevent unnecessary re-renders
const MemoizedConversationScreen = memo(ConversationScreen, (prevProps, nextProps) => {
  return prevProps.id === nextProps.id && prevProps.stableInstanceId === nextProps.stableInstanceId;
});

MemoizedConversationScreen.displayName = 'ConversationScreen';

export default MemoizedConversationScreen;
