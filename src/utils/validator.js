export const validateOktaConfig = () => {
  const issuer = import.meta.env.VITE_OKTA_ISSUER;
  const clientId = import.meta.env.VITE_OKTA_CLIENT_ID;
  if (!issuer || !clientId) {
    return false;
  }
  return true;
};
