import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Alert,
  CircularProgress,
  Switch,
} from '@mui/material';
import ChatBotIcon from '../../assets/conversationDashboard/chatbot-speech-bubble.svg';
import MinimizeIcon from '../../assets/conversationDashboard/MinimizeIcon.svg'
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { useDispatch, useSelector } from 'react-redux';
import PropTypes from 'prop-types';
import classes from './ThreadsPanel.module.scss';
import {
  resetConversationData,
  updateConvesationId,
  setActiveConversation,
  getArchivedConversation,
  clearUploadedFiles,
  setShowSaveOptions,
  getSelectedMessages,
  clearSelectedMessages,
  notifyViaSnackBar,
  toggleFeedbackMode,
  selectIsFeedbackEnabled,
  getIsCreatingConversation,
  getMessageCreationLoading,
  getConversationDetails,
} from '../../redux/store/conversationSlice';
import {
  selectCurrentPage,
  setCurrentPage,
  setPageConversation,
  clearPageConversation,
  selectCurrentPageConversation,
  selectUser,
  selectSelectedRole,
  selectSelectedIndustry,
} from '../../features/auth/authSlice';
import { useSaveThreadMutation } from '../../services/threadApi';
import WelcomeMessage from '../WelcomeMessage/WelcomeMessage';
import ChatInput from '../ChatInput/ChatInput';
import ConversationScreen from '../ConversationScreen/ConversationScreen';
import Sidebar from '../Sidebar/Sidebar';
import { getSocket, initSocket } from '../../utils/socket';
import { joinConversation, leaveConversation } from '../../utils/socket/socketActions';
import { SOCKET_EVENTS } from '../../utils/constants';
import { addToQueue, addToRunning, removeFromRunning, selectRunningMessages } from '../../redux/store/queueSlice';

/**
 * ThreadsPanel component - Displays conversation threads and chat interface
 *
 * Optimized for Azure:
 * - Efficient WebSocket connection management
 * - Room reference counting for shared conversation access
 * - Proper cleanup to prevent memory leaks
 * - Graceful degradation when connections fail
 * - Azure Redis Cache specific error handling
 */
