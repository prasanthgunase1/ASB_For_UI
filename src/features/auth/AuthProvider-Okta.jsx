import { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { initializeOkta, getOktaUser, getOktaAccessToken, oktaLogout } from '../../utils/okta';
import PropTypes from 'prop-types';
import { validateOktaConfig } from '../../utils/validator';
import { AuthContext } from './AuthContext';
import LinearLoader from '../../components/LinearLoader';
import { useDispatch } from 'react-redux';
import { disconnectSocket, initSocket } from '../../utils/socket';
import { setupSocketListeners } from '../../utils/socket/socketEvents';
import { notifyViaSnackBar } from '../../redux/store/conversationSlice';
import { setUser } from '../auth/authSlice';

/**
 * AuthProvider component handling Okta authentication and socket connection
 * with Azure-optimized settings for WebSockets
 *
 * Features:
 * - Okta authentication with PKCE flow
 * - Automatic token refresh with socket reconnection
 * - Timeout handling for socket connection
 * - Better error handling and recovery
 * - Role-based access control
 */
const AuthProvider = ({ children }) => {
  const [initializationLoading, setInitializationLoading] = useState(true);
  const [authError, setAuthError] = useState();
  const socketInitializedRef = useRef(false);
  const connectionTimeoutRef = useRef(null);
  const oktaAuthRef = useRef(null);
  const dispatch = useDispatch();
  const location = useLocation();
  const navigate = useNavigate();

  const disableLoading = () => {
    setInitializationLoading(false);
  };

  const enableLoading = () => {
    setInitializationLoading(true);
  };

  const cleanupApp = () => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }
    disconnectSocket();
  };

  /**
   * Extract groups/roles from Okta user object
   * Okta stores group information in the groups claim or via group API
   */
  const extractUserRoles = (user) => {
    let userRoles = [];

    // Check for groups in user object (if configured in Okta)
    if (user?.groups && Array.isArray(user.groups)) {
      userRoles = user.groups;
    }

    // Alternative: Check for app roles in custom claims
    if (user?.app_roles && Array.isArray(user.app_roles)) {
      userRoles = [...userRoles, ...user.app_roles];
    }

    // Remove duplicates
    userRoles = [...new Set(userRoles)];

    return userRoles;
  };

  // Handle all events requiring user authentication
  const handleUserAuthenticatedEvents = async (oktaAuth, user) => {
    if (socketInitializedRef.current) {
      return;
    }

    try {
      // Extract roles from Okta user
      const userRoles = extractUserRoles(user);

      // Dispatch user info and roles to Redux
      dispatch(
        setUser({
          sub: user.sub,
          email: user.email,
          name: user.name,
          given_name: user.given_name,
          family_name: user.family_name,
          locale: user.locale,
          groups: userRoles,
          roles: userRoles,
        }),
      );

      // Get access token for socket initialization
      const accessToken = await getOktaAccessToken();
      if (!accessToken) {
        throw new Error('Unable to retrieve access token');
      }

      const socket = initSocket(accessToken);
      socketInitializedRef.current = true;

      // Setup socket event listeners
      setupSocketListeners(socket, dispatch, disableLoading);

      // Monitor initial connection - Azure WebSocket timeout check
      const connectionTimeout = setTimeout(() => {
        if (socket && !socket.connected) {
          console.warn('Socket connection timeout - forcing initialization to complete');
          disableLoading();

          // Notify user about connection issues
          dispatch(
            notifyViaSnackBar({
              message: 'WebSocket connection timeout. Some real-time features may be unavailable.',
              severity: 'warning',
              open: true,
            }),
          );
        }
      }, 7000); // 7 second timeout for initial connection

      connectionTimeoutRef.current = connectionTimeout;

      // Setup token refresh to update socket connection
      const originalRenew = oktaAuth.tokenManager.renew.bind(oktaAuth.tokenManager);
      oktaAuth.tokenManager.renew = async function (tokenName) {
        try {
          const renewed = await originalRenew(tokenName);
          if (renewed) {
            disconnectSocket();
            socketInitializedRef.current = false;
            const newAccessToken = await getOktaAccessToken();
            if (newAccessToken) {
              const newSocket = initSocket(newAccessToken);
              setupSocketListeners(newSocket, dispatch, disableLoading);
            }
          }
          return renewed;
        } catch (error) {
          console.error('Token renewal error:', error);
          return false;
        }
      };

      // Verify connection occurs within timeout period
      socket.on('connect', () => {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        disableLoading();
      });

      // Handle initial connection error
      socket.on('connect_error', (error) => {
        console.error('Socket connection error on initialization:', error.message);
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
          disableLoading();
        }

        // Notify user about connection issues
        dispatch(
          notifyViaSnackBar({
            message: `Socket connection error: ${error.message}. Some real-time features may be unavailable.`,
            severity: 'warning',
            open: true,
          }),
        );
      });
    } catch (error) {
      console.error('Failed to initialize socket:', error);
      disableLoading();
    }
  };

  const initializeApp = async () => {
    try {
      if (!validateOktaConfig()) {
        throw new Error('Invalid Okta configuration');
      }

      enableLoading();
      const oktaAuth = await initializeOkta();
      oktaAuthRef.current = oktaAuth;

      // Check auth state
      const authState = await oktaAuth.authStateManager.getAuthState();

      if (authState?.isAuthenticated) {
        try {
          const user = await getOktaUser();
          if (user) {
            await handleUserAuthenticatedEvents(oktaAuth, user);
            setAuthError('');
          } else {
            throw new Error('Failed to retrieve user information');
          }
        } catch (userError) {
          console.error('Error retrieving user:', userError);
          // Try to logout and redirect
          await oktaLogout();
          navigate('/login', { replace: true });
          throw userError;
        }
      }
      disableLoading();
    } catch (err) {
      console.error('Error in application initialization:', err);

      let errStr = 'Failed to connect. Please refresh! If issue still persists, please contact admin.';
      if (typeof err === 'string') {
        errStr = err + errStr;
      } else if (typeof err === 'object') {
        if (err?.message) {
          errStr = err.message + ' - ' + errStr;
        } else {
          errStr = JSON.stringify(err) + errStr;
        }
      }

      setAuthError(errStr);
      disableLoading();
    }
  };

  useEffect(() => {
    initializeApp();
    return () => {
      cleanupApp();
    };
  }, []);

  // Handle login callback
  useEffect(() => {
    if (location.pathname.includes('/callback')) {
      // Okta SDK handles the callback automatically
      // The authStateManager will be updated and trigger re-authentication
    }

    if (location.pathname === '/login') {
      const searchParams = new URLSearchParams(location.search);
      const error = searchParams.get('error');
      const reason = searchParams.get('reason');
      let msg = '';
      if (error || reason) {
        msg = `${reason || error || ''}`.trim();
        setAuthError(msg);

        // Clean up query params from URL
        navigate(location.pathname, { replace: true });
      }
    }
  }, [location, navigate]);

  if (initializationLoading) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <LinearLoader />
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        initializationLoading: initializationLoading,
        authError: authError,
      }}>
      {children}
    </AuthContext.Provider>
  );
};

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AuthProvider;
