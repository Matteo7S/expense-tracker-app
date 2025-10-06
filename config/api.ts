// Get Auth API URL from environment or use default
const getAuthApiUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_AUTH_API_URL;
  if (envUrl) {
    // Ensure URL ends with / for consistency
    return envUrl.endsWith('/') ? envUrl : `${envUrl}/`;
  }
  // Default fallback
  return 'http://localhost:3101/';
};

// Get Main API URL from environment or use default
const getMainApiUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_MAIN_API_URL;
  if (envUrl) {
    // Ensure URL ends with / for consistency
    return envUrl.endsWith('/') ? envUrl : `${envUrl}/`;
  }
  // Default fallback
  return 'http://localhost:3100/';
};

const AUTH_BASE_URL = getAuthApiUrl();
const MAIN_BASE_URL = getMainApiUrl();

export const API_ENDPOINTS = {
  MAIN_API: `${MAIN_BASE_URL}api`,
  AUTH_API: `${AUTH_BASE_URL}api`,
};
