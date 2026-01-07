import { getSocket, initSocket, getConnectionPromise } from '.';
import { notifyViaSnackBar } from '../../redux/store/conversationSlice';
import { SOCKET_EVENTS } from '../constants';
import { registerRoomUsage, unregisterRoomUsage, isRoomInUse, logRoomUsage } from './roomManager';

/**
 * Socket actions for MPA (Multi-Page Application)
 * 
 * Changes from SPA:
 * - No token parameter needed (uses HTTPOnly session cookies)
 * - Simplified reconnection logic
 * - No token refresh needed
 */

// Track the current conversation room
let currentRoom = null;

// Global reconnection tracking
let globalReconnectionPromise = null;

/**
 * Joins a specified conversation room with retry logic
 *
 * @param {string} conversationId - ID of the conversation to join
 * @param {Function} dispatch - Redux dispatch function
 * @param {string} componentId - Identifier of the requesting component
 * @param {number} retryCount - Optional retry counter for internal use
 */
export const joinConversation = (conversationId, dispatch, componentId = 'default', retryCount = 0) => {
  if (!conversationId) {
    console.warn('Cannot join conversation: Invalid conversation ID');
    return;
  }

  // Get current socket instance
  const socket = getSocket();

  // Register room usage first
  registerRoomUsage(conversationId, componentId);

  // If we're already in this room, just update the reference count
  if (currentRoom === conversationId) {
    return;
  }

  // Leave previous room if different
  if (currentRoom && currentRoom !== conversationId) {
    // This will check if other components are still using it
    leaveConversation(dispatch, componentId);
  }

  // Case 1: Socket exists and is connected - proceed normally
  if (socket && socket.connected) {
    emitJoinRoom(socket, conversationId, dispatch);
    return;
  }

  // Case 2: Maximum retries reached
  if (retryCount >= 3) {
    dispatch(
      notifyViaSnackBar({
        message: 'Socket connection unavailable. Using fallback mode.',
        severity: 'warning',
        open: true,
      }),
    );
    console.warn(`Socket not connected after ${retryCount} attempts. Cannot join conversation: ${conversationId}`);

    // Simple notification about connection issues
    notifyConnectionIssue(dispatch);
    return;
  }

  // Case 3: Socket exists but not connected - try re-initializing
  if (socket && !socket.connected) {

    // Check if a global reconnection is already in progress
    if (globalReconnectionPromise) {
      globalReconnectionPromise
        .then(() => {
          // Once global reconnection completes, try joining again
          setTimeout(() => {
            joinConversation(conversationId, dispatch, componentId, retryCount + 1);
          }, 500);
        })
        .catch(() => {
          // If global reconnection fails, increment retry count and try again
          joinConversation(conversationId, dispatch, componentId, retryCount + 1);
        });
      return;
    }

    // If no global reconnection is in progress, start one
    try {
      // In MPA mode, no token needed - session is in HTTPOnly cookies
      (async () => {
        try {
          // Create a global reconnection promise
          globalReconnectionPromise = new Promise((resolve, reject) => {
            // Get the connection promise from initSocket
            const newSocket = initSocket();
            const connectionPromise = getConnectionPromise();

            if (!connectionPromise) {
              // If no connection promise, socket was already initialized
              if (newSocket && newSocket.connected) {
                // Socket is already connected
                resolve(newSocket);
              } else {
                // Socket exists but not connected, wait for connect event
                const onConnect = () => {
                  newSocket.off('connect', onConnect);
                  clearTimeout(connectionTimeout);
                  resolve(newSocket);
                };

                const connectionTimeout = setTimeout(() => {
                  newSocket.off('connect', onConnect);
                  reject(new Error('Connection timed out'));
                }, 8000); // Longer timeout for Azure

                newSocket.once('connect', onConnect);
              }
            } else {
              // Use the connection promise from initSocket
              connectionPromise.then((socket) => resolve(socket)).catch((error) => reject(error));
            }
          });

          // Handle the result of the reconnection
          globalReconnectionPromise
            .then((socket) => {
              emitJoinRoom(socket, conversationId, dispatch);
              globalReconnectionPromise = null;
            })
            .catch((error) => {
              console.error('Global reconnection failed:', error?.message || 'Unknown error');
              // Try again with incremented retry count
              setTimeout(() => {
                globalReconnectionPromise = null;
                joinConversation(conversationId, dispatch, componentId, retryCount + 1);
              }, 1000);
            });
        } catch (error) {
          console.error('Failed to get Okta token for reconnection:', error?.message || 'Unknown error');
          globalReconnectionPromise = null;
          setTimeout(() => {
            joinConversation(conversationId, dispatch, componentId, retryCount + 1);
          }, 1000);
        }
      })();
    } catch (error) {
      console.error('Error during reconnection attempt:', error?.message || 'Unknown error');
      globalReconnectionPromise = null;

      // If error occurs, increment retry count and try again
      setTimeout(() => {
        joinConversation(conversationId, dispatch, componentId, retryCount + 1);
      }, 1000);
    }

    return;
  }

  // Case 4: No socket exists or other error - initialize socket
  if (!socket) {

    try {
      // In MPA mode, no token needed - session is in HTTPOnly cookies
      (async () => {
        try {
          const newSocket = initSocket();
          const connectionPromise = getConnectionPromise();

          if (connectionPromise) {
            connectionPromise
              .then(() => {
                joinConversation(conversationId, dispatch, componentId, retryCount + 1);
              })
              .catch((error) => {
                console.error('Connection promise rejected:', error?.message || 'Unknown error');
                dispatch(
                  notifyViaSnackBar({
                    message: 'Unable to establish socket connection. Using fallback mode.',
                    severity: 'warning',
                    open: true,
                  }),
                );
              });
          } else if (newSocket && newSocket.connected) {
            // Socket initialized and connected immediately
            emitJoinRoom(newSocket, conversationId, dispatch);
          } else {
            // Set up event listener for connect
            const connectTimeout = setTimeout(() => {
              if (newSocket) {
                newSocket.off('connect', connectHandler);
              }
              joinConversation(conversationId, dispatch, componentId, retryCount + 1);
            }, 5000); // Increased timeout for Azure

            const connectHandler = () => {
              clearTimeout(connectTimeout);
              if (newSocket) {
                newSocket.off('connect', connectHandler);
              }
              emitJoinRoom(newSocket, conversationId, dispatch);
            };

            if (newSocket) {
              newSocket.once('connect', connectHandler);
            }
          }
        } catch (error) {
          console.error('Failed to get Okta token for socket initialization:', error?.message || 'Unknown error');
          dispatch(
            notifyViaSnackBar({
              message: 'Authentication failed. Using fallback mode.',
              severity: 'warning',
              open: true,
            }),
          );
        }
      })();
    } catch (error) {
      console.error('Error initializing socket:', error?.message || 'Unknown error');
      dispatch(
        notifyViaSnackBar({
          message: 'Socket connection failed. Using fallback mode.',
          severity: 'warning',
          open: true,
        }),
      );
    }

    return;
  }

  // Case 5: No token available
  dispatch(
    notifyViaSnackBar({
      message: 'Authentication token not available. Using fallback mode.',
      severity: 'warning',
      open: true,
    }),
  );
  console.warn(`Authentication token not available. Cannot join conversation: ${conversationId}`);
};