const ThreadsPanel = ({ open, onClose, userName, previousQueries = [], onQuerySelect }) => {
  const dispatch = useDispatch();
  const currentPage = useSelector(selectCurrentPage);
  const currentUser = useSelector(selectUser);
  const selectedRole = useSelector(selectSelectedRole);
  const selectedIndustry = useSelector(selectSelectedIndustry);
  const selectedIndustryId = currentUser?.industries?.find((i) => i.name === selectedIndustry)?.id;
  const selectedPersonaId = currentUser?.industries
    ?.find((i) => i.name === selectedIndustry)
    ?.personas?.find((p) => p.name === selectedRole)?.id;
  const runningMessages = useSelector(selectRunningMessages);
  const archivedData = useSelector(getArchivedConversation);
  const activeConversationId = useSelector(selectCurrentPageConversation);
  const selectedMessages = useSelector(getSelectedMessages);


  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [threadName, setThreadName] = useState('');
  const chatInputRef = useRef(null);

  const conversationDetails = useSelector(getConversationDetails);

  const isSelectMode = useSelector((state) => state.conversation.showSaveOptions);
  const [saveThread, { isLoading: isSaving, error: saveError }] = useSaveThreadMutation();
  const isCreatingConversation = useSelector(getIsCreatingConversation);
  const isProcessingMessage = useSelector(getMessageCreationLoading);

  const isFeedbackEnabled = useSelector(selectIsFeedbackEnabled);
  const isPharmaceuticalIndustry =
    selectedIndustry === 'Pharmaceutical' ||
    currentUser?.industries?.find((i) => i.name === selectedIndustry)?.id === 2;

  // ADDED: Create a handler to dispatch the toggle action
  const handleFeedbackToggle = () => {
    dispatch(toggleFeedbackMode());
  };
  //helper fnc


  conversationDetails.forEach(msg => {
    let saveThread;
    let blobLink;

    if (msg.metadata?.agent_response?.result?.save_thread !== undefined) {
      saveThread = msg.metadata.agent_response.result.save_thread;
    }

    if (msg.message) {
      try {
        const outer = JSON.parse(msg.message);   // parse outer JSON
        if (outer.result) {
          const inner = JSON.parse(outer.result); // parse result string
          blobLink = inner.file_url || null;
        }
      } catch (err) {
        console.warn(`Message ID ${msg.id}: failed to parse blob link`, err);
      }
    }
    console.log(`Message ID ${msg.id}: save_thread =`, saveThread, `, blob_link =`, blobLink);
  });



  // const handleSaveClick = () => {
  //   setSaveDialogOpen(true);
  // };
  const handleSaveClick = () => {
    if (!selectedMessages.length) return;

    const failingMessages = selectedMessages.filter(msgId => {
      // Make sure types match
      const msg = conversationDetails.find(m => String(m.id) === String(msgId));
      const saveThreadValue = msg?.metadata?.agent_response?.result?.save_thread;
      return saveThreadValue !== true; // undefined or false → fails
    });

    if (failingMessages.length === 0) {
      setSaveDialogOpen(true);
    } else {
      console.log('Cannot save messages:', failingMessages);
      dispatch(
        notifyViaSnackBar({
          message: `✨ A thread can not be created from unstructured data: ${failingMessages.join(', ')}`,
          severity: 'warning',
          open: true,
        })
      );
    }
  };




  // ADDED: Handler to cancel message selection
  const handleCancelSelect = () => {
    dispatch(clearSelectedMessages());
  };

  // Socket connection management with Azure-specific enhancements
  const socket = getSocket();
  const [socketConnected, setSocketConnected] = useState(socket?.connected || false);
  const prevActiveConversationId = useRef(null);
  const connectAttemptRef = useRef(0);
  const fallbackPollingRef = useRef(null);
  const componentMountedRef = useRef(true);

  // Set up component mounted flag for safer async operations
  useEffect(() => {
    componentMountedRef.current = true;
    return () => {
      componentMountedRef.current = false;
    };
  }, []);

  // Initialize socket if needed - MPA mode uses session cookies (no token needed)
  useEffect(() => {
    if (!socket) {
      try {
        const newSocket = initSocket();
        if (newSocket) {
          console.log('Socket initialized in ThreadsPanel');
        }
      } catch (error) {
        console.error('Failed to initialize socket in ThreadsPanel:', error);
      }
    }
  }, [socket]);

  // Monitor socket connection with better Azure error detection
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      console.log('Socket connected in ThreadsPanel');
      if (componentMountedRef.current) {
        setSocketConnected(true);
        connectAttemptRef.current = 0;
      }

      // Rejoin conversation if active after reconnect
      if (activeConversationId && activeConversationId !== 'new') {
        joinConversation(activeConversationId, dispatch, 'ThreadsPanel');
      }
    };

    const handleDisconnect = (reason) => {
      console.log('Socket disconnected in ThreadsPanel:', reason);
      if (componentMountedRef.current) {
        setSocketConnected(false);
      }

      // Check for Azure-specific disconnect reasons
      let azureSpecificInfo = '';
      if (reason === 'transport close' || reason === 'ping timeout') {
        azureSpecificInfo = ' (Azure Load Balancer timeout)';
      } else if (reason === 'transport error') {
        azureSpecificInfo = ' (Azure network connectivity issue)';
      }

      // Only notify for unexpected disconnects
      if (reason !== 'io client disconnect' && reason !== 'io server disconnect') {
        dispatch(
          notifyViaSnackBar({
            message: `Real-time updates unavailable${azureSpecificInfo}. Using fallback mode.`,
            severity: 'warning',
            open: true,
          }),
        );
      }
    };

    const handleConnectError = (error) => {
      connectAttemptRef.current++;
      console.log(`Socket connection error (attempt ${connectAttemptRef.current}):`, error.message);

      // After several retries, notify user
      if (connectAttemptRef.current > 3) {
        const errorMessage = error.message?.includes('timeout')
          ? 'Connection timeout. Azure Load Balancer may be disrupting WebSockets.'
          : 'Connection failed after multiple attempts. Some features may be unavailable.';

        dispatch(
          notifyViaSnackBar({
            message: errorMessage,
            severity: 'error',
            open: true,
          }),
        );
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    // Initial state
    setSocketConnected(socket.connected);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
    };
  }, [socket, dispatch, activeConversationId]);

  // Event listeners for all socket events (not just connection events)
  useEffect(() => {
    if (!socket || !activeConversationId || activeConversationId === 'new') return;

    // Handle completed message from WebSocket
    const handleConversationMessage = (data) => {
      if (data.conversation_id === activeConversationId) {
        console.log('Received conversation message in ThreadsPanel:', data);

        // Move message from running to completed
        if (data.message_id) {
          // Check if message exists in running queue
          const isInRunningQueue = runningMessages[activeConversationId]?.includes(data.message_id);

          if (isInRunningQueue) {
            console.log(`Message ${data.message_id} found in running queue, removing`);

            dispatch(
              removeFromRunning({
                chatId: activeConversationId,
                messageId: data.message_id,
              }),
            );
          }

          // Always add to queue
          dispatch(
            addToQueue({
              chatId: activeConversationId,
              messageId: data.message_id,
            }),
          );
        }
      }
    };

    // Handle status updates for in-progress messages
    const handleStatusUpdate = (data) => {
      if (data.conversation_id === activeConversationId) {
        console.log('Received status update in ThreadsPanel:', data);

        // Check status and update queue accordingly
        const statusLower = data.status?.toLowerCase() || '';
        if (
          (statusLower === 'in_progress' || statusLower === 'processing' || statusLower === 'pending') &&
          data.message_id
        ) {
          dispatch(
            addToRunning({
              chatId: activeConversationId,
              messageId: data.message_id,
            }),
          );
        }
      }
    };

    // Handle queued messages (moving to background)
    const handleQueuedMessage = (data) => {
      if (data.conversation_id === activeConversationId) {
        console.log('Request queued for async processing in ThreadsPanel:', data);

        // Use either message_id or request_id
        const messageId = data.message_id || data.request_id;
        if (messageId) {
          dispatch(
            addToRunning({
              chatId: activeConversationId,
              messageId: messageId,
            }),
          );

          // Show notification about background processing
          dispatch(
            notifyViaSnackBar({
              message: 'This request will complete in the background. Track progress in the Threads panel.',
              severity: 'info',
              open: true,
              autoHideDuration: 6000,
            }),
          );
        }
      }
    };

    // Handle error notifications
    const handleErrorNotification = (data) => {
      if (data.conversation_id === activeConversationId) {
        console.error('Received error notification in ThreadsPanel:', data);

        // Remove from running even on error
        if (data.message_id) {
          dispatch(
            removeFromRunning({
              chatId: activeConversationId,
              messageId: data.message_id,
            }),
          );
        }
      }
    };

    // Register all event handlers
    socket.on(SOCKET_EVENTS.CONVERSATION_MESSAGE, handleConversationMessage);
    socket.on(SOCKET_EVENTS.CONVERSATION_STATUS, handleStatusUpdate);
    socket.on(SOCKET_EVENTS.CONVERSATION_QUEUED, handleQueuedMessage);
    socket.on(SOCKET_EVENTS.ERROR_NOTIFICATION, handleErrorNotification);

    return () => {
      // Clean up all listeners
      socket.off(SOCKET_EVENTS.CONVERSATION_MESSAGE, handleConversationMessage);
      socket.off(SOCKET_EVENTS.CONVERSATION_STATUS, handleStatusUpdate);
      socket.off(SOCKET_EVENTS.CONVERSATION_QUEUED, handleQueuedMessage);
      socket.off(SOCKET_EVENTS.ERROR_NOTIFICATION, handleErrorNotification);
    };
  }, [socket, activeConversationId, dispatch, runningMessages]);

  // Join/leave conversation rooms when activeConversationId changes
  useEffect(() => {
    // Only proceed if there's a valid conversation and socket
    if (!socket || !activeConversationId || activeConversationId === 'new') {
      // If we had a previous conversation, leave it
      if (
        prevActiveConversationId.current &&
        prevActiveConversationId.current !== 'new' &&
        prevActiveConversationId.current !== activeConversationId
      ) {
        leaveConversation(dispatch, 'ThreadsPanel');
      }
      prevActiveConversationId.current = activeConversationId;
      return;
    }

    // If conversation changed, leave previous and join new
    if (prevActiveConversationId.current !== activeConversationId) {
      if (prevActiveConversationId.current && prevActiveConversationId.current !== 'new') {
        console.log('Leaving previous conversation:', prevActiveConversationId.current);
        leaveConversation(dispatch, 'ThreadsPanel');
      }

      // Join new conversation room
      console.log('Joining conversation in ThreadsPanel:', activeConversationId);
      joinConversation(activeConversationId, dispatch, 'ThreadsPanel');
      prevActiveConversationId.current = activeConversationId;
    }
  }, [activeConversationId, socket, dispatch]);

  // Setup fallback polling when WebSockets are unavailable (Azure reliability)
  useEffect(() => {
    // Clear any existing polling
    if (fallbackPollingRef.current) {
      clearInterval(fallbackPollingRef.current);
      fallbackPollingRef.current = null;
    }

    // Only set up polling if socket is disconnected and we have an active conversation
    if (!socketConnected && activeConversationId && activeConversationId !== 'new') {
      console.log('Setting up fallback polling in ThreadsPanel');

      // Poll every 15 seconds
      fallbackPollingRef.current = setInterval(() => {
        // Manually fetch conversation data
        dispatch({
          type: 'conversation/fetchConversationDetailsById',
          payload: activeConversationId,
        });
      }, 15000);
    }

    return () => {
      if (fallbackPollingRef.current) {
        clearInterval(fallbackPollingRef.current);
        fallbackPollingRef.current = null;
      }
    };
  }, [socketConnected, activeConversationId, dispatch]);

  // Clean up when unmounting
  useEffect(() => {
    return () => {
      if (activeConversationId && activeConversationId !== 'new') {
        console.log('Leaving conversation on ThreadsPanel unmount:', activeConversationId);
        leaveConversation(dispatch, 'ThreadsPanel');
      }

      // Clear any polling timers
      if (fallbackPollingRef.current) {
        clearInterval(fallbackPollingRef.current);
        fallbackPollingRef.current = null;
      }
    };
  }, [dispatch, activeConversationId]);

  const handleNewChat = useCallback(() => {
    // If we had an active conversation, leave its room first
    if (activeConversationId && activeConversationId !== 'new') {
      leaveConversation(dispatch, 'ThreadsPanel');
    }

    dispatch(clearPageConversation(currentPage));
    dispatch(resetConversationData());
    dispatch(setActiveConversation(false));
    dispatch(clearUploadedFiles());
    dispatch(clearSelectedMessages());
    prevActiveConversationId.current = null;
  }, [dispatch, currentPage, activeConversationId]);

  const handleChatSelect = useCallback(
    (chatId) => {
      try {
        // If switching from an existing conversation, leave its room
        if (activeConversationId && activeConversationId !== 'new' && activeConversationId !== chatId) {
          leaveConversation(dispatch, 'ThreadsPanel');
        }

        const allConversations = [
          ...(archivedData?.['This Week'] || []),
          ...(archivedData?.['Last Week'] || []),
          ...(archivedData?.Previous || []),
        ];

        const selectedConversation = allConversations.find((conv) => conv.id === chatId);

        if (selectedConversation?.conversation_metadata?.currentPage) {
          dispatch(setCurrentPage(selectedConversation.conversation_metadata.currentPage));
          dispatch(
            setPageConversation({
              page: selectedConversation.conversation_metadata.currentPage,
              conversationId: chatId,
            }),
          );
        }

        dispatch(updateConvesationId(chatId));
        dispatch(setActiveConversation(true));
        dispatch(clearUploadedFiles());
        dispatch(clearSelectedMessages());
        dispatch(setShowSaveOptions(true));

        // Join the new conversation room
        joinConversation(chatId, dispatch, 'ThreadsPanel');
      } catch (e) {
        console.error('Error while switching conversations:', e);
        dispatch(
          notifyViaSnackBar({
            message: `Error switching conversations: ${e.message}`,
            severity: 'error',
            open: true,
          }),
        );
      }
    },
    [dispatch, archivedData, activeConversationId],
  );

  const handleSuggestedQuestionClick = useCallback((query) => {
    if (chatInputRef.current) {
      chatInputRef.current.setInputValue(query);
      if (typeof chatInputRef.current.submitInput === 'function') {
        chatInputRef.current.submitInput(query);
      } else {
        console.warn("ChatInput needs a submitInput method exposed via useImperativeHandle to auto-send suggested questions.");
      }
    }
    dispatch(clearSelectedMessages());
  }, [dispatch]);

  // Updated handleSaveConfirm to use the API
  const handleSaveConfirm = async () => {
    if (!threadName.trim() || selectedMessages.length === 0) return;

    try {
      // Prepare thread data
      const threadData = {
        thread_name: threadName.trim(),
        message_ids: selectedMessages,
        user_id: String(currentUser?.userId),
        chat_id: activeConversationId,
        industry: selectedIndustryId,
        persona: selectedPersonaId,
        screen_type: currentPage,
      };

      // Call the API
      await saveThread(threadData).unwrap();

      // Reset UI states
      setSaveDialogOpen(false);
      dispatch(setShowSaveOptions(false));
      dispatch(clearSelectedMessages());
      handleNewChat();
      setThreadName('');
      dispatch(
        notifyViaSnackBar({
          message: 'Thread saved successfully! Check the Threads tab to view it.',
          severity: 'success',
          open: true,
          autoHideDuration: 5000,
        })
      );

    } catch (error) {
      console.error('Error saving thread:', error);
    }
  };

  const handleSaveDialogClose = () => {
    setSaveDialogOpen(false);
    setThreadName('');
  };

  const handleQuerySelect = useCallback(
    (query) => {
      if (chatInputRef.current) {
        chatInputRef.current.setInputValue(query);
      }
      if (onQuerySelect) {
        onQuerySelect(query);
      }
      dispatch(clearPageConversation(currentPage));
      dispatch(clearSelectedMessages());
    },
    [onQuerySelect, dispatch, currentPage],
  );

  const handleClose = useCallback(() => {
    if (chatInputRef.current) {
      chatInputRef.current.clearInput();
    }

    // Leave conversation room when closing panel
    if (activeConversationId && activeConversationId !== 'new') {
      leaveConversation(dispatch, 'ThreadsPanel');
    }

    // Clear any fallback polling
    if (fallbackPollingRef.current) {
      clearInterval(fallbackPollingRef.current);
      fallbackPollingRef.current = null;
    }

    dispatch(setShowSaveOptions(false));
    dispatch(clearSelectedMessages());
    onClose();
  }, [dispatch, onClose, activeConversationId]);

  return (
    <>
      <div className={`${classes.overlay} ${open ? classes.visible : ''}`} onClick={handleClose} />
      <div className={`${classes.panel} ${open ? classes.open : ''}`}>
        {open && (
          <div className={classes.tag}>
            <div onClick={handleClose} className={classes.closeButton}>
              {/* <CloseIcon /> */}
              <img src={MinimizeIcon} alt="MinimizeIcon" />
            </div>
          </div>
        )}

        <div className={classes.content}>
          <div className={classes.header}>
            <div className={classes.titleSection}>
              {/* <img src={ChatBotIcon} alt='ChatBotIcon' className={classes.titleIcon} /> */}
              <Typography variant="h6" className={classes.title}>
                History
              </Typography>
            </div>
            {!socketConnected && (
              <Alert severity="warning" sx={{ ml: 2, py: 0.5, fontSize: '0.75rem' }}>
                Real-time updates unavailable
              </Alert>
            )}
          </div>

          <div className={classes.body}>
            <div className={classes.leftSection}>
              <div className={classes.header}>
                <div className={classes.titleSection}>
                  <Typography variant="h6" className={classes.title}>
                    Previous Conversations
                  </Typography>
                </div>
                {!socketConnected && (
                  <Alert severity="warning" sx={{ ml: 2, py: 0.5, fontSize: '0.75rem' }}>
                    Real-time updates unavailable
                  </Alert>
                )}
              </div>

              <Sidebar onChatItemClick={handleChatSelect} isMenuMode={true} onNewChat={handleNewChat} />
            </div>

            <div className={classes.rightSection}>
              <div className={classes.rightHeader}>
                <img src={ChatBotIcon} alt="Chat AI" />
                <Typography variant="h6" className={classes.sectionTitle}>
                  {!activeConversationId ? 'Chat Ai' : isSelectMode ? 'Select Messages' : 'Chat'}
                </Typography>
                <div className={classes.saveOptions}>
                  {!isSelectMode ? (
                    !isPharmaceuticalIndustry && (
                      <Button
                        className={classes.saveButton}
                        onClick={() => dispatch(setShowSaveOptions(true))}
                        // startIcon={<SaveIcon />}
                        disabled={!conversationDetails.length || isCreatingConversation || isProcessingMessage || selectedMessages.length === 0}>

                      </Button>
                    )
                  ) : (
                    selectedMessages.length > 0 &&
                    <div className={classes.saveActions}>
                      <Button
                        className={classes.confirmSaveButton}
                        onClick={handleSaveClick}
                        startIcon={<SaveIcon />}
                        disabled={!selectedMessages.length}>
                        Create Thread ({selectedMessages.length})
                      </Button>
                      <Button className={classes.cancelButton} onClick={handleCancelSelect} startIcon={<CancelIcon />}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className={classes.rightContent}>
                {!activeConversationId ? (
                  <div className={classes.chatArea}>
                    <WelcomeMessage
                      userName={userName}
                      previousQueries={previousQueries}
                      onQuerySelect={handleQuerySelect}
                      personaId={selectedPersonaId}
                      screenType={currentPage}
                    />
                  </div>
                ) : (
                  <div className={classes.conversationArea}>
                    <ConversationScreen
                      id={String(activeConversationId)}
                      isSelectMode={isSelectMode}
                      stableInstanceId="threads-panel"
                      onSuggestedQuestionClick={handleSuggestedQuestionClick}
                    />
                  </div>
                )}
              </div>

              <div className={classes.inputArea}>
                <ChatInput ref={chatInputRef} instanceId="threads" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={saveDialogOpen} onClose={handleSaveDialogClose} className={classes.saveDialog}>
        <DialogTitle>Save Selected Messages</DialogTitle>
        <DialogContent>
          {saveError && (
            <Typography variant="body2" color="error" sx={{ mb: 2 }}>
              {saveError}
            </Typography>
          )}
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Enter a name for your saved thread
          </Typography>
          <TextField
            autoFocus
            fullWidth
            value={threadName}
            onChange={(e) => setThreadName(e.target.value)}
            placeholder="Enter thread name"
            variant="outlined"
            disabled={isSaving}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSaveDialogClose} className={classes.cancelButton} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveConfirm}
            className={classes.confirmSaveButton}
            disabled={!threadName.trim() || isSaving}>
            {isSaving ? (
              <>
                <CircularProgress size={16} thickness={4} sx={{ mr: 1 }} color="inherit" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

ThreadsPanel.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  userName: PropTypes.string.isRequired,
  previousQueries: PropTypes.arrayOf(PropTypes.string),
  onQuerySelect: PropTypes.func.isRequired,
};

export default ThreadsPanel;
