// Single source of truth for the backend base URL.
// REACT_APP_API_BASE wins so the VPS API survives platform resets of REACT_APP_BACKEND_URL.
export const API_BASE =
  process.env.REACT_APP_API_BASE || process.env.REACT_APP_BACKEND_URL;

export default API_BASE;
