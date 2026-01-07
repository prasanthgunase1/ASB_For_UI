import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { InputBase, IconButton, Chip, Tooltip } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import MapsUgcIcon from '@mui/icons-material/MapsUgc';
import UploadSharpIcon from '@mui/icons-material/UploadSharp';
import PropTypes from 'prop-types';
import { useDispatch, useSelector } from 'react-redux';
import {
  updateConvesationId,
  setCreatingConversation,
  updateConversation,
  setMessageCreaionProcessing,
  getSelectedMessages,
  clearSelectedMessages,
  setUploadedFiles,
  clearUploadedFiles,
  clearDefaultSelectedMessages,
  getConversationDetails,
  updateConversationItemStatus,
} from '../../redux/store/conversationSlice';
import {
  selectCurrentPage,
  selectCurrentPageConversation,
  setPageConversation,
  selectUser,
  selectSelectedIndustry,
  selectSelectedRole,
} from '../../features/auth/authSlice';
import { useAddMessageInDBMutation, useCreateNewConversationMutation } from '../../services/conversationApi';
import {
  ALLOWED_FILE_TYPES,
  CONVERSATION_ITEM_STATUS,
  DEFAULT_USER_IMAGE,
  MAX_FILE_SIZE,
  MAX_FILES_UPLOAD,
  MESSAGE_IDENTIFIER,
  MESSAGE_STATUS,
  MESSAGE_TYPES,
  PLACEHOLDERS,
  SENDER_TYPES,
} from '../../utils/constants';
import classes from './ChatInput.module.scss';

