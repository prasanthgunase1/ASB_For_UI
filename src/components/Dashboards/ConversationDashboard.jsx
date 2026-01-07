import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  Box,
  Typography,
  Alert,
  Snackbar,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import { useDispatch, useSelector } from 'react-redux';

import ChatBotIcon from '../../assets/conversationDashboard/chatbot-speech-bubble.svg';
import ChatHistoryIcon from '../../assets/conversationDashboard/ChatHistoryIcon.svg';
import MaxsimizeIcon from '../../assets/conversationDashboard/MaxsimizeIcon.svg';
import MinimizeIcon from '../../assets/conversationDashboard/MinimizeIcon.svg';
import CloseIcon from '../../assets/conversationDashboard/CloseIcon.svg';
import {
  selectUser,
  selectCurrentPage,
  selectCurrentPageConversation,
  clearPageConversation,
  selectSelectedRole,
  selectSelectedIndustry,
} from '../../features/auth/authSlice';

import ChatInput from '../ChatInput/ChatInput';
import WelcomeMessage from '../WelcomeMessage/WelcomeMessage';
import ConversationScreen from '../ConversationScreen/ConversationScreen';
import { useFetchArchivedDataQuery, useLazyFetchArchivedDataQuery } from '../../services/conversationApi';
import { useSaveThreadMutation } from '../../services/threadApi';
import ThreadsPanel from '../ThreadsPanel/ThreadsPanel';
import classes from './ConversationDashboard.module.scss';
import { getSocket, initSocket, isSocketConnected } from '../../utils/socket';
import FeedbackDialog from '../FeedbackDialog/FeedbackDialog';
import {
  notifyViaSnackBar,
  toggleFeedbackMode,
  selectIsFeedbackEnabled,
  selectSnackbar,
  closeSnackBar,
  clearSelectedMessages,
  getSelectedMessages,
  getConversationDetails,
  resetConversationData,
  setActiveConversation,
  getMessageCreationLoading,
} from '../../redux/store/conversationSlice';

