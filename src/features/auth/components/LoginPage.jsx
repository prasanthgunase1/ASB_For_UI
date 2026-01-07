import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Box, Button, Grid2 as Grid, Typography } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import LeftIcon from '../../../assets/LoginLeftGroup.png';
import TALogo from '../../../assets/TA-logo.png';
import LinearLoader from '../../../components/LinearLoader';
import { setLoading } from '../authSlice';
import classes from './LoginPage.module.scss';
import { useEffect } from 'react';
import { checkSessionValidity, initiateLogin } from '../../../utils/okta';
import { useAuthContext } from '../AuthContext';

/**
 * LoginPage component for MPA authentication
 * 
 * In MPA mode:
 * - User clicks "Sign in with SSO"
 * - Frontend redirects to backend login endpoint
 * - Backend handles all OAuth/SSO authentication
 * - Backend sets HTTPOnly cookie and redirects back to app
 */
const LoginPage = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const { authError } = useAuthContext();

  const { loading } = useSelector((state) => state.auth);

  useEffect(() => {
    const checkSessionAndRedirect = async () => {
      try {
        const user = await checkSessionValidity();
        if (user) {
          const redirect = searchParams.get('redirect');
          // Change default redirect to dashboard
          navigate(redirect ? decodeURIComponent(redirect) : '/dashboard', { replace: true });
        }
      } catch (error) {
        console.error('Error checking session:', error);
      }
    };

    checkSessionAndRedirect();
  }, [navigate, searchParams]);

  const handleLogin = async () => {
    dispatch(setLoading(true));
    try {
      // Redirect to backend login endpoint
      // Backend will handle OAuth/SSO authentication
      initiateLogin();
    } catch (error) {
      console.error('Login failed:', error);
      dispatch(setLoading(false));
    }
  };

  return (
    <>
      <Grid container size={12} spacing={0} className={classes.loginBody}>
        <Grid container size={6} spacing={2} className={classes.loginLeft}>
          <Grid size={12}>
            <img src={TALogo} alt="TA Logo" />
          </Grid>
          <Grid size={12}>
            <Typography
              style={{
                fontWeight: 'bolder',
                width: 'fit-content',
                borderBottom: '3px solid #F7901D',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                fontFamily: 'Articulate AF, sans-serif',
                fontSize: 'clamp(0.5rem, 1vw, 1rem)',
                color: '#312E2D',
              }}>
              DeepThought Platform
            </Typography>
            <Typography
              style={{
                fontFamily: 'Articulate AF, sans-serif',
                fontSize: 'clamp(0.5rem, 1vw, 1rem)',
                color: '#312E2D',
              }}>
              Your Tiger AI Peer
            </Typography>
          </Grid>
          <Grid size={12}>
            <img src={LeftIcon} alt="Left Icon" />
          </Grid>
        </Grid>
        <Grid container size={6} spacing={0} className={classes.loginRight}>
          <Grid size={12} className={classes.buttonContainer}>
            {authError ? (
              <Typography style={{ color: 'red', fontWeight: 'bold' }}>Access Denied! {authError}</Typography>
            ) : loading ? (
              <LinearLoader />
            ) : (
              <Button
                className={classes.loginButton}
                endIcon={<ChevronRightIcon className={classes.sendIcon} />}
                onClick={handleLogin}>
                Sign in with SSO
              </Button>
            )}
          </Grid>
          <Box className={classes.footerContainer}>
            <Typography className={classes.footerText}>
              Copyright © 2025 Tiger Analytics | All Rights Reserved
            </Typography>
          </Box>
        </Grid>
      </Grid>
    </>
  );
};

export default LoginPage;
