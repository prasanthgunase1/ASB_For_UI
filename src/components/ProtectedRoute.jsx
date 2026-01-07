import { useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import LinearLoader from './LinearLoader';
import { Box } from '@mui/material';
import backgroundImage from '../assets/bg-image.png';
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { setLoading } from '../features/auth/authSlice';
import { checkSessionValidity } from '../utils/okta';

/**
 * ProtectedRoute component for MPA authentication
 * 
 * In MPA mode:
 * - Backend handles authentication via HTTPOnly cookies
 * - Frontend checks if user has valid session
 * - If session expires (401 response), user is redirected to login
 * - AuthProvider already ensures user is authenticated before reaching protected routes
 */
const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { loading } = useSelector((state) => state.auth);
  const [isAuthenticated, setIsAuthenticated] = useState(null);

  useEffect(() => {
    const verifySession = async () => {
      try {
        const user = await checkSessionValidity();
        if (user) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          navigate(`/login`, { replace: true });
        }
      } catch (error) {
        console.error('Error checking session:', error);
        setIsAuthenticated(false);
        navigate(`/login`, { replace: true });
      }
    };

    verifySession();
  }, [navigate]);

  useEffect(() => {
    if (isAuthenticated === false) {
      navigate(`/login`, { replace: true });
    }
    if (isAuthenticated && loading) {
      dispatch(setLoading(false));
    }
  }, [isAuthenticated, loading, navigate, dispatch]);

  // Still checking auth state
  if (isAuthenticated === null) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: 'cover',
        }}>
        <LinearLoader />
      </Box>
    );
  }

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: 'cover',
        }}>
        <LinearLoader />
      </Box>
    );
  }

  if (isAuthenticated) {
    return children;
  }
};

ProtectedRoute.propTypes = {
  children: PropTypes.node,
};


export default ProtectedRoute;
