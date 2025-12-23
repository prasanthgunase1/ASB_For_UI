import { useState } from 'react';
import { Box, Typography, Tooltip, Divider } from '@mui/material';
import ConversationDashboard from '../../components/Dashboards/ConversationDashboard';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import classes from './KPIDashboard.module.scss';
import MeetingIcon from '../../assets/DashboardPage1/Dashboard/Metting_Icon.svg';
import SummaryIcon from '../../assets/DashboardPage1/Dashboard/Summary_Icon.svg';
import ArrowRightIcon from '../../assets/DashboardPage1/Dashboard/Arrow_Right.svg';
import SummaryPanel from '../SummaryPanel/SummaryPanel';
import TrendComponent from './TrendComponent';
import GenerateReport from '../../components/GenerateReportPanel/GenerateReport';
// import { useSelector } from "react-redux";
import { useGetKpiDashboardQuery } from '../../services/dashboardApi';
import PropTypes from 'prop-types';
// import { selectKpiDashboardData } from '../../redux/store/dashboardSlice';

export default function KPIDashboard({filteredKpis, revenueForClient, filterdDepositLoans, filterdtLoansOutstanding, filteredAccountDetails, filterdtTotalProfiandLossRelationship,filterdtVoumeOfUsage, filterdtRevenueProfirPrductLevel}) {
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const { isLoading } = useGetKpiDashboardQuery();
// const topData = useSelector(selectKpiDashboardData);
const kpisLists = filteredKpis['kpis'];
const kpiScoreLists = filteredKpis['score'];
////////hey there
  return (
    <Box className={classes.wrap}>
      <Box className={classes.kpileftcontainer}>
        <Box className={classes.kpiContainer}>
          {/* Header */}
          <Box className={classes.header}>
            <Typography variant="h6" className={classes.title}>
              KPI
            </Typography>
            <Box className={classes.actions}>
              <Box className={classes.actionItem}>
                <img src={MeetingIcon} alt="Meeting" />
                <Typography
                data-testid="report-button"
                  className={classes.actionText}
                  onClick={() => setIsReportModalOpen(true)}
                  sx={{ cursor: 'pointer', color: '#2e7d32', fontWeight: 500 }}>
                  Generate Pre Meeting Snapshot
                </Typography>
                <GenerateReport open={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} />
              </Box>

              <Box className={classes.actionItem}>
                <img src={SummaryIcon} alt="Summary" />
                <Typography data-testid="summary-button" className={classes.actionText} onClick={() => setIsSummaryOpen(true)}>
                  Summary
                  {isSummaryOpen && <SummaryPanel open onClose={() => setIsSummaryOpen(false)} />}
                </Typography>
                <img src={ArrowRightIcon} alt="Arrow" />
              </Box>
            </Box>
          </Box>

          {/* KPI Box */}
          <Box className={classes.kpiBox} data-testid="kpi-box">
            <Box className={classes.topRow}>
              {kpisLists?.map((item, i) => (
                <Box key={i} className={classes.metric}>
                  <Box className={classes.metricHeader} gap={0.7}>
                    <Typography className={classes.metricTitle}>{item.title}</Typography>
                    <Tooltip title={item.title} arrow>
                      <InfoOutlinedIcon className={classes.infoIcon} />
                    </Tooltip>
                  </Box>

                  <Typography className={classes.metricValue}>{item.value}</Typography>

                  <Box className={classes.trendContainer}>
                    {item.trend === 'up' && (
                      <Box className={classes.trendUp}>
                        <ArrowUpwardIcon sx={{ fontSize: '12px' }} />
                      </Box>
                    )}
                    <Typography className={classes.metricSub}>{item.sub}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>

            <Divider className={classes.divider} />

            <Box className={classes.bottomRow}>
              {kpiScoreLists?.map((item, i) => (
                <Box key={i} className={classes.metric}>
                  <Box className={classes.metricHeader} gap={1}>
                    <Typography className={classes.metricTitle}>{item.title}</Typography>
                    <Tooltip title={item.title} arrow>
                      <InfoOutlinedIcon className={classes.infoIcon} />
                    </Tooltip>
                  </Box>

                  <Box className={classes.valueRow}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="h6" fontWeight={700} color="text.primary">
                        {item.value}
                      </Typography>
                      {item.badge && (
                        <Box
                          sx={{
                            backgroundColor:
                              item.badgeColor === 'yellow'
                                ? '#fff3cd'
                                : item.badgeColor === 'green'
                                  ? '#d4edda'
                                  : '#e9f7ef',
                            color:
                              item.badgeColor === 'yellow'
                                ? '#856404'
                                : item.badgeColor === 'green'
                                  ? '#155724'
                                  : '#1e7e34',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: '4px',
                            px: 1,
                            py: 0.3,
                          }}>
                          {item.badge}
                        </Box>
                      )}
                    </Box>
                  </Box>

                  <Box className={item.trend === 'up' ? classes.trendUp : classes.trendDown}>
                    {item.trend === 'up' ? (
                      <ArrowUpwardIcon sx={{ fontSize: '12px' }} />
                    ) : (
                      <ArrowDownwardIcon sx={{ fontSize: '12px' }} />
                    )}
                    <Typography className={classes.metricSub}>{item.sub}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>

              
            <Typography variant="h6" margin={1.6}>
              Trends
            </Typography>
            <TrendComponent revenueForClient={revenueForClient} filterdDepositLoans={filterdDepositLoans} filterdtLoansOutstanding={filterdtLoansOutstanding} filteredAccountDetails={filteredAccountDetails} filterdtTotalProfiandLossRelationship={filterdtTotalProfiandLossRelationship} filterdtVoumeOfUsage={filterdtVoumeOfUsage} filterdtRevenueProfirPrductLevel={filterdtRevenueProfirPrductLevel}/>
      
        </Box>
      </Box>

      {/* Right Section — Chat */}
      <Box sx={{ flex: 1 }}>
        <ConversationDashboard />
      </Box>
    </Box>
  );
}

KPIDashboard.propTypes = {
  filteredKpis: PropTypes.object.isRequired,
   revenueForClient: PropTypes.object.isRequired,
   filterdDepositLoans: PropTypes.object.isRequired,
   filterdtLoansOutstanding: PropTypes.object.isRequired,
   filteredAccountDetails: PropTypes.object.isRequired,
   filterdtTotalProfiandLossRelationship: PropTypes.object.isRequired,
   filterdtVoumeOfUsage: PropTypes.array.isRequired,
   filterdtRevenueProfirPrductLevel: PropTypes.array.isRequired,
};