/**
 * Helper function to emit join room event
 * @param {Object} socket - Socket.io instance
 * @param {string} conversationId - Conversation ID
 * @param {Function} dispatch - Redux dispatch function
 */
const emitJoinRoom = (socket, conversationId, dispatch) => {
  if (!socket || !socket.connected) {
    console.error('Cannot emit join room: Socket not connected');
    return;
  }

  try {
    socket.emit(SOCKET_EVENTS.JOIN_CONVERSATION, conversationId, (response) => {
      if (response?.error) {
        let error = 'Unknown error';
        if (response?.error) {
          error = typeof response.error === 'object' ? JSON.stringify(response.error) : response.error;
        }
        dispatch(
          notifyViaSnackBar({
            message: `Unable to join the conversation: ${error}`,
            severity: 'error',
            open: true,
          }),
        );
        console.error('Error joining conversation:', response);
      } else {
        currentRoom = conversationId;
      }
    });

    // Add safety timeout in case callback never fires (common in Azure)
    setTimeout(() => {
      if (!currentRoom) {
        currentRoom = conversationId;
      }
    }, 5000);
  } catch (err) {
    console.error('Exception when trying to join room:', err);
    // Still set the room to avoid blocking UI
    currentRoom = conversationId;
  }
};

/**
 * Simple notification for connection issues
 * @param {Function} dispatch - Redux dispatch function
 */
