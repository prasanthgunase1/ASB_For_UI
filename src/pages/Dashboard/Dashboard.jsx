import { useState, useEffect, useMemo, useCallback } from 'react';
import { Container, Typography, IconButton, Skeleton, Grid2 as Grid } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
// ✅ UPDATED: Import selectSelectedIndustry to read from global state
import { selectUser, setUser, selectIsAdmin, selectSelectedIndustry } from '../../features/auth/authSlice';
import { useGetUserDataQuery } from '../../services/conversationApi';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import GroupIcon from '@mui/icons-material/Group';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import PropTypes from 'prop-types';
import TALogo from '../../assets/TA-logo.png';
import { resetQueueState } from '../../redux/store/queueSlice';
import { clearDashboardData, resetDashboard } from '../../redux/store/dashboardSlice';
import { resetConversationData } from '../../redux/store/conversationSlice';
import { clearPageConversation } from '../../features/auth/authSlice';
// Import assets
import TAGroup from '../../assets/DashboardPage1/TA-Group.png';
import BankingIcon from '../../assets/DashboardPage1/IndustryIcons/bank@2x.png';
import ComplianceIcon from '../../assets/DashboardPage1/IndustryIcons/compliance-clipboard.png';
import HealthcareIcon from '../../assets/DashboardPage1/IndustryIcons/pills@2x.png';
import GenericIcon1 from '../../assets/DashboardPage1/IndustryIcons/Group 12@2x.png';
import GenericIcon2 from '../../assets/DashboardPage1/IndustryIcons/Group 20565@2x.png';
import Persona1 from '../../assets/DashboardPage1/IndustryIcons/PersonaIcons/Persona1.png';
import Persona2 from '../../assets/DashboardPage1/IndustryIcons/PersonaIcons/Persona2.png';
import Persona3 from '../../assets/DashboardPage1/IndustryIcons/PersonaIcons/Persona3.png';

import AdminPersonaLogo from '../../assets/Admin Persona_Logo.svg';
import RelationshipManagerLogo from '../../assets/RelationshipManager_Logo.svg';
import RightArrow from '../../assets/Right_Arrow.svg';
import classes from './Dashboard.module.scss';
import AssociatedBankLogo from '../../assets/Sidepanel/AssociatedBankLogo.svg';

const industryIcons = {
  Banking: BankingIcon,
  Compliance: ComplianceIcon,
  Healthcare: HealthcareIcon,
  Industry1: GenericIcon1,
  Industry2: GenericIcon2,
};

// const BANKING_INDUSTRY_DEFAULT = {
//   id: crypto.randomUUID(),
//   name: 'Banking',
//   personas: [
//     {
//       id: crypto.randomUUID(),
//       name: 'Banking Persona 1',
//     },

//     {
//       id: crypto.randomUUID(),
//       name: 'Banking Persona 2',
//     },
//     {
//       id: crypto.randomUUID(),
//       name: 'Banking Persona 3',
//     },
//     {
//       id: crypto.randomUUID(),
//       name: 'Banking Persona 4',
//     },
//   ],
//   clientId: crypto.randomUUID(),
// };

const BANKING_INDUSTRY_DEFAULT = {
  id: crypto.randomUUID(),
  name: 'Banking',
  personas: [
    { id: crypto.randomUUID(), name: 'Relationship Manager' },
    { id: crypto.randomUUID(), name: 'Admin persona' },
  ],
  clientId: crypto.randomUUID(),
};

const BANKING_INDUSTRY_XD =
  'https://www.figma.com/proto/j5zds0ERNMjed2qT4136CB/ASB--Tiger-?node-id=1-3362&t=ga9Xtq6t1dEdkEzb-1&scaling=contain&content-scaling=fixed&page-id=0%3A1&starting-point-node-id=1%3A3362';

const RETAIL_INDUSTRY_XD = 'https://deepthought.tigeranalyticstest.in/retailsenseai/dashboard';

const personaIcons = [RelationshipManagerLogo, AdminPersonaLogo, RightArrow];