function ConversationDashboard() {
  const dispatch = useDispatch();
  const currentPage = useSelector(selectCurrentPage);
  const user = useSelector(selectUser);
  const userName = useMemo(() => user?.given_name || (user?.name ? user.name.split(' ')[0] : 'there'), [user]);
  const activeConversationId = useSelector(selectCurrentPageConversation);
  const chatInputRef = useRef(null);
  const componentMountedRef = useRef(true);

  const selectedRole = useSelector(selectSelectedRole);
  const selectedIndustry = useSelector(selectSelectedIndustry);
  const selectedIndustryId = user?.industries?.find((i) => i.name === selectedIndustry)?.id;
  const selectedPersonaId = user?.industries
    ?.find((i) => i.name === selectedIndustry)
    ?.personas?.find((p) => p.name === selectedRole)?.id;

  // Socket connection state
  const socket = getSocket();
  const [socketConnected, setSocketConnected] = useState(isSocketConnected());

  const [isThreadsPanelOpen, setIsThreadsPanelOpen] = useState(false);
  const snackbar = useSelector(selectSnackbar);

  // Save Thread
  const selectedMessages = useSelector(getSelectedMessages);
  const conversationDetails = useSelector(getConversationDetails);
  const isProcessingMessage = useSelector(getMessageCreationLoading);
  const [saveThread, { isLoading: isSaving, error: saveError }] = useSaveThreadMutation();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [threadName, setThreadName] = useState('');

  // New Chat
  const handleNewChat = useCallback(() => {
    dispatch(clearPageConversation(currentPage));
    dispatch(resetConversationData());
    dispatch(setActiveConversation(false));
    dispatch(clearSelectedMessages());
  }, [dispatch, currentPage]);

  const handleSaveClick = () => {
    if (!selectedMessages.length) return;
    const failing = selectedMessages.filter((msgId) => {
      const msg = conversationDetails.find((m) => String(m.id) === String(msgId));
      const ok = msg?.metadata?.agent_response?.result?.save_thread === true;
      return !ok;
    });
    if (failing.length === 0) {
      setSaveDialogOpen(true);
    } else {
      dispatch(
        notifyViaSnackBar({
          message: 'A thread can only be created from structured data.',
          severity: 'warning',
          open: true,
        }),
      );
    }
  };

  const handleCancelSelect = () => {
    dispatch(clearSelectedMessages());
  };

  const handleSaveDialogClose = () => {
    setSaveDialogOpen(false);
    setThreadName('');
  };

  const handleSaveConfirm = async () => {
    if (!threadName.trim() || selectedMessages.length === 0) return;
    try {
      const threadData = {
        thread_name: threadName.trim(),
        message_ids: selectedMessages,
        user_id: String(user?.userId),
        chat_id: activeConversationId,
        industry: selectedIndustryId,
        persona: selectedPersonaId,
        screen_type: currentPage,
      };
      await saveThread(threadData).unwrap();
      setSaveDialogOpen(false);
      dispatch(clearSelectedMessages());
      handleNewChat();
      setThreadName('');
      dispatch(
        notifyViaSnackBar({
          message: 'Thread saved successfully!',
          severity: 'success',
          open: true,
        }),
      );
    } catch (err) {
      dispatch(
        notifyViaSnackBar({
          message: 'Failed to save thread. Please try again.',
          severity: 'error',
          open: true,
        }),
      );
    }
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    dispatch(closeSnackBar());
  };

  const isFeedbackEnabled = useSelector(selectIsFeedbackEnabled);
  const handleFeedbackToggle = () => {
    dispatch(toggleFeedbackMode());
  };

  const { data: archivedData } = useFetchArchivedDataQuery(
    { page: 1, limit: 4, selectedIndustryId, selectedPersonaId },
    { refetchOnMountOrArgChange: true },
  );

  const [getHistoricalData, { isFetching, isError, error: fileFetchError }] = useLazyFetchArchivedDataQuery();

  useEffect(() => {
    if (!socket) {
      try {
        initSocket();
      } catch (error) {
        console.error('Failed to initialize socket:', error);
      }
    }
    return () => {
      componentMountedRef.current = false;
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    const handleConnect = () => setSocketConnected(true);
    const handleDisconnect = () => setSocketConnected(false);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    setSocketConnected(socket.connected);
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket]);

  const previousQueries = useMemo(() => {
    if (!archivedData) return [];
    const allConversations = [
      ...(archivedData['This Week'] || []),
      ...(archivedData['Last Week'] || []),
      ...(archivedData['Previous'] || []),
    ];
    return allConversations
      .filter((c) => c.conversation_metadata?.currentPage === currentPage && c.title?.trim())
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 4)
      .map((c) => ({
        id: c.id,
        question: c.title.trim().replace(/\.\.\.$/, ''),
        timestamp: c.created_at,
        metadata: c.conversation_metadata,
      }));
  }, [archivedData, currentPage]);

  // ========= History Drawer =========
  const containerRef = useRef(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyConversations, setHistoryConversations] = useState([]);

  const handelHistory = () => setIsHistoryOpen(true);
  const handleHistoryClose = () => setIsHistoryOpen(false);

  // Close History on Escape
  useEffect(() => {
    if (!isHistoryOpen) return;
    const onKey = (e) => e.key === 'Escape' && handleHistoryClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isHistoryOpen]);

  const handleThreadsClick = useCallback(() => setIsThreadsPanelOpen(true), []);
  const handleThreadsPanelClose = useCallback(() => setIsThreadsPanelOpen(false), []);
  const handleQuerySelect = useCallback(
    (query) => {
      if (chatInputRef.current) {
        chatInputRef.current.setInputValue(query);
        dispatch(clearPageConversation(currentPage));
      }
    },
    [dispatch, currentPage],
  );

  const handleSuggestedQuestionClick = useCallback((query) => {
    if (chatInputRef.current) {
      chatInputRef.current.setInputValue(query);
      if (typeof chatInputRef.current.submitInput === 'function') {
        chatInputRef.current.submitInput(query);
      }
    }
  }, []);

  const conversationKey = `conversation-${activeConversationId || 'new'}-${currentPage}`;
  const renderContent = useMemo(() => {
    if (!activeConversationId) {
      return (
        <div className={classes.chatArea}>
          <WelcomeMessage
            userName={userName}
            previousQueries={previousQueries.map((q) => q.question)}
            onQuerySelect={handleQuerySelect}
            personaId={selectedPersonaId}
            screenType={currentPage}
          />
        </div>
      );
    }
    return (
      <div className={classes.conversationArea}>
        {!socketConnected && (
          <Alert severity="warning" sx={{ m: 1, p: 0.5, fontSize: '0.75rem', borderRadius: 1 }}>
            Real-time updates unavailable
          </Alert>
        )}
        <ConversationScreen
          id={String(activeConversationId)}
          stableInstanceId="main-dashboard"
          key={conversationKey}
          onSuggestedQuestionClick={handleSuggestedQuestionClick}
        />
      </div>
    );
  }, [
    activeConversationId,
    userName,
    previousQueries,
    handleQuerySelect,
    socketConnected,
    conversationKey,
    handleSuggestedQuestionClick,
  ]);

  return (
    <div className={classes.container} ref={containerRef}>
      <div className={classes.header}>
        <div className={classes.titleSection}>
          <img src={ChatBotIcon} alt="Chat Ai" />
          <Typography variant="h6" className={classes.title}>
            Chat AI
          </Typography>
        </div>

        <div className={classes.headerActions}>
          {/* Uncomment if you re-enable “Create Thread” buttons
          {selectedMessages.length > 0 && (
            <div className={classes.saveActions}>
              <Button
                className={classes.confirmSaveButton}
                onClick={handleSaveClick}
                startIcon={<SaveIcon />}
                disabled={!selectedMessages.length}
                size="small"
                variant="contained"
                sx={{ textTransform: 'none' }}>
                Create Thread ({selectedMessages.length})
              </Button>
              <Button
                className={classes.cancelButton}
                onClick={handleCancelSelect}
                startIcon={<CancelIcon />}
                size="small"
                sx={{ textTransform: 'none' }}>
                Cancel
              </Button>
            </div>
          )} */}

          <Box className={classes.threadButtons}>
            {/* Opens History drawer */}
            <Box className={classes.threadButton} onClick={handelHistory}>
              <img
                src={ChatHistoryIcon}
                alt="ChatHistoryIcon"
                onClick={async () => {
                  const result = await getHistoricalData({});
                  console.log('result', result);
                  setHistoryConversations([
                    ...(result?.data?.['This Week'] || []),
                    ...(result?.data?.['Last Week'] || []),
                    ...(result?.data?.Previous || []),
                  ]);
                }}
              />
            </Box>
            <Box className={classes.threadButton} onClick={handleThreadsClick}>
              <img src={MaxsimizeIcon} alt="MaxsimizeIcon" />
            </Box>
          </Box>
        </div>
      </div>

      {renderContent}

      <div className={classes.inputArea}>
        <ChatInput ref={chatInputRef} instanceId="dashboard" onResetConversation={handleNewChat} />
      </div>

      {/* Threads side panel (existing) */}
      {isThreadsPanelOpen && (
        <ThreadsPanel
          open={isThreadsPanelOpen}
          onClose={handleThreadsPanelClose}
          userName={userName}
          previousQueries={previousQueries.map((q) => q.question)}
          onQuerySelect={handleQuerySelect}
        />
      )}

      <FeedbackDialog />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={snackbar.autoHideDuration || 4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity || 'info'} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Save Thread Dialog */}
      <Dialog open={saveDialogOpen} onClose={handleSaveDialogClose} className={classes.saveDialog}>
        <DialogTitle>Save Selected Messages as Thread</DialogTitle>
        <DialogContent>
          {saveError && (
            <Typography variant="body2" color="error" sx={{ mb: 2 }}>
              Could not save thread. Please try again.
            </Typography>
          )}
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Thread Name"
            value={threadName}
            onChange={(e) => setThreadName(e.target.value)}
            placeholder="Enter a name for your thread"
            variant="outlined"
            disabled={isSaving}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSaveDialogClose} disabled={isSaving} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveConfirm}
            disabled={!threadName.trim() || isSaving}
            variant="contained"
            sx={{ textTransform: 'none' }}>
            {isSaving ? <CircularProgress size={24} color="inherit" /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== History Backdrop + Panel ===== */}
      <div
        className={classes.historyBackdrop}
        onClick={handleHistoryClose}
        aria-hidden={!isHistoryOpen}
        style={{
          opacity: isHistoryOpen ? 1 : 0,
          pointerEvents: isHistoryOpen ? 'auto' : 'none',
        }}
      />
      <aside
        className={classes.historyPanel}
        aria-hidden={!isHistoryOpen}
        style={{
          transform: isHistoryOpen ? 'translateX(0)' : 'translateX(100%)',
        }}>
        {/* outside-left close; only render when open so it disappears when closed */}
        {isHistoryOpen && (
          <button
            type="button"
            aria-label="Close history"
            className={classes.historyClose}
            onClick={handleHistoryClose}>
            <img src={CloseIcon} alt="CloseIcon" />
          </button>
        )}

        <div className={classes.historyHeader}>History</div>
        <div className={classes.historyList}>
          {historyConversations?.map((it) => (
            <div
              key={it.id}
              className={classes.historyItem}
              onClick={() => {
                // If you want to prefill and submit a query from history:
                if (chatInputRef.current) {
                  chatInputRef.current.setInputValue(it.title);
                }
                handleHistoryClose();
              }}>
              {it.title}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

export default ConversationDashboard;
