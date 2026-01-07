import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

/**
 * MPA API Configuration
 * 
 * Changes from SPA:
 * - Removed Authorization header with tokens
 * - Enable withCredentials to send HTTPOnly cookies automatically
 * - Simplified error handling - no token refresh needed
 * - Backend handles all authentication via session
 */

const baseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  credentials: 'include', // Important: Include HTTPOnly cookies with every request
  prepareHeaders: (headers) => {
    // In MPA mode, no token headers needed
    // HTTPOnly cookies are sent automatically via credentials: 'include'
    return headers;
  },
});

export const api = createApi({
  reducerPath: 'api',
  baseQuery: async (args, api, extraOptions = {}) => {
    try {
      const result = await baseQuery(args, api, extraOptions);
      
      // Check for 401 Unauthorized
      if (result?.error?.status === 401) {
        // Session expired - redirect to login
        console.warn('Session expired, redirecting to login');
        window.location.href = `${import.meta.env.VITE_BASE_PATH || ''}/login`;
        return result;
      }
      
      return result;
    } catch (err) {
      console.error('API error:', err);
      throw err;
    }
  },
  endpoints: () => ({}),
});

export const { useLazyQuery, useQuery, useMutation } = api;
