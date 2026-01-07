import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AuthProvider from './features/auth/AuthProvider';
import { lazy, Suspense } from 'react';
import LinearLoader from './components/LinearLoader';

// Lazy-loaded components
const AppLayout = lazy(() => import('./layouts/AppLayout'));
const LoginPage = lazy(() => import('./features/auth/components/LoginPage'));
const OktaCallback = lazy(() => import('./features/auth/components/OktaCallback'));
const Home = lazy(() => import('./pages/Home/Home'));
const Conversations = lazy(() => import('./pages/Conversations/Conversations'));
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'));
const Landing = lazy(() => import('./pages/Landing/Landing'));
const AdminLanding = lazy(() => import('./pages/Landing/AdminLanding'));

/**
 * Routes configuration for MPA authentication
 * 
 * Changes from SPA:
 * - Removed /callback route (backend handles OAuth callback)
 * - No token-based auth required
 * - Session validated at AuthProvider level
 */
export const AppRoutes = () => {
  return (
    <Suspense fallback={<LinearLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Dashboard route outside of AppLayout */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/landing"
          element={
            <ProtectedRoute>
              <Landing />
            </ProtectedRoute>
          }
        />
        <Route
          path="/adminLanding"
          element={
            <ProtectedRoute>
              <AdminLanding />
            </ProtectedRoute>
          }
        />

        {/* Other routes with AppLayout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }>
          <Route path="home" element={<Home />} />
          <Route path="conversations/:conversationId" element={<Conversations />} />
          {/* Redirect root to dashboard */}
          <Route index element={<Navigate to="/dashboard" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
};

export const AppRouter = () => (
  <BrowserRouter basename={import.meta.env.VITE_BASE_PATH}>
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  </BrowserRouter>
);

export default AppRouter;
