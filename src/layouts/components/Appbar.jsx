import LogoutIcon from '@mui/icons-material/Logout';
import SettingsIcon from '@mui/icons-material/Settings';
import {
  Avatar,
  Box,
  Container,
  Divider,
  Grid2 as Grid,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Tooltip,
} from '@mui/material';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import TALogo from '../../assets/TA-logo.png';
import classes from './Appbar.module.scss';
import { oktaLogout } from '../../utils/okta';
import { selectUser } from '../../features/auth/authSlice';

const settings = [
  {
    name: 'Settings',
    icon: <SettingsIcon fontSize="small" />,
  },
  {
    name: 'Logout',
    icon: <LogoutIcon fontSize="small" />,
  },
];

function Appbar({ appName = 'DeepThought', children }) {
  const [anchorElUser, setAnchorElUser] = useState(null);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const user = useSelector(selectUser) || {};
  const dispatch = useDispatch();

  const handleOpenUserMenu = (event) => {
    setAnchorElUser(event.currentTarget);
  };

  const handleCloseUserMenu = () => {
    setAnchorElUser(null);
  };

  const handleLogout = async () => {
    try {
      setLogoutLoading(true);
      await oktaLogout();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      await new Promise((res) => setTimeout(res, 100));
    }
  };

  return (
    <AppBar position="fixed">
      <Container maxWidth={'100%'} className={classes.appBarContainer}>
        <Toolbar className={classes.appBar} disableGutters>
          <Grid size={12} container spacing={2} className={classes.headerContainer}>
            <Grid size={3} container className={classes.logo}>
              <Grid>
                <img src={TALogo} alt="TA Logo" />
              </Grid>
              <Grid>
                <Divider
                  orientation="vertical"
                  sx={{
                    height: '1rem',
                    borderColor: '#707070',
                  }}
                />
              </Grid>
              <Grid>
                <Typography fontWeight={'bold'}>{appName}</Typography>
              </Grid>
            </Grid>
            <Grid container size={6} className={classes.navContainer} spacing={6}>
              {children}
            </Grid>
            <Grid container size={3} className={classes.actionContainer}>
              <Box>
                <Tooltip title="Open settings">
                  <IconButton onClick={handleOpenUserMenu} sx={{ p: 0 }}>
                    <Avatar
                      sx={{
                        height: '28px',
                        width: '28px',
                      }}
                      src={user?.picture || user?.given_name?.[0]}>
                      {/* {!user?.picture && } */}
                    </Avatar>
                  </IconButton>
                </Tooltip>
                <Menu
                  sx={{ mt: '45px', borderRadius: '6px' }}
                  id="menu-appbar"
                  anchorEl={anchorElUser}
                  anchorOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                  }}
                  keepMounted
                  transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                  }}
                  open={Boolean(anchorElUser)}
                  onClose={handleCloseUserMenu}>
                  {settings.map((setting, index, settings) => (
                    <Box key={setting?.name}>
                      {logoutLoading ? (
                        <MenuItem sx={{ cursor: 'disabled' }}>
                          <Skeleton
                            sx={{ background: 'rgba(0, 0, 0, 0.1)' }}
                            variant="rounded"
                            height={25}
                            width={90}
                          />
                        </MenuItem>
                      ) : (
                        <MenuItem
                          onClick={() => (setting?.name === 'Logout' ? handleLogout() : handleCloseUserMenu(event))}
                          className={classes.dropdownMenu}
                          disableTouchRipple
                          disableRipple>
                          <ListItemText>
                            <Typography>{setting?.name}</Typography>
                          </ListItemText>
                          <ListItemIcon
                            sx={{
                              justifyContent: 'flex-end',
                            }}>
                            {setting?.icon}
                          </ListItemIcon>
                        </MenuItem>
                      )}

                      {index < settings.length - 1 && <Divider />}
                    </Box>
                  ))}
                </Menu>
              </Box>
            </Grid>
          </Grid>
        </Toolbar>
      </Container>
    </AppBar>
  );
}

Appbar.propTypes = {
  appName: PropTypes.string.isRequired,
  children: PropTypes.node,
};

export default Appbar;
