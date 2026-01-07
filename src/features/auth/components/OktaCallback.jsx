import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LinearLoader from '../../../components/LinearLoader';
import { getOktaAuthState } from '../../../utils/okta';

/**
 * OktaCallback component
 * Handles the OAuth 2.0 callback from Okta
 * The Okta SDK automatically processes the authorization code from the URL
 * and stores tokens in localStorage
 */
const OktaCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log('OktaCallback: Starting callback processing...');
        
        // Wait for Okta SDK to process the callback
        // The SDK extracts the authorization code from the URL and exchanges it for tokens
        // We need to poll the auth state until it's actually authenticated
        
        let attempts = 0;
        const maxAttempts = 30; // Try for up to 3 seconds (30 * 100ms)
        
        while (attempts < maxAttempts) {
          const authState = await getOktaAuthState();
         
          
          console.log(`OktaCallback: Auth state check attempt ${attempts + 1}:`, authState?.isAuthenticated);
          
          if (authState?.isAuthenticated) {
            console.log('OktaCallback: Authentication confirmed, navigating to dashboard');
            // Auth state is confirmed, now we can navigate
            navigate('/dashboard', { replace: true });
            return;
          }
          
          // Wait 100ms before checking again
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        // If we reach here, authentication didn't complete in time
        console.error('OktaCallback: Callback processing timeout - authentication did not complete');
        navigate('/login', { replace: true });
      } catch (error) {
        console.error('OktaCallback: Error processing Okta callback:', error);
        navigate('/login', { replace: true });
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <LinearLoader />
    </div>
  );
};

export default OktaCallback;
