import { useCallback, useEffect } from 'react';
import SideBar from '../../components/Sidebar/Sidebar';
import classes from './Conversations.module.scss';
import { Divider, Typography } from '@mui/material';
import ConversationScreen from '../../components/ConversationScreen/ConversationScreen';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { getUiVisibility, toggleSidebarContent, updateConvesationId } from '../../redux/store/conversationSlice';
import ChatInput from '../../components/ChatInput/ChatInput';
import { selectUser } from '../../features/auth/authSlice';
import { joinConversation, leaveConversation } from '../../utils/socket/socketActions';
import BusinessContentContainer from '../../components/BusinessContentContainer/BusinessContentContainer';

/** changes made
v1.1.0 :
  =>moved the toggleSidebarContent to redux store
  =>introduced the business content panel to show the business context in a separate panel
  =>removed the useEffect logic based on stored conversation id as it is redundant and can be achieved using the useParams hook
  =>added the join and leave conversation functionality on changing the conversations
**/

const Conversations = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const pathParams = useParams();
  const { conversationId } = pathParams;
  const user = useSelector(selectUser) || {};

  // Track UI state
  const uiState = useSelector(getUiVisibility);

  // Handle conversation ID changes
  useEffect(() => {
    // If we navigate to a specific conversation, update Redux
    if (conversationId && conversationId !== 'new') {
      dispatch(updateConvesationId(conversationId));
      //join new conversation
      joinConversation(conversationId, dispatch);
    }
    return () => {
      //leave the previous conversation room
      if (conversationId && conversationId !== 'new') {
        leaveConversation(dispatch);
      }
    };
  }, [conversationId, dispatch]);

  // Handle successful chat interactions
  const handleSuccessfulInteraction = useCallback(
    (convId) => {
      // Navigate to the conversation if needed
      if (convId && (!conversationId || conversationId === 'new')) {
        navigate(`/conversations/${convId}`);
      }
    },
    [conversationId, navigate],
  );

  return (
    <div className={classes.pageContainer}>
      <div className={classes.contentWrapper}>
        <div className={`${classes.sidebarContainer} ${!uiState.sidebarContentVisible ? classes.collapsed : ''}`}>
          {/* <SideBar
            onChatItemClick={(chatId) => navigate(`/conversations/${chatId}`)}
            toggleSidebarContent={toggleSidebarContent}
            sidebarContentVisible={uiState.sidebarContentVisible}
          /> */}
        </div>

        <div className={classes.conversationsContainer}>
          <div className={classes.conversationHeader}>
            <Typography variant="subtitle2" className={classes.headerTitle}>
              {conversationId === 'new' ? 'New Conversation' : 'Conversations'}
            </Typography>
          </div>
          <Divider />
          <div className={classes.conversationsScreenContainer}>
            <ConversationScreen id={conversationId} />
          </div>
          <div className={classes.chatInputContainer}>
            <ChatInput
              convoId={conversationId}
              userId={user?.email || user?.sub}
              onSuccessfulInteraction={handleSuccessfulInteraction}
              size={11}
            />
          </div>
        </div>
        {/* v1.1.0 Introduced the business content panel to show the business context in a separate panel */}
        <div className={`${classes.businessContentContainer} ${uiState.businessContentVisible ? classes.open : ''}`}>
          <BusinessContentContainer />
        </div>
      </div>
    </div>
  );
};

export default Conversations;
