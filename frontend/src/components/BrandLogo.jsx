import React, { useState, useEffect, useRef } from 'react';

/**
 * BrandLogo — renders the site logo with localStorage caching for instant loads.
 *
 * How it works:
 *  1. On first visit: shows /logo.png from the network, and once loaded, silently
 *     converts it to a base64 data URL and stores it in localStorage under a
 *     versioned key.
 *  2. On subsequent visits (any page): the cached data URL is read synchronously
 *     during React state init, so the logo paints instantly with zero network wait.
 *  3. Bump LOGO_VERSION whenever /logo.png changes to force a re-cache.
 */

// Bump this when the logo file changes so cached copies get refreshed.
const LOGO_VERSION = 'v2-2026-02';
const CACHE_KEY = `bfg:logo:${LOGO_VERSION}`;
const LOGO_SRC = '/logo.png';

const readCache = () => {
  try {
    return localStorage.getItem(CACHE_KEY) || null;
  } catch {
    return null;
  }
};

const writeCache = (dataUrl) => {
  try {
    localStorage.setItem(CACHE_KEY, dataUrl);
    // Clean up older versions to avoid bloating localStorage.
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('bfg:logo:') && key !== CACHE_KEY) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* quota exceeded or storage disabled — silently ignore */
  }
};

const cacheFromImageElement = (imgEl) => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    writeCache(dataUrl);
  } catch {
    /* CORS or canvas failure — safe to ignore, will retry next visit */
  }
};

const BrandLogo = ({ className = '', alt = 'Binary Fund Global', ...rest }) => {
  const [src, setSrc] = useState(() => readCache() || LOGO_SRC);
  const imgRef = useRef(null);
  const cached = src.startsWith('data:');

  useEffect(() => {
    if (cached) return; // already served from cache
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      cacheFromImageElement(img);
    }
  }, [cached]);

  const handleLoad = (e) => {
    if (!cached) cacheFromImageElement(e.currentTarget);
  };

  const handleError = () => {
    // If the cached data URL somehow becomes invalid, fall back to network.
    if (cached) {
      try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
      setSrc(LOGO_SRC);
    }
  };

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      className={className}
      onLoad={handleLoad}
      onError={handleError}
      decoding="sync"
      fetchPriority="high"
      {...rest}
    />
  );
};

export default BrandLogo;
