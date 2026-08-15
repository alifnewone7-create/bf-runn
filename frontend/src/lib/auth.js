// Lightweight client-side session helpers.
//
// Used by the marketing CTAs ("Start Challenge" / "Start Your Challenge") so a
// visitor who is ALREADY logged in is taken straight to the trading terminal
// instead of being bounced through the registration / login screens.
//
// This is only a UX shortcut — the real authority is still the backend: the
// protected pages (/demo-trade, /dashboard, /profile) validate the token with
// `GET /api/auth/me` on mount and redirect to /login if it is rejected.

const TOKEN_KEY = 'bfg_token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (e) {
    return null;
  }
};

// Decode the JWT payload and check `exp`. A malformed / non-JWT token is treated
// as "not obviously expired" — the backend will reject it if it is invalid.
const isExpired = (token) => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return false;
    const json = JSON.parse(
      decodeURIComponent(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((ch) => `%${`00${ch.charCodeAt(0).toString(16)}`.slice(-2)}`)
          .join(''),
      ),
    );
    if (!json || !json.exp) return false;
    return json.exp * 1000 <= Date.now();
  } catch (e) {
    return false;
  }
};

export const isLoggedIn = () => {
  const token = getToken();
  return Boolean(token) && !isExpired(token);
};

/**
 * Destination for every "Start Challenge" CTA.
 *   logged in  → /demo-trade  (straight into the terminal)
 *   logged out → /registration (optionally carrying the selected plan)
 */
export const challengePath = (plan) => {
  if (isLoggedIn()) return '/demo-trade';
  return plan ? `/registration?plan=${plan}` : '/registration';
};

export default challengePath;