const CardsSkeleton = ({ isPersonaView = false }) => (
  <div className={isPersonaView ? classes.personaGrid : classes.cardsContainer}>
    {[...Array(isPersonaView ? 3 : 6)].map((_, index) => (
      <div key={index} className={isPersonaView ? classes.personaCard : classes.industryCard}>
        {isPersonaView ? (
          <>
            <Skeleton variant="text" width="40px" height={40} className={classes.cardNumber} />
            <div className={classes.iconWrapper}>
              <Skeleton variant="circular" width={80} height={80} />
            </div>
            <div className={classes.textContent}>
              <Skeleton variant="text" width="80%" height={30} />
            </div>
            <Skeleton variant="circular" width={40} height={40} className={classes.arrowButton} />
          </>
        ) : (
          <>
            <div className={classes.industryIcon}>
              <Skeleton variant="circular" width={52} height={52} />
            </div>
            <div className={classes.industryInfo}>
              <Skeleton variant="text" width={140} height={24} />
              <div className={classes.personaCount}>
                <Skeleton variant="text" width={100} height={20} />
              </div>
            </div>
          </>
        )}
      </div>
    ))}
  </div>
);

CardsSkeleton.propTypes = {
  isPersonaView: PropTypes.bool,
};

function Dashboard() {
  const [selectedIndustry, setSelectedIndustry] = useState(BANKING_INDUSTRY_DEFAULT);

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const userFromState = useSelector(selectUser);
  const isAdmin = useSelector(selectIsAdmin);
  // ✅ ADDED: Read the selected industry name from the global Redux state
  const globallySelectedIndustryName = useSelector(selectSelectedIndustry);

  // Get authenticated user info
  const user = useSelector(selectUser);

  // Fetch user data with proper skip condition
  const {
    data: userPersonasData,
    isLoading: isLoadingPersonas,
    error: personasError,
    refetch: refetchUserData,
  } = useGetUserDataQuery(user?.email, {
    skip: !user?.email,
  });

  // Clear queue state when user data changes
  useEffect(() => {
    // Clear all states on mount
    dispatch(clearPageConversation('home'));
    dispatch(clearPageConversation('insight'));
    dispatch(resetConversationData());
    dispatch(clearDashboardData());
    dispatch(resetQueueState());
    dispatch(resetDashboard());
    // Cleanup on unmount
    return () => {
      dispatch(clearPageConversation('home'));
      dispatch(clearPageConversation('insight'));
      dispatch(resetConversationData());
      dispatch(clearDashboardData());
      dispatch(resetQueueState());
      dispatch(resetDashboard());
    };
  }, [dispatch]);

  // Transform API data
  const transformedData = useMemo(() => {
    if (!userPersonasData?.length) return null;

    return {
      userId: userPersonasData[0]?.user_id,
      industries: Object.values(
        userPersonasData.reduce(
          (acc, item) => {
            if (!acc[item.industry_id]) {
              acc[item.industry_id] = {
                id: item.industry_id,
                name: item.industry_name,
                personas: [],
                clientId: item.client_id,
              };
            }

            if (!acc[item.industry_id].personas.some((p) => p.id === item.persona_id)) {
              acc[item.industry_id].personas.push({
                id: item.persona_id,
                name: item.persona,
                data_domain: item.data_domain,
              });
            }
            return acc;
          },
          //should be updated to handle banking industry default
          { [`banking-industry`]: BANKING_INDUSTRY_DEFAULT },
        ),
      ),
    };
  }, [userPersonasData]);

  // ✅ ADDED: Effect to sync global state to local state
  // This ensures that if the user navigates here with an industry already
  // selected in Redux, the component shows the persona selection view.
  useEffect(() => {
    if (globallySelectedIndustryName && transformedData?.industries) {
      const industryObject = transformedData.industries.find((ind) => ind.name === globallySelectedIndustryName);
      if (industryObject) {
        setSelectedIndustry(industryObject);
      }
    }
  }, [globallySelectedIndustryName, transformedData]);

  // Handle auth state changes and data updates
  useEffect(() => {
    const handleAuthChange = async () => {
      // User object from Redux auth slice already contains authenticated status and roles
      if (user?.email && transformedData) {
        // Skip update if we already have the same data
        if (
          userFromState?.userId === transformedData.userId &&
          userFromState?.email === user?.email
        ) {
          return;
        }

        // Roles are already in the user object from Redux (set by AuthProvider)
        const roles = user?.roles || [];

        // Prepare the updated user data
        const updatedUserData = {
          // Basic user info from Okta (already in Redux user object)
          ...user,

          // Add roles if not already present
          roles: roles,

          // API data
          userId: transformedData.userId,
          industries: transformedData.industries,

          // Auth state - user object existence indicates authenticated status
          authenticated: !!user,
        };

        // If userFromState exists, preserve its additional properties
        if (userFromState) {
          // Preserve selected industry and role unless explicitly changing them
          if (userFromState.selectedIndustry && !updatedUserData.selectedIndustry) {
            updatedUserData.selectedIndustry = userFromState.selectedIndustry;
          }

          if (userFromState.selectedRole && !updatedUserData.selectedRole) {
            updatedUserData.selectedRole = userFromState.selectedRole;
          }
        }

        // Dispatch the updated user data
        dispatch(setUser(updatedUserData));
      }
    };

    handleAuthChange();
  }, [dispatch, user, transformedData, userFromState]);

  // Refetch data if auth state changes
  useEffect(() => {
    if (user?.email) {
      refetchUserData();
    }
  }, [user?.email, refetchUserData]);

  const handleIndustrySelect = useCallback((industry) => {
    // should be update once the banking industry is added to the API
    if (industry?.name === 'Banking') {
      //open this link in  new tab : BANKING_INDUSTRY_XD
      // window.open(BANKING_INDUSTRY_XD, '_blank');
      window.open(BANKING_INDUSTRY_XD, '_blank', 'noopener,noreferrer');
      return;
    }
    if (industry?.name === 'Retail') {
      //open this link in  new tab : BANKING_INDUSTRY_XD
      // window.open(RETAIL_INDUSTRY_XD, '_blank');
      window.open(BANKING_INDUSTRY_XD, '_blank', 'noopener,noreferrer');
      return;
    }
    setSelectedIndustry(industry);
  }, []);

const handlePersonaSelect = useCallback(
  (persona) => {
    if (!userFromState || !selectedIndustry) return;

    // Clear old states
    dispatch(clearPageConversation('home'));
    dispatch(clearPageConversation('insight'));
    dispatch(resetConversationData());
    dispatch(clearDashboardData());
    dispatch(resetQueueState());

    // ✅ Normalize name and detect admin persona reliably
    const personaName = persona.name?.trim().toLowerCase();
    const isAdminPersona = personaName.includes('admin');
    const role = isAdminPersona ? 'ADMINISTRATOR' : persona.name;

    // ✅ Update Redux user
    dispatch(
      setUser({
        ...userFromState,
        selectedIndustry: selectedIndustry?.name || selectedIndustry,
        selectedRole: role,
      }),
    );

    // ✅ Navigate to correct UI
    if (isAdminPersona) {
      navigate('/adminLanding');
    } else {
      navigate('/landing');
    }
  },
  [dispatch, userFromState, navigate, selectedIndustry],
);


  // Handle admin card selection
  const handleAdminSelect = useCallback(() => {
    if (!userFromState) return;
    // Clear previous states before setting admin mode
    dispatch(clearPageConversation('home'));
    dispatch(clearPageConversation('insight'));
    dispatch(resetConversationData());
    dispatch(clearDashboardData());
    dispatch(resetQueueState());

    dispatch(
      setUser({
        ...userFromState,
        selectedIndustry: selectedIndustry,
        selectedRole: 'ADMINISTRATOR',
      }),
    );
    navigate('/adminLanding');
  }, [dispatch, userFromState, navigate, selectedIndustry]);

  const handleBack = useCallback(() => {
    dispatch(clearPageConversation('home'));
    dispatch(clearPageConversation('insight'));
    dispatch(resetConversationData());
    dispatch(clearDashboardData());
    dispatch(resetQueueState());
    setSelectedIndustry(null);
  }, [dispatch]);
  // Guard for unauthenticated state
  if (!user) {
    return null;
  }

  return (
    <Container maxWidth={false} className={classes.container}>
      <Grid container className={classes.mainContent}>
        <Grid item xs={12} md={5} className={classes.leftPanel}>
          <img src={AssociatedBankLogo} alt="AssociatedBankLogo" className={classes.logo} />
          <div className={classes.welcomeContent}>
            <Typography variant="h3" className={classes.title}>
              Get Started with <br /> Persona insights
            </Typography>
            <div className={classes.divider} />
            <Typography variant="h6" className={classes.description}>
              Persona insights provides you with tailored details for each persona across different practices
            </Typography>
          </div>
          <div className={classes.groupImageContainer}>
            <img src={TAGroup} alt="Tiger Analytics Team" className={classes.groupImage} />
          </div>
        </Grid>

        <Grid item xs={12} md={7} className={classes.rightPanel}>
          <div className={classes.cardsWrapper}>
            {/* {selectedIndustry && (
              <div className={classes.backSection}>
                <IconButton onClick={handleBack} className={classes.backButton}>
                  <ArrowBackIcon />
                </IconButton>
                <Typography className={classes.backText}>Back to Industries</Typography>
              </div>
            )} */}
            {/* 
            <Typography variant="h5" className={classes.sectionTitle}>
              {selectedIndustry ? `${selectedIndustry.name} Personas` : 'Choose Industry'}
            </Typography> */}

            {isLoadingPersonas ? (
              <CardsSkeleton isPersonaView={!!selectedIndustry} />
            ) : personasError ? (
              <div className={classes.errorContainer}>
                <Typography variant="h6" className={classes.errorMessage}>
                  Error loading data. Please try again later.
                </Typography>
              </div>
            ) : !transformedData?.industries?.length ? (
              <Typography variant="h6" className={classes.noDataMessage}>
                No data assigned. Please contact your administrator.
              </Typography>
            ) : (
              <>
                {selectedIndustry ? (
                  <div className={`${classes.personaGrid} ${isAdmin ? classes.hasAdmin : ''}`}>
                    {/* Regular personas rendered after the admin card */}
                    <div className={classes.personaGrid}>
                      {selectedIndustry.personas.map((persona, index) => (
                        <div
                          key={persona.id}
                          className={classes.personaCard}
                          onClick={() => handlePersonaSelect(persona)}
                          role="button"
                          tabIndex={0}>
                          <Typography className={classes.personaNumber}>
                            {String(index + 1).padStart(2, '0')}
                          </Typography>
                          <div className={classes.leftSection}>
                            <img
                              src={personaIcons[index] || personaIcons[0]}
                              alt={persona.name}
                              className={classes.personaIcon}
                            />
                            <Typography className={classes.personaName}>{persona.name}</Typography>
                            <img src={RightArrow} className={classes.RightArrow} alt="RightArrow" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className={classes.cardsContainer}>
                    {/* Industries view - unchanged */}
                    {/* {transformedData.industries.map((industry) => (
                      <div
                        key={industry.id}
                        className={classes.industryCard}
                        onClick={() => handleIndustrySelect(industry)}
                        role="button"
                        tabIndex={0}>
                        <div className={classes.industryIcon}>
                          <img src={industryIcons[industry.name] || industryIcons['Industry1']} alt={industry.name} />
                        </div>
                        <div className={classes.industryInfo}>
                          <Typography className={classes.industryName}>{industry.name}</Typography>
                          <div className={classes.personaCount}>
                            <GroupIcon className={classes.countIcon} />
                            <Typography>
                              {industry.personas.length} {industry.personas.length === 1 ? 'Persona' : 'Personas'}
                            </Typography>
                          </div>
                        </div>
                      </div>
                    ))} */}
                  </div>
                )}
              </>
            )}
          </div>
        </Grid>
      </Grid>
    </Container>
  );
}

export default Dashboard;
