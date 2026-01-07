/**
 * MPA (Multi-Page Application) Session-Based Authentication
 * 
 * This module handles session-based authentication where:
 * - Backend manages authentication and session creation
 * - HTTPOnly cookies store session information
 * - Frontend sends requests with automatic cookie attachment
 * - No token handling needed on frontend
 *
 * @version 2.0.0 - MPA Architecture
 */

/**
 * Check if user has a valid session by calling backend
 * @returns {Promise<Object>} User object if session exists, null otherwise
 */
export const checkSessionValidity = async () => {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/me`, {
      method: 'GET',
      credentials: 'include', // Important: Include cookies
    });

    if (response.status === 200) {
      return await response.json();
    } else if (response.status === 401) {
      return null; // Session expired
    }
  } catch (error) {
    console.error('Failed to check session validity:', error);
    return null;
  }
};

/**
 * Initialize application - check if user has valid session
 * @returns {Promise<Object|null>} User object if authenticated, null otherwise
 */
export const initializeApp = async () => {
  try {
    const user = await checkSessionValidity();
    return user;
  } catch (error) {
    console.error('App initialization failed:', error);
    return null;
  }
};

/**
 * Get the current authenticated user info
 * @returns {Promise<Object>} User object
 */
export const getCurrentUser = async () => {
  try {
    const user = await checkSessionValidity();
    if (!user) {
      throw new Error('User not authenticated');
    }
    return user;
  } catch (error) {
    console.error('Failed to get current user:', error);
    throw error;
  }
};

/**
 * Redirect to backend login endpoint
 * Backend will handle OAuth/SSO authentication and set HTTPOnly cookie
 */
export const initiateLogin = () => {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (!apiBaseUrl) {
    console.error('VITE_API_BASE_URL not configured');
    return;
  }
  
  // Redirect to backend login endpoint
  // Backend will handle SSO authentication and return HTTPOnly cookie
  window.location.href = `${apiBaseUrl}/auth/login`;
};

/**
 * Redirect to backend logout endpoint
 * Backend will clear session and HTTPOnly cookie
 */
export const logout = async () => {
  try {
    await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include', // Include cookies
    });
  } catch (error) {
    console.error('Logout failed:', error);
  } finally {
    // Redirect to login page
    window.location.href = `${import.meta.env.VITE_BASE_PATH || ''}/login`;
    }

  } 
  

/**
 * Login to Okta
 * @returns {Promise<void>}
 */
export const oktaLogin = async () => {
  try {
    if (!oktaAuth) {
      throw new Error('Okta Auth not initialized');
    }

    await oktaAuth.signInWithRedirect();
  } catch (error) {
    console.error('Okta login failed:', error);
    throw error;
  }
};

/**
 * Logout from Okta
 * @returns {Promise<void>}
 */
export const oktaLogout = async () => {
  try {
    if (!oktaAuth) {
      throw new Error('Okta Auth not initialized');
    }

    // Disconnect socket before logout
    disconnectSocket();

    await oktaAuth.signOut();
  } catch (error) {
    console.error('Okta logout failed:', error);
    throw error;
  }
};

/**
 * Manual token refresh with socket reconnection
 * @returns {Promise<boolean>} Whether token was refreshed
 */


/**
 * Legacy function names maintained for backward compatibility
 * These now delegate to session-based functions
 */
export const initializeOkta = initializeApp;
export const getOktaUser = getCurrentUser;
export const getOktaAuthState = checkSessionValidity;
export const getOktaAccessToken = async () => {
  // In MPA mode, no access token needed on frontend
  // Backend handles authentication via HTTPOnly cookies
  return null;
};
//  export const oktaLogout = logout;
//  export const oktaLogin = initiateLogin;

export default {
  initializeApp,
  getCurrentUser,
  checkSessionValidity,
  initiateLogin,
  logout,
  // Legacy names
  initializeOkta,
  getOktaUser,
  getOktaAuthState,
  getOktaAccessToken,
  oktaLogout,
  oktaLogin,
}
