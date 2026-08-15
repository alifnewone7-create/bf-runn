import React, { createContext, useContext, useEffect, useState } from 'react';

import { API_BASE as API } from '../lib/apiBase';

const ConfigContext = createContext({ googleClientId: '', loaded: false });

export const ConfigProvider = ({ children }) => {
  const [config, setConfig] = useState({ googleClientId: '', loaded: false });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    // Don't block the whole app forever if the API is slow/unreachable.
    const timer = setTimeout(() => controller.abort(), 6000);
    fetch(`${API}/api/config/public`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setConfig({ googleClientId: data.google_client_id || '', loaded: true });
      })
      .catch(() => {
        if (cancelled) return;
        setConfig({ googleClientId: '', loaded: true });
      })
      .finally(() => clearTimeout(timer));
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  return (
    <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>
  );
};

export const useAppConfig = () => useContext(ConfigContext);