const notifyConnectionIssue = (dispatch) => {
  const errorMessage = 'Unable to establish real-time connection. Using fallback polling mode.';

  // Only show once every minute to avoid overwhelming the user
  if (!window._connectionErrorNotified) {
    window._connectionErrorNotified = true;

    dispatch(
      notifyViaSnackBar({
        message: errorMessage,
        severity: 'warning',
        open: true,
      }),
    );

    setTimeout(() => {
      window._connectionErrorNotified = false;
    }, 60000);
  }

  console.warn(
    'Connection issue detected:',
    navigator.onLine ? 'Network available but server unreachable' : 'Network unavailable',
  );
};

/**
 * Leaves the current conversation room with improved Azure reliability
 * @param {Function} dispatch - Redux dispatch function
 * @param {string} componentId - Identifier of the requesting component
 */
export const leaveConversation = (dispatch, componentId = 'default') => {
  if (!currentRoom) return;

  // Unregister this component's interest in the room
  const isLastReference = unregisterRoomUsage(currentRoom, componentId);

  // Only actually leave if this was the last component using the room
  if (!isLastReference) {
    return;
  }

  const socket = getSocket();

  if (socket && socket.connected) {

    // Add error handling for Azure network conditions
    try {
      socket.emit(SOCKET_EVENTS.LEAVE_CONVERSATION, currentRoom, (response) => {
        if (response?.error) {
          console.error('Error leaving conversation:', response);
          return;
        }
        currentRoom = null;
      });

      // Azure-specific: Add a safety timeout to ensure room is left
      // even if the server doesn't respond
      setTimeout(() => {
        if (currentRoom) {
          currentRoom = null;
        }
      }, 5000);
    } catch (err) {
      console.error('Exception when trying to leave room:', err);
      // Safely handle the error by still clearing the currentRoom
      currentRoom = null;
    }
  } else if (socket) {
    console.warn('Socket exists but not connected. Cannot leave conversation.');
    currentRoom = null;
  } else {
    console.warn('Socket not initialized. Cannot leave conversation.');
    currentRoom = null;
  }
};

/**
 * Disconnects the socket completely with improved cleanup
 * @returns {boolean} Success state of disconnection
 */
export const disconnectSocket = () => {
  const socket = getSocket();

  if (socket) {
    try {
      // Clear any global reconnection promise
      globalReconnectionPromise = null;

      // Clear current room reference
      currentRoom = null;

      if (socket.connected) {

        // First try to leave any rooms
        if (currentRoom) {
          socket.emit(SOCKET_EVENTS.LEAVE_CONVERSATION, currentRoom, () => {
            socket.disconnect();
          });

          // Set a timeout in case the server doesn't respond
          setTimeout(() => {
            socket.disconnect();
          }, 500);
        } else {
          socket.disconnect();
        }
      }
      return true;
    } catch (error) {
      console.error('Error disconnecting socket:', error.message);
      return false;
    }
  }
  return false;
};

/**
 * Performs a health check on the socket connection
 * @param {Function} dispatch - Redux dispatch function
 * @returns {boolean} Current connection status
 */
export const checkSocketHealth = (dispatch) => {
  const socket = getSocket();

  if (!socket) {
    dispatch(
      notifyViaSnackBar({
        message: 'Socket connection not initialized',
        severity: 'warning',
        open: true,
      }),
    );
    return false;
  }

  if (!socket.connected) {
    dispatch(
      notifyViaSnackBar({
        message: 'Socket is disconnected',
        severity: 'warning',
        open: true,
      }),
    );
    return false;
  }

  // Log room usage for debugging
  try {
    logRoomUsage();
  } catch (e) {
    // Ignore errors from logging
  }

  return true;
};

/**
 * Gets the currently active room ID
 * @returns {string|null} Current room ID
 */
export const getCurrentRoom = () => currentRoom;

/**
 * Checks if a specific component is using a room
 * @param {string} conversationId - Conversation ID to check
 * @param {string} componentId - Component ID to check
 * @returns {boolean} Whether the component is using the room
 */
export const isComponentUsingRoom = (conversationId, componentId) => {
  if (!conversationId || !componentId) return false;
  const roomUsers = isRoomInUse(conversationId);
  return roomUsers && isRoomInUse(conversationId, componentId);
};

/**
 * Forcibly leaves all rooms regardless of reference count
 * @param {Function} dispatch - Redux dispatch function
 * @returns {void}
 */
export const forceLeaveAllRooms = (dispatch) => {
  const socket = getSocket();
  if (socket && socket.connected && currentRoom) {
    socket.emit(SOCKET_EVENTS.LEAVE_CONVERSATION, currentRoom, (response) => {
      if (response?.error) {
        console.error('Error force leaving conversation:', response);
      }
      currentRoom = null;
    });
  } else {
    currentRoom = null;
  }
};
