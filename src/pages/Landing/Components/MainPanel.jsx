import { Typography, IconButton, Box, Button, Select, MenuItem, Divider, Tooltip, useMediaQuery } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SearchIcon from '@mui/icons-material/Search';
import { useSelector } from 'react-redux';
import { selectCurrentPage, selectSelectedIndustry, selectUser } from '../../../features/auth/authSlice';
import { selectLastRefreshed, selectHomeDashboardLoading, selectKpiDashboardData, selectRevenueGraphDetails, selectDepositLoanDetails, selectLoanOutstandingDetails, selectEngagementDetails, selectTotalProfitandLossRelationship, selectVolumeOfUsageDetails, selectrevenueAndProfitAtProductLevelDetails, selectInsightsDatalDetails, selectInsightsScreenData,  } from '../../../redux/store/dashboardSlice';
import SummarizeIcon from '@mui/icons-material/Summarize';
import classes from './MainPanel.module.scss';
import HomeDashboard from '../../../components/Dashboards/HomeDashboard';
import InsightsDashboard from '../../../components/Dashboards/InsightsDashboard';
import ConversationDashboard from '../../../components/Dashboards/ConversationDashboard';
import PropTypes from 'prop-types';
import { useEffect, useMemo, useRef, useState } from 'react';
import CalendarIcon from '../../../assets/DashboardPage1/Dashboard/CalanderIcon.svg';
import DashboardName from '../../../assets/DashboardPage1/Dashboard/DashboardName_Icon.svg';
import DashNotification from '../../../assets/DashboardPage1/Dashboard/Dashboard_Notification_Icon.svg';
import KPIDashboard from '../../../components/Dashboards/KPIDashboard';
import { filterClientData, filterRevenueByClient, filterDepositLoanByClient, filterAccountDetailsByClient,filterTotalProfitAndLossRelationshipData, filterVolumeOfUsageByClient } from '../../../utils/fileUtils';
function MainPanel({ dashboardsReady, dashboardsLoading, executingQueries, currentProcessingInsight }) {
  const clientOptions = [
    { id: 1, name: 'Client Name 1' },
    { id: 2, name: 'Client Name 2' },
    { id: 3, name: 'Client Name 3' },
    { id: 4, name: 'Client Name 4' },
    { id: 5, name: 'Client Name 5' },
  ];
  const currentPage = useSelector(selectCurrentPage) || 'dashboard';
  const lastRefreshed = useSelector(selectLastRefreshed);
  const isHomeLoading = useSelector(selectHomeDashboardLoading);
  const user = useSelector(selectUser);
  const selectedIndustry = useSelector(selectSelectedIndustry);
   const HomeKpiDetails = useSelector(selectKpiDashboardData);
   const { kpis = [], score = [] } = HomeKpiDetails || {};
  const revenueData = useSelector(selectRevenueGraphDetails);
  const depostiLoanData = useSelector(selectDepositLoanDetails);
  const loanOutstandingTrendsData = useSelector(selectLoanOutstandingDetails);
  const toalProfiAndLossRelationshipData = useSelector(selectTotalProfitandLossRelationship);
  const accountDetailsInfo = useSelector(selectEngagementDetails);
  const voumeOfUsageData = useSelector(selectVolumeOfUsageDetails);
  const revenueProfitProductLevelData = useSelector(selectrevenueAndProfitAtProductLevelDetails);
  // const insightsData = useSelector(selectInsightsDatalDetails);
  const insightsScreenData = useSelector(selectInsightsScreenData);

  const homeDashboardRef = useRef(null);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  // 🟢 Added state for Client, Notification, and ref
  const [client, setClient] = useState(clientOptions[0].id);
  const [clientSearchInput, setClientSearchInput] = useState('');
  const [debouncedSearchInput, setDebouncedSearchInput] = useState('');
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const notificationAnchorRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const isSmallScreen = useMediaQuery('(max-width:900px)');

  // Debounce the search input
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearchInput(clientSearchInput);
    }, 300); // 300ms debounce delay

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [clientSearchInput]);

    useEffect(()=> {
       setClient(clientOptions[0].id);
     }, [currentPage]);
 
  const filteredKpis = useMemo(() => {
  return filterClientData(HomeKpiDetails, client);
}, [HomeKpiDetails, client]);

