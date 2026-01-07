import { useState, useCallback, useEffect } from 'react';
import { Grid2 as Grid, Typography, Container } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import PreviousQueries from '../../components/PreviousQueries/PreviousQueries';
import ChatIcon from '../../assets/GroupIcon.png';
import classes from './Home.module.scss';
import { setShowHomeScreen, setActiveConversation, updateConvesationId } from '../../redux/store/conversationSlice';
import ChatInput from '../../components/ChatInput/ChatInput';
import { selectUser } from '../../features/auth/authSlice';

function Home() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector(selectUser) || {};
  const [selectedQuery, setSelectedQuery] = useState('');

  useEffect(() => {
    dispatch(setShowHomeScreen(true));
    dispatch(setActiveConversation(false));
    dispatch(updateConvesationId('new'));
  }, [dispatch]);

  const handleSelectQuery = (query) => {
    setSelectedQuery(query);
  };

  const handleSuccessfulInteraction = useCallback(
    (conversationId) => {
      if (conversationId && conversationId !== 'new') {
        // Update Redux state to indicate we now have an active conversation
        dispatch(setShowHomeScreen(false));
        dispatch(setActiveConversation(true));

        // Navigate to the conversation route
        navigate(`/conversations/${conversationId}`);
      }
    },
    [navigate, dispatch],
  );

  return (
    <Container maxWidth="lg" className={classes.container}>
      <Grid container direction="column" alignItems="center" spacing={1} className={classes.homeContainer}>
        <Grid item xs={12} className={classes.iconContainer}>
          <img src={ChatIcon} className={classes.chatIcon} alt="Chat Icon" />
        </Grid>
        <Grid item xs={12} className={classes.textContainer}>
          <Typography variant="h4" className={classes.greetingText}>
            How can I help you
          </Typography>
          <Typography variant="body1" className={classes.descriptionText}>
            Ask me anything about our services or products.
          </Typography>
        </Grid>
        <Grid item xs={12} className={classes.queriesContainer}>
          <PreviousQueries queries={[]} onSelectQuery={handleSelectQuery} />
        </Grid>
        <Grid item xs={12} className={classes.chatInputContainer}>
          <div className={classes.chatInputWrapper}>
            <ChatInput
              convoId="new"
              userId={user?.email || user?.sub}
              selectedQuery={selectedQuery}
              onSuccessfulInteraction={handleSuccessfulInteraction}
              size={14}
            />
          </div>
        </Grid>
      </Grid>
    </Container>
  );
}

export default Home;