const ChatInput = forwardRef(({ instanceId = 'default', onResetConversation }, ref) => {
  const dispatch = useDispatch();
  const currentPage = useSelector(selectCurrentPage);
  const conversationDetails = useSelector(getConversationDetails);
  const currentUser = useSelector(selectUser);
  const selectedMessages = useSelector(getSelectedMessages);
  const selectedIndustry = useSelector(selectSelectedIndustry);
  const selectedRole = useSelector(selectSelectedRole);
  const activeConversationId = useSelector(selectCurrentPageConversation);
  const user = currentUser;

  const [question, setQuestion] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileError, setFileError] = useState('');
  const mountedRef = useRef(true);
  const [localFiles, setLocalFiles] = useState([]);

  const [addMessageInDB] = useAddMessageInDBMutation();
  const [createNewConversation] = useCreateNewConversationMutation();
  const [showOutsideAddIcon, setShowOutsideAddIcon] = useState(true);
const [isOutsideAddDisabled, setIsOutsideAddDisabled] = useState(true);

  const getMimeType = useCallback((filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }, []);

  useEffect(() => {
    setFileError('');
    setQuestion('');
    setLocalFiles([]);
    dispatch(clearUploadedFiles(instanceId));

    return () => {
      if (!activeConversationId || activeConversationId === 'new') {
        setLocalFiles([]);
        dispatch(clearUploadedFiles(instanceId));
      }
    };
  }, [currentPage, dispatch, activeConversationId, instanceId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      setQuestion('');
      setFileError('');
      setLocalFiles([]);
      dispatch(clearUploadedFiles(instanceId));
      dispatch(clearSelectedMessages());
      dispatch(clearDefaultSelectedMessages());
      setIsProcessing(false);
    };
  }, [dispatch, instanceId]);

  useImperativeHandle(ref, () => ({
    setInputValue: (value) => {
      setQuestion(value);
      setFileError('');
    },
    clearInput: () => {
      setQuestion('');
      setLocalFiles([]);
      dispatch(clearUploadedFiles(instanceId));
      dispatch(clearSelectedMessages());
      dispatch(clearDefaultSelectedMessages());
      setFileError('');
    },
  }));

  const validateFiles = useCallback(
    (selectedFiles) => {
      const invalidFiles = [];
      const oversizedFiles = [];
      const duplicateFiles = [];
      const existingFiles = new Map();

      conversationDetails.forEach((message) => {
        if (message.files && Array.isArray(message.files)) {
          message.files.forEach((file) => {
            if (file.file_name) {
              existingFiles.set(file.file_name, {
                name: file.file_name,
                size: file.file_size,
                type: file.file_type || getMimeType(file.file_name),
              });
            }
          });
        }
      });

      localFiles.forEach((file) => {
        existingFiles.set(file.name, file);
      });

      if (selectedFiles.length + localFiles.length > MAX_FILES_UPLOAD) {
        setFileError(`Maximum ${MAX_FILES_UPLOAD} files allowed`);
        return false;
      }

      for (const file of selectedFiles) {
        if (file.size > MAX_FILE_SIZE) {
          oversizedFiles.push(file.name);
          continue;
        }

        const fileExt = '.' + file.name.split('.').pop().toLowerCase();
        if (!ALLOWED_FILE_TYPES.includes(fileExt)) {
          invalidFiles.push(file.name);
          continue;
        }

        if (existingFiles.has(file.name)) {
          duplicateFiles.push(file.name);
          continue;
        }
      }

      if (oversizedFiles.length > 0) {
        setFileError(`Files exceeding ${MAX_FILE_SIZE / (1024 * 1024)}MB: ${oversizedFiles.join(', ')}`);
        return false;
      }

      if (invalidFiles.length > 0) {
        setFileError(`Invalid file types: ${invalidFiles.join(', ')}. Allowed: ${ALLOWED_FILE_TYPES.join(', ')}`);
        return false;
      }

      if (duplicateFiles.length > 0) {
        setFileError(`Duplicate files not allowed: ${duplicateFiles.join(', ')}`);
        return false;
      }

      return true;
    },
    [localFiles, conversationDetails, getMimeType],
  );

  const handleFileChange = (event) => {
    const newFiles = Array.from(event.target.files);
    try {
      if (validateFiles(newFiles)) {
        const serializedFiles = newFiles.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type || getMimeType(file.name),
          lastModified: file.lastModified,
          data: file,
        }));

        const updatedFiles = [...localFiles, ...serializedFiles];
        setLocalFiles(updatedFiles);
        dispatch(
          setUploadedFiles({
            instanceId,
            files: updatedFiles.map((file) => ({
              name: file.name,
              size: file.size,
              type: file.type,
              lastModified: file.lastModified,
            })),
          }),
        );
        event.target.value = '';
        setFileError('');
      }
    } catch (error) {
      console.error('File validation error:', error);
      setFileError('Error processing files. Please try again.');
    }
  };

  const handleFileRemove = (fileToRemove) => {
    const updatedFiles = localFiles.filter((file) => file.name !== fileToRemove.name);
    setLocalFiles(updatedFiles);
    dispatch(
      setUploadedFiles({
        instanceId,
        files: updatedFiles.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
        })),
      }),
    );
    setFileError('');
  };

  const handleSubmitQuestion = async () => {
    if (isProcessing || !question.trim()) {
      if (localFiles.length > 0 && !question.trim()) {
        setFileError('Please add a question with your files');
      }
      return;
    }

    const currentQuestion = question;
    const currentFiles = [...localFiles];

    setIsProcessing(true);
    setQuestion('');
    setLocalFiles([]);
    dispatch(clearUploadedFiles(instanceId));
    dispatch(setMessageCreaionProcessing(true));

    try {
      // const randomNumber = Math.floor(Math.random() * 10000);
      const randomNumber = window.crypto.getRandomValues(new Uint32Array(1))[0]%1000;
      let conversationId = activeConversationId;

      if (!conversationId || conversationId === 'new') {
        const createConversationBody = {
          user_id: user?.email || user?.sub,
          title: currentQuestion.slice(0, 50) + (currentQuestion.length > 50 ? '...' : ''),
          conversation_metadata: {
            conversation_id: null,
            currentPage: currentPage === 'insights' ? 'insight' : currentPage,
            files: currentFiles.map((file) => ({
              name: file.name,
              type: file.type,
            })),
            client: currentUser?.industries?.find((i) => i.name === selectedIndustry)?.id,
            persona: currentUser?.industries
              ?.find((i) => i.name === selectedIndustry)
              ?.personas?.find((p) => p.name === selectedRole)?.id,
            topic: currentQuestion.slice(0, 50),
          },
          user: {
            username: user?.email,
            name: user?.name || '',
            userId: user?.sub,
            email: user?.email,
            image_url: user?.picture || DEFAULT_USER_IMAGE,
          },
        };

        dispatch(setCreatingConversation(true));
        const response = await createNewConversation(createConversationBody).unwrap();
        conversationId = response?.data?.id || response?.id || response?.conversationId;

        if (!conversationId) {
          throw new Error('Failed to create conversation');
        }

        dispatch(
          setPageConversation({
            page: currentPage,
            conversationId: conversationId,
          }),
        );
        dispatch(updateConvesationId(conversationId));
      }

      const questionToInsert = {
        id: `${MESSAGE_IDENTIFIER.USER_MESSAGE_IDENTIFIER} ${randomNumber}`,
        conversation_id: conversationId,
        source_msg_id: null,
        message: currentQuestion,
        message_type: MESSAGE_TYPES.TEXT,
        sender_type: SENDER_TYPES.USER,
        created_by: user?.email || '',
        created_at: new Date().toISOString(),
        files: currentFiles.map((file) => ({
          file_name: file.name,
          file_type: file.type,
          file_url: null,
          file_size: file.size,
          name: file.name,
          type: file.type,
        })),
      };

      const answerToInsert = {
        metadata: {
          status: MESSAGE_STATUS.IN_PROGRESS,
        },
        id: MESSAGE_IDENTIFIER.AI_MESSAGE_IDENTIFIER,
        conversation_id: conversationId,
        source_msg_id: `${MESSAGE_IDENTIFIER.USER_MESSAGE_IDENTIFIER} ${randomNumber}`,
        message: null,
        sender_type: SENDER_TYPES.AI,
        created_at: new Date().toISOString(),
        loading: true,
      };

      dispatch(
        updateConversation({
          dummyQuestion: questionToInsert,
          dummyAnswer: answerToInsert,
        }),
      );
      dispatch(
        updateConversationItemStatus({
          id: conversationId,
          status: CONVERSATION_ITEM_STATUS.IN_PROGRESS,
        }),
      );

      const formatSelectedMessages = () => {
        const pairs = [];
        const processedSources = new Set();
        const messagesMap = new Map();

        conversationDetails.forEach((msg) => {
          messagesMap.set(String(msg.id), msg);
        });

        for (const msgId of selectedMessages) {
          if (processedSources.has(msgId)) continue;

          const currentMsg = messagesMap.get(String(msgId));
          if (!currentMsg) continue;

          let questionMsg, answerMsg;

          if (currentMsg.sender_type === 'user') {
            questionMsg = currentMsg;
            answerMsg = conversationDetails.find(
              (m) => String(m.source_msg_id) === String(currentMsg.id) && m.sender_type === 'chatai',
            );
          } else if (currentMsg.sender_type === 'chatai') {
            answerMsg = currentMsg;
            questionMsg = messagesMap.get(String(currentMsg.source_msg_id));
          }

          if (questionMsg && answerMsg) {
            pairs.push([questionMsg.message, answerMsg.message]);
            processedSources.add(String(questionMsg.id));
            processedSources.add(String(answerMsg.id));
          }
        }

        return pairs;
      };

      const message = formatSelectedMessages();
      const msgPayload = {
        message: message,
        chat_id: String(conversationId),
        user_id: String(currentUser?.userId),
      };

      const llmPayload =
        selectedMessages.length > 0
          ? { msg_id: true, msgPayload }
          : {
              user_files_uploads: [],
              query: currentQuestion,
              file_present_flag: currentFiles.length > 0,
              chat_id: String(conversationId),
              screen_type: currentPage === 'insights' ? 'insight' : currentPage,
              persona_profiler: {
                persona: selectedRole,
                persona_id: currentUser?.industries
                  ?.find((i) => i.name === selectedIndustry)
                  ?.personas?.find((p) => p.name === selectedRole)?.id,
                industry: selectedIndustry,
                industry_id: currentUser?.industries?.find((i) => i.name === selectedIndustry)?.id,
                client_id: currentUser?.industries?.find((i) => i.name === selectedIndustry)?.clientId,
                user_id: String(currentUser?.userId),
              },
              question_id: null,
            };

      const formData = new FormData();
      formData.append('conversation_id', conversationId);
      formData.append('sender_type', SENDER_TYPES.USER);
      formData.append('message', currentQuestion);
      formData.append('message_type', MESSAGE_TYPES.TEXT);
      formData.append('currentPage', currentPage === 'insights' ? 'insight' : currentPage);
      formData.append('llmPayload', JSON.stringify(llmPayload));

      if (currentFiles.length > 0) {
        currentFiles.forEach((file) => {
          formData.append('files', file.data);
        });
        formData.append('has_attachments', 'true');
      }

      await addMessageInDB(formData).unwrap();
      dispatch(clearSelectedMessages());
      dispatch(clearDefaultSelectedMessages());
    } catch (error) {
      console.error('Error in handleSubmitQuestion:', error);
      setQuestion(currentQuestion);
      setLocalFiles(currentFiles);
      dispatch(
        setUploadedFiles({
          instanceId,
          files: currentFiles.map((file) => ({
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
          })),
        }),
      );
      dispatch(
        updateConversationItemStatus({
          id: activeConversationId,
          status: CONVERSATION_ITEM_STATUS.COMPLETED,
        }),
      );
      setFileError(
        error.message === 'Failed to create conversation'
          ? 'Could not create conversation. Please try again.'
          : 'Failed to send message. Please try again.',
      );
    } finally {
      if (mountedRef.current) {
        setIsProcessing(false);
      }
      dispatch(setCreatingConversation(false));
      dispatch(setMessageCreaionProcessing(false));
    }
  };

  const handleQuestion = (event) => {
    setQuestion(event.target.value);
    setFileError('');
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmitQuestion();
    }
  };

  return (
    <div className={classes.inputMessageFieldContainer}>
      {fileError && <div className={classes.error}>{fileError}</div>}

      <div className={classes.inputBaseContainer}>
        {localFiles.length > 0 && (
          <div className={classes.fileChipsContainer}>
            {localFiles.slice(0, 2).map((file, index) => (
              <Chip
                key={`${file.name}-${index}`}
                label={file.name}
                onDelete={() => handleFileRemove(file)}
                deleteIcon={<CloseIcon />}
                size="small"
                icon={<AttachFileIcon />}
                className={classes.fileChip}
              />
            ))}
            {localFiles.length > 2 && (
              <Tooltip
                title={localFiles
                  .slice(2)
                  .map((file) => file.name)
                  .join('\n')}
                arrow
                placement="top">
                <Chip label={`+${localFiles.length - 2} more`} size="small" className={classes.moreFilesChip} />
              </Tooltip>
            )}
          </div>
        )}

        <div className={classes.inputWrapperOuter}>
          {/* 1️⃣ OUTSIDE ADD ICON (Modified behavior) */}
         {showOutsideAddIcon && (
  <IconButton
    className={classes.outerAddButton}
    size="small"
    disabled={isOutsideAddDisabled}
    sx={{ opacity: isOutsideAddDisabled ? 0.5 : 1 }}
    onClick={() => {
      if (isOutsideAddDisabled) return;
      if (typeof onResetConversation === 'function') {
        onResetConversation();
      }
      setIsOutsideAddDisabled(true);
      setShowOutsideAddIcon(true);
    }}
  >
    <MapsUgcIcon />
  </IconButton>
)}


          {/* MAIN INPUT AREA */}
          <div className={classes.inputWrapper}>
            <InputBase
              className={classes.inputBase}
              placeholder={PLACEHOLDERS.CHAT_INPUT}
              value={question}
              onChange={(e) => {
                handleQuestion(e);
                setIsOutsideAddDisabled(true);
              }}
              onKeyPress={handleKeyPress}
              disabled={isProcessing}
              fullWidth
              multiline
              maxRows={4}
            />

            <input
              type="file"
              accept={ALLOWED_FILE_TYPES.join(',')}
              hidden
              id={`icon-button-file-${instanceId}`}
              onChange={handleFileChange}
              disabled={isProcessing || localFiles.length >= MAX_FILES_UPLOAD}
              multiple
            />
            <label htmlFor={`icon-button-file-${instanceId}`}>
              <IconButton
                component="span"
                className={classes.uploadButton}
                disabled={isProcessing || localFiles.length >= MAX_FILES_UPLOAD}
                size="small">
                <UploadSharpIcon />
              </IconButton>
            </label>

            <IconButton
              onClick={async () => {
                await handleSubmitQuestion();
                setShowOutsideAddIcon(true);
                setIsOutsideAddDisabled(false)
              }}
              disabled={isProcessing || !question.trim()}
              className={classes.sendButton}
              size="small">
              <SendIcon style={{ fontSize: '12px' }} />
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
});

ChatInput.propTypes = {
  instanceId: PropTypes.string,
  onResetConversation: PropTypes.func,
  ref: PropTypes.any,
};

ChatInput.displayName = 'ChatInput';

export default ChatInput;