const filteredAccountDetails = useMemo(() => {
  return filterAccountDetailsByClient(accountDetailsInfo, client);
}, [accountDetailsInfo, client]);

  const revenueForClient = useMemo(() => {
  return filterRevenueByClient(revenueData, client);
}, [revenueData, client]);

  const filterdDepositLoans = useMemo(() => {
  return filterDepositLoanByClient(depostiLoanData, client);
}, [depostiLoanData, client]);

const filterdtLoansOutstanding = useMemo(() => {
  return filterDepositLoanByClient(loanOutstandingTrendsData, client);
}, [loanOutstandingTrendsData, client]);

const filterdtTotalProfiandLossRelationship = useMemo(() => {
  return filterTotalProfitAndLossRelationshipData(toalProfiAndLossRelationshipData, client);
}, [toalProfiAndLossRelationshipData, client]);

const filterdtVoumeOfUsage = useMemo(() => {
  return filterVolumeOfUsageByClient(voumeOfUsageData, client);
}, [voumeOfUsageData, client]);

const filterdtRevenueProfirPrductLevel = useMemo(() => {
  return filterVolumeOfUsageByClient(revenueProfitProductLevelData, client);
}, [revenueProfitProductLevelData, client]);

  const filterdtInsightsDataDetails = useMemo(() => {
    return filterVolumeOfUsageByClient(insightsScreenData, client);
  }, [insightsScreenData, client]);

  // Filter clients based on debounced search input
  const filteredClientOptions = useMemo(() => {
    return clientOptions.filter((item) =>
      item.name.toLowerCase().includes(debouncedSearchInput.toLowerCase())
    );
  }, [debouncedSearchInput]);
  
  const renderDashboard = () => {
    switch (currentPage) {
      case 'insight':
        return (
          <>
            <div
              className={classes.primaryContent}
              style={{
                display: 'flex',
                // gap: '12px',
                // alignItems: 'flex-start', // or 'center' if you want vertical centering
                // flexWrap: 'wrap', // optional, for responsiveness
              }}>
              <InsightsDashboard
                dashboardsReady={dashboardsReady}
                dashboardsLoading={dashboardsLoading}
                executingQueries={executingQueries}
                currentProcessingInsight={currentProcessingInsight}
                filterdtInsightsDataDetails={filterdtInsightsDataDetails}
              />
              {/* <ConversationDashboard /> */}
            </div>

            <div className={classes.secondaryContent}>
              <ConversationDashboard />
            </div>
          </>
        );
      case 'dashboard':
      default:
        return (
          <>
            <div className={classes.primaryContent}>
              {/* <HomeDashboard
                ref={homeDashboardRef}
                isLoading={dashboardsLoading?.home}
                isReady={dashboardsReady?.home}
              /> */}
              <KPIDashboard filteredKpis={filteredKpis} revenueForClient={revenueForClient} filterdDepositLoans={filterdDepositLoans} filterdtLoansOutstanding={filterdtLoansOutstanding}
              filteredAccountDetails={filteredAccountDetails} filterdtTotalProfiandLossRelationship={filterdtTotalProfiandLossRelationship} filterdtVoumeOfUsage={filterdtVoumeOfUsage} filterdtRevenueProfirPrductLevel={filterdtRevenueProfirPrductLevel}/>
            </div>
            {/* <div className={classes.secondaryContent}>
              <ConversationDashboard />
            </div> */}
          </>
        );
    }
  };

  const formatLastRefreshed = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
    });
  };

  // 📄 Export PDF
  const handleExportPDF = async () => {
    if (homeDashboardRef.current && typeof homeDashboardRef.current.handleExportPDF === 'function') {
      await homeDashboardRef.current.handleExportPDF();
    }
  };

  // 🔹 Green Header Bar with Notification Dropdown
  const renderHeaderBar = () => (
    <Box
      sx={{
        color: '#fff',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 1.5,
        py: 1,
        gap: 1,
        fontFamily: 'Roboto, sans-serif',
        fontSize: '10px',
        position: 'relative', // Important for dropdown positioning
      }}>
      {/* Left Section */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
          fontSize: '10px',
        }}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 'bold',
            textTransform: 'capitalize',
            fontSize: '16px',
          }}>
          {currentPage === 'insight' ? 'Insights' : 'Dashboard'}
        </Typography>

        <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.5)' }} />

        {/* Client Dropdown with Search */}
        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '12px' }}>
          Client&nbsp;:&nbsp;
          <Select
            value={client}
            onChange={(e) => {
              setClient(e.target.value);
              setClientSearchInput('');
            }}
            variant="standard"
            disableUnderline
            MenuProps={{
              PaperProps: {
                sx: {
                  maxHeight: '300px',
                  overflowY: 'auto',
                  scrollbarWidth: 'thin',
                }
              }
            }}
            sx={{
              color: '#fff',
              paddingTop: '2px',
              fontSize: '10px',
              '& .MuiSelect-icon': { color: '#fff', fontSize: '12px' },
            }}>
            {/* Search Input in Menu Header */}
            <MenuItem disableRipple disableTouchRipple sx={{ padding: 0, '&:hover': { backgroundColor: 'transparent' } }}>
              <Box
                sx={{
                  width: '100%',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: '#f5f5f5',
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}>
                <SearchIcon sx={{ fontSize: '16px', color: '#999' }} />
                <input
                  type="text"
                  placeholder="Search clients..."
                  value={clientSearchInput}
                  onChange={(e) => setClientSearchInput(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  style={{
                    border: '1px solid #ddd',
                    outline: 'none',
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '12px',
                    fontFamily: 'Roboto, sans-serif',
                    borderRadius: '4px',
                  }}
                />
              </Box>
            </MenuItem>

            {/* Client Options */}
            {filteredClientOptions.length > 0 ? (
              filteredClientOptions.map((item) => (
                <MenuItem key={item.id} value={item.id} sx={{ fontSize: '10px' }}>
                  {item.name}
                </MenuItem>
              ))
            ) : (
              <MenuItem disabled sx={{ fontSize: '10px' }}>
                No clients found
              </MenuItem>
            )}
          </Select>
        </Typography>
      </Box>

      {/* Right Section */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
          justifyContent: isSmallScreen ? 'flex-start' : 'flex-end',
          fontSize: '10px',
        }}>
        {/* Date Range */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <img src={CalendarIcon} alt="Calendar" width={14} height={14} />
          <Typography sx={{ fontSize: '10px' }}>1st Sep 2023 – 1st Sep 2025</Typography>
        </Box>

        <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.5)' }} />

        {/* POC */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <img src={DashboardName} alt="DashboardName" width={12} />
          <Typography sx={{ fontSize: '10px' }}>Name of the POC</Typography>
        </Box>

        <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.5)' }} />

        {/* Last Updated */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography sx={{ fontSize: '10px' }}>Updated 10 mins ago</Typography>
          <CheckCircleIcon sx={{ color: '#CFFFCB', fontSize: '12px', verticalAlign: 'middle' }} />
        </Box>

        <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.5)' }} />

        {/* Last Updated */}
        {/* <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography>
            Updated {formatLastRefreshed(lastRefreshed.home) || '10 mins ago'}
          </Typography>
          <CheckCircleIcon
            sx={{ color: '#CFFFCB', fontSize: '18px', verticalAlign: 'middle' }}
          />
        </Box>

        <Divider
          orientation="vertical"
          flexItem
          sx={{ borderColor: 'rgba(255,255,255,0.5)' }}
        /> */}

        {/* Action Buttons */}
        {/* <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            size="small"
            variant="contained"
            onClick={() => setIsSummaryOpen(true)}
            startIcon={<SummarizeIcon />}
            sx={{
              backgroundColor: '#fff',
              color: '#00A651',
              textTransform: 'none',
              '&:hover': { backgroundColor: '#f1f1f1' },
            }}
          >
            Key Summary
          </Button>

          <IconButton
            title="Export as PDF"
            onClick={handleExportPDF}
            sx={{ color: '#fff' }}
          >
            <DownloadIcon />
          </IconButton>
        </Box>

        <Divider
          orientation="vertical"
          flexItem
          sx={{ borderColor: 'rgba(255,255,255,0.5)' }}
        /> */}

        <Box ref={notificationAnchorRef} sx={{ position: 'relative' }}>
          <Tooltip title="Notifications" arrow>
            <IconButton
              sx={{
                color: isNotificationOpen ? '#27a600ff' : '#fff', // Green icon color when active
                p: 0.5,
                backgroundColor: isNotificationOpen ? '#fff' : 'transparent', // White background when active
                borderRadius: '50%',
                transition: 'all 0.3s ease',
                '&:hover': {
                  backgroundColor: isNotificationOpen ? '#f5f5f5' : 'rgba(255,255,255,0.2)',
                },
              }}
              onClick={() => setIsNotificationOpen((prev) => !prev)}>
              <img
                src={DashNotification}
                alt="DashNotification"
                width={16}
                height={16}
                style={{
                  filter: isNotificationOpen ? 'invert(45%) sepia(100%) saturate(300%) hue-rotate(90deg)' : 'none',
                }}
              />
            </IconButton>
          </Tooltip>

          {/* Dropdown */}
          {isNotificationOpen && (
            <Box
              sx={{
                position: 'absolute',
                top: '120%',
                right: 0,
                mt: 1,
                width: 250,
                bgcolor: 'background.paper',
                boxShadow: 3,
                borderRadius: 1,
                zIndex: 1300,
                color: 'text.primary',
              }}>
              <Box sx={{ p: 1.5 }}>
                <Typography variant="body1" sx={{ fontWeight: 'bold', display: 'inline-flex', alignItems: 'center' }}>
                  Notifications{' '}
                  <Box
                    component="span"
                    sx={{
                      backgroundColor: 'orange',
                      color: '#fff',
                      borderRadius: '50%',
                      width: '1.4em',
                      textAlign: 'center',
                      fontSize: '0.8em',
                      fontWeight: 'normal',
                      marginLeft: '0.4em',
                    }}>
                    4
                  </Box>
                </Typography>
              </Box>

              <Divider />

              {[
                { detail: 'Notification Detail 1', time: '2 mins ago' },
                { detail: 'Notification Detail 2', time: '30 mins ago' },
                { detail: 'Notification Detail 3', time: '1 Week ago' },
                { detail: 'Notification Detail 4', time: '1 Week ago' },
              ].map((n, i) => (
                <Box
                  key={i}
                  sx={{
                    p: 1.5,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}>
                  <Typography variant="body2">{n.detail}</Typography>

                  <Typography variant="caption" color="text.secondary">
                    {n.time}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );

  return (
    <div className={classes.mainPanelContainer}>
      {renderHeaderBar()}
      <div className={classes.content}>{renderDashboard()}</div>
    </div>
  );
}

MainPanel.propTypes = {
  dashboardsReady: PropTypes.shape({
    home: PropTypes.bool,
    insights: PropTypes.bool,
  }),
  dashboardsLoading: PropTypes.shape({
    home: PropTypes.bool,
    insights: PropTypes.bool,
  }),
  executingQueries: PropTypes.bool,
  currentProcessingInsight: PropTypes.string,
};

MainPanel.defaultProps = {
  dashboardsReady: { home: false, insights: false },
  dashboardsLoading: { home: true, insights: true },
  executingQueries: false,
  currentProcessingInsight: null,
};

export default MainPanel;
