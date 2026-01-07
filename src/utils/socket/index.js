import { io } from 'socket.io-client';

let socket = null;
let connectionPromise = null;

/**
 * Socket connection manager for MPA (Multi-Page Application)
 * 
 * Changes from SPA:
 * - No token parameter needed (uses HTTPOnly session cookies)
 * - Simplified initialization
 * - Session cookies sent automatically with credentials
 * - No token renewal logic needed
 *
 * @version 2.0.0 - MPA Architecture
 */

/**
 * Initialize or return existing socket connection with Promise tracking
 * In MPA mode, authentication is handled via HTTPOnly cookies
 * 
 * @returns {object} Socket.io instance
 */
export const initSocket = () => {
  // If socket exists and is connected, return it
  if (socket && socket.connected) {
    return socket;
  }

  // If a connection attempt is already in progress, return the socket
  if (connectionPromise) {
    return socket;
  }

  // If socket exists but is disconnected, try to reconnect instead of creating new
  if (socket && !socket.connected) {
    try {
      socket.connect();

      connectionPromise = new Promise((resolve, reject) => {
        const connectTimeout = setTimeout(() => {
          socket.off('connect', connectHandler);
          console.error('Reconnection timed out');
          connectionPromise = null;
          reject(new Error('Reconnection timeout'));
        }, 300000);

        const connectHandler = () => {
          clearTimeout(connectTimeout);
          connectionPromise = null;
          resolve(socket);
        };

        socket.once('connect', connectHandler);
      }).catch((error) => {
        console.error('Reconnection failed:', error.message);
        if (socket) {
          socket.removeAllListeners();
          socket.io.removeAllListeners();
          socket.disconnect();
          socket = null;
        }
        return createNewSocket();
      });

      return socket;
    } catch (error) {
      console.error('Socket reconnection error:', error.message);
    }
  }

  return createNewSocket();
};

/**
 * Creates a new Socket.io connection
 * Uses HTTPOnly cookies for authentication
 * 
 * @returns {object|null} Socket instance or null if initialization fails
 */
function createNewSocket() {
  let wsBaseUrl = import.meta.env.VITE_WS_BASE_URL;
  if (!wsBaseUrl) {
    console.warn('VITE_WS_BASE_URL not configured, using production fallback');
    wsBaseUrl = 'https://deepthought.tigeranalyticstest.in';
  }
  try {
    // Validate and normalize the URL
    let wsUrl = wsBaseUrl;
    try {
      const url = new URL(wsBaseUrl);
      // wsUrl = url.origin + url.pathname.replace(/\/$/, '');
    } catch (e) {
      console.warn('Invalid WebSocket URL format, using as-is:', wsBaseUrl);
    }

    connectionPromise = new Promise((resolve, reject) => {
      // MPA socket configuration - uses HTTPOnly cookies for authentication
      socket = io(wsBaseUrl, {
        path: import.meta.env.VITE_API_BASE_PATH ? `${import.meta.env.VITE_API_BASE_PATH}/socket.io/` : '/socket.io/',
        reconnection: true,
        reconnectionAttempts: 8,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 8000,
        timeout: 20000,
        pingInterval: 15000,
        pingTimeout: 30000,
        transports: ['websocket', 'polling'], // Prioritize websocket
        upgrade: true,
        rememberUpgrade: true,
        withCredentials: true, // Important: Include HTTPOnly cookies
        autoConnect: true,
        forceNew: false,
        extraHeaders: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        query: {
          'client-version': '2.0.0',
          t: Date.now(), // Cache buster
        },
      });

      // Add better error handling
      socket.on('connect', () => {
        connectionPromise = null;
        resolve(socket);
      });

      socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err.message);
        console.error('Error details:', err);
      });

      // Handle server disconnect
      socket.on('disconnect', (reason) => {
        if (reason === 'io server disconnect') {
          console.warn('Server disconnected socket');
        }
      });

      // Global timeout
      setTimeout(() => {
        if (connectionPromise) {
          console.error('Socket connection timeout');
          connectionPromise = null;
          reject(new Error('Connection timeout'));
        }
      }, 45000);
    });

    return socket;
  } catch (error) {
    console.error('Socket initialization error:', error.message);
    connectionPromise = null;
    return null;
  }
}

/**
 * Get the current socket instance
 * @returns {object|null} Socket.io instance or null if not initialized
 */
export const getSocket = () => socket;

/**
 * Get connection promise to track initialization status
 * @returns {Promise|null} Connection promise or null if no connection in progress
 */
export const getConnectionPromise = () => connectionPromise;

/**
 * Check if socket is currently connected
 * @returns {boolean} Connection status
 */
export const isSocketConnected = () => {
  return socket?.connected || false;
};

/**
 * Get connection diagnostics
 * @returns {object} Connection diagnostic information
 */
export const getConnectionDiagnostics = () => {
  if (!socket) return { status: 'not_initialized' };

  return {
    connected: socket.connected,
    socketId: socket.id,
    transport: socket.io.engine?.transport?.name || 'unknown',
    upgraded: socket.io.engine?.upgraded || false,
    readyState: socket.io.engine?.readyState || 'unknown',
    pingInterval: socket.io.engine?.pingInterval || 0,
    pingTimeout: socket.io.engine?.pingTimeout || 0,
    url: socket.io.uri,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Disconnect and cleanup socket connection
 * @returns {boolean} Success indicator
 */
export const disconnectSocket = () => {
  if (!socket) return true;

  try {
    if (connectionPromise) {
      connectionPromise = null;
    }

    // Comprehensive cleanup
    socket.offAny();
    socket.removeAllListeners();

    if (socket.io) {
      socket.io.removeAllListeners();
      if (socket.io.engine) {
        socket.io.engine.removeAllListeners();
      }
    }

    socket.disconnect();
    socket = null;

    // Clear any global references
    if (typeof window !== 'undefined') {
      window.socketInstance = null;
    }

    return true;
  } catch (error) {
    console.error('Socket disconnection error:', error.message);
    socket = null;
    return false;
  }
};
