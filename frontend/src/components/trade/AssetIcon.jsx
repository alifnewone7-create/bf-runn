import React from 'react';

const FLAG = (c) => `https://hatscripts.github.io/circle-flags/flags/${c}.svg`;
const CRYPTO = (id) => `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${id}.svg`;

export const AssetIcon = ({ icon, size = 24 }) => {
  if (!icon) return null;
  if (icon.type === 'pair') {
    const f = size * 0.74;
    return (
      <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
        <img src={FLAG(icon.base)} alt={icon.base} width={f} height={f} className="absolute left-0 top-0 rounded-full" />
        <img src={FLAG(icon.quote)} alt={icon.quote} width={f} height={f} className="absolute right-0 bottom-0 rounded-full ring-1 ring-black/60" />
      </span>
    );
  }
  if (icon.type === 'crypto') {
    return <img src={CRYPTO(icon.id)} alt={icon.id} width={size} height={size} className="shrink-0 rounded-full" />;
  }
  return (
    <span className="inline-flex items-center justify-center shrink-0 rounded-full font-bold text-black"
          style={{ width: size, height: size, background: icon.color, fontSize: size * (icon.text.length > 2 ? 0.3 : 0.42) }}>
      {icon.text}
    </span>
  );
};
