/* eslint-disable no-unused-vars */
import {
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Avatar,
  Menu,
  MenuItem,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';

import DashboardIcon from '../../../assets/Sidepanel/DashboardIcon.svg';
import InsightsIcon from '../../../assets/Sidepanel/InsightsIcon.svg';
import PropTypes from 'prop-types';
import { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  selectUser,
  selectCurrentPage,
  setCurrentPage,
  selectSelectedIndustry,
} from '../../../features/auth/authSlice';
import {
  selectHomeDashboardLoading,
  selectInsightsDashboardLoading,
} from '../../../redux/store/dashboardSlice';
import { useResetVisualMutation } from '../../../services/dashboardApi';
import classes from './SidePanel.module.scss';
import AssociatedBankLogo from '../../../assets/Sidepanel/AssociatedBankLogo.svg';
import ProfileIcon from '../../../assets/Sidepanel/ProfileIcon.svg';
import HelpIcon from '../../../assets/Sidepanel/HelpIcon.svg';
import MainInfo from '../../../assets/Sidepanel/Main Info.svg';
import { oktaLogout } from '../../../utils/okta';

// ✅ Centralized role-to-menu mapping (easily extendable)
const ROLE_MENU_CONFIG = {
  ADMINISTRATOR: [
    { id: 'kpiRepo', label: 'KPI Repository', icon: DashboardIcon },
    { id: 'usageStats', label: 'Usage Stats', icon: InsightsIcon },
  ],
  'ADMIN PERSONA': [
    { id: 'kpiRepo', label: 'KPI Repository', icon: DashboardIcon },
    { id: 'usageStats', label: 'Usage Stats', icon: InsightsIcon },
  ],
  ADMIN: [
    { id: 'kpiRepo', label: 'KPI Repository', icon: DashboardIcon },
    { id: 'usageStats', label: 'Usage Stats', icon: InsightsIcon },
  ],
  'RELATIONSHIP MANAGER': [
    { id: 'home', label: 'Dashboard', icon: DashboardIcon },
    { id: 'insight', label: 'Insights', icon: InsightsIcon },
  ],
  // 🔹 Add future roles easily
};

function SidePanel({ onRefresh, isPolling, executingQueries, dashboardsReady, dashboardsLoading }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const user = useSelector(selectUser);
  const currentPage = useSelector(selectCurrentPage);
  const isHomeLoading = useSelector(selectHomeDashboardLoading);
  const isInsightsLoading = useSelector(selectInsightsDashboardLoading);

  const [anchorEl, setAnchorEl] = useState(null);
  const [localRefreshing, setLocalRefreshing] = useState(false);
  const [resetVisual] = useResetVisualMutation();

  const isRefreshing = isPolling || localRefreshing;

  // 🧠 Normalize role name
  const selectedRole = user?.selectedRole || user?.role || 'Relationship Manager';
  const normalizedRole = selectedRole?.toUpperCase().trim();

  // 🧩 Use memoized role-based menu config
  const menuItems = useMemo(() => {
    const baseItems = ROLE_MENU_CONFIG[normalizedRole];
    if (baseItems) {
      return baseItems.map((item) => ({
        ...item,
        loading:
          item.id === 'kpiRepo'
            ? isHomeLoading || isRefreshing
            : item.id === 'usageStats'
            ? isInsightsLoading || isRefreshing || executingQueries
            : isRefreshing,
      }));
    }
    // fallback to default RM menu
    return ROLE_MENU_CONFIG['RELATIONSHIP MANAGER'];
  }, [normalizedRole, isHomeLoading, isInsightsLoading, isRefreshing, executingQueries]);

  // 🟢 Auto-select first menu by default
  useEffect(() => {
    if (!currentPage && menuItems.length > 0) {
      dispatch(setCurrentPage(menuItems[0].id));
    }
  }, [currentPage, menuItems, dispatch]);

  const handlePageChange = (pageId) => {
    dispatch(setCurrentPage(pageId));
  };

  const handleLogoClick = () => {
    navigate('/dashboard');
  };

  const handleLogout = async () => {
    try {
      await oktaLogout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const renderIcon = (item) => {
    if (item.loading)
      return <CircularProgress size={20} className={classes.loadingIcon} />;
    return (
      <img src={item.icon} alt={item.label} className={classes.menuIconImage} />
    );
  };

  return (
    <div className={classes.sidePanelContainer}>
      {/* Header */}
      <div className={classes.headerContent}>
        <div className={classes.logoSection}>
          <div className={classes.senseAiContainer}>
            <Tooltip title="" arrow>
              <div className={classes.logoWrapper} onClick={handleLogoClick}>
                <img src={AssociatedBankLogo} alt="Logo" className={classes.logo} />
              </div>
            </Tooltip>
          </div>
          <Typography variant="h6" className={classes.title}>
            ASB FOR AI
          </Typography>
        </div>

        <Divider className={classes.divider} />

        {/* 🔹 Role Display (not clickable) */}
        <div className={classes.roleSection}>
          <div
            className={`${classes.roleChip} ${
              selectedRole?.toLowerCase().includes('admin')
                ? classes.adminActive
                : classes.managerActive
            }`}>
            <Typography variant="body2">
              {selectedRole?.toLowerCase().includes('admin')
                ? 'Admin Persona'
                : selectedRole}
            </Typography>
          </div>
        </div>
      </div>

      {/* Menu */}
      <List component="nav" className={classes.menuList}>
        {menuItems.map((item) => (
          <Tooltip key={item.id} title={item.label} arrow placement="right">
            <ListItem
              component="button"
              className={`${classes.menuItem} ${
                currentPage === item.id ? classes.selected : ''
              }`}
              onClick={() => handlePageChange(item.id)}>
              <ListItemIcon className={classes.menuIcon}>
                {renderIcon(item)}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                className={classes.menuText}
              />
            </ListItem>
          </Tooltip>
        ))}
      </List>

      {/* Footer */}
      <div className={classes.footer}>
        <div className={classes.footerActions}>
          <Tooltip title="Help" arrow>
            <img src={HelpIcon} alt="HelpIcon" />
          </Tooltip>

          <Tooltip title="Notification" arrow>
            <img src={MainInfo} alt="Main Info" />
          </Tooltip>

          <Tooltip title="User Menu" arrow>
            <img
              src={ProfileIcon}
              alt="ProfileIcon"
              onClick={(e) => setAnchorEl(e.currentTarget)}
              style={{ cursor: 'pointer' }}
            />
          </Tooltip>
        </div>

        <Menu
          id="user-menu"
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          className={classes.userMenu}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
          <div className={classes.userInfo}>
            <Avatar src={user?.picture} className={classes.menuAvatar}>
              {!user?.picture && user?.name?.[0]}
            </Avatar>
            <div className={classes.userDetails}>
              <Typography variant="subtitle1">{user?.name}</Typography>
              <Typography variant="body2" color="textSecondary">
                {user?.email}
              </Typography>
            </div>
          </div>
          <Divider />
          <MenuItem onClick={handleLogout}>
            <ListItemIcon>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Logout</ListItemText>
          </MenuItem>
        </Menu>
      </div>
    </div>
  );
}

SidePanel.propTypes = {
  onRefresh: PropTypes.func.isRequired,
  isPolling: PropTypes.bool.isRequired,
  executingQueries: PropTypes.bool,
  dashboardsReady: PropTypes.object,
  dashboardsLoading: PropTypes.object,
};

SidePanel.defaultProps = {
  executingQueries: false,
  dashboardsReady: { home: false, insights: false },
  dashboardsLoading: { home: false, insights: false },
};

export default SidePanel;
