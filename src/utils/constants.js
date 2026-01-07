//page constants
export const DEFAULT_PAGE_SIZE = 100;

export const ITEMS_PER_PAGE = 25;

// File: constants.js

// File Upload Constraints
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
export const MAX_FILES_UPLOAD = 1000;
export const ALLOWED_FILE_TYPES = ['.pdf', '.ppt', '.pptx', '.txt', '.docx', '.xlsx', '.xls', '.csv'];

// Default User Image
export const DEFAULT_USER_IMAGE = 'default.png';

// Message Types
export const MESSAGE_TYPES = {
  TEXT: 'text',
};

export const KEYCLOAK = {
  MISSING_GROUP_ERROR: ' Please contact administrator',
};
export const OKTA = {
  MISSING_GROUP_ERROR: 'Insufficient permissions. Please contact administrator',
  AUTH_ERROR: 'Authentication failed. Please try again.',
};

// Sender Types for api request
export const SENDER_TYPES = {
  USER: 'user',
  AI: 'chatai',
};

// Sender Types for display names
export const SENDER_TYPES_DISP_NAME = {
  USER: '',
  AI: '',
};

// Placeholder Texts
export const PLACEHOLDERS = {
  CHAT_INPUT: 'Type here...',
};

export const MESSAGE_STATUS = {
  IN_PROGRESS: 'inprogress',
  LOADING: 'loading',
};

export const MESSAGE_IDENTIFIER = {
  USER_MESSAGE_IDENTIFIER: 'user_message_pending',
  AI_MESSAGE_IDENTIFIER: 'ai_message_pending',
};

export const LOADER_MESSAGE = {
  USER_LOADING_MESSAGE: 'Sending..',
  AI_LOADING_MESSAGE: 'AI is thinking...',
};

export const CONVERSATION_SCREEN = {
  WELCOME_MESSAGE: 'Welcome to ChatAi',
  WELCOME_MESSAGE_CAPTION: 'Start Typing Your Queries...',
  FETCHING_CONVERSATIONS: 'Fetching conversation...',
  EMPTY_CONVERSATION_MESSAGE: 'No messages in this conversation yet.',
  CREATING_CONVERSATION: 'creating conversation...',
};

export const DELETION_MSG = 'Deleting';
export const DELETE_CONFORMATION_MSG = 'Delete Confirmation';
export const DELETE_ACKNOWLEDGEMENT_MSG = 'Are you sure want to delete';

export const CONVERSATIONS = {
  CATEGORY: {
    TODAY: 'today',
    YESTERDAY: 'yesterday',
    PAST30DAYS: 'past 30 days',
  },
  CHAT_HISTORY: 'Chat History',
  TITLE: 'New chat',
  LOADING: 'Loading...',
  ERROR_MESSAGE: 'Error loading conversations',
};

export const SOCKET_EVENTS = {
  JOIN_CONVERSATION: 'join-conversation',
  LEAVE_CONVERSATION: 'leave-conversation',
  CONVERSATION_MESSAGE: 'conversation-message',
  CONVERSATION_STATUS: 'conversation-status',
  CONVERSATION_QUEUED: 'conversation-queued',
  NOTIFICATION: 'notification',
  ERROR_NOTIFICATION: 'error-notification',
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
};
export const CONVERSATION_ITEM_STATUS = {
  IN_PROGRESS: 'inprogress',
  COMPLETED: 'completed',
};

export const PREVIEW_ALLOWED_FILETYPES = ['pdf'];
