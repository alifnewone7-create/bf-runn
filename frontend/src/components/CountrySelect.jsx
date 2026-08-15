import React, { useEffect, useRef, useState } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';

const COUNTRIES = ['Afghanistan','Albania','Algeria','Andorra','Angola','Argentina','Armenia','Australia','Austria','Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium','Belize','Benin','Bhutan','Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi','Cambodia','Cameroon','Canada','Cape Verde','Chad','Chile','China','Colombia','Comoros','Congo','Costa Rica','Croatia','Cuba','Cyprus','Czech Republic','Denmark','Djibouti','Dominica','Dominican Republic','Ecuador','Egypt','El Salvador','Estonia','Eswatini','Ethiopia','Fiji','Finland','France','Gabon','Gambia','Georgia','Germany','Ghana','Greece','Grenada','Guatemala','Guinea','Guyana','Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iraq','Ireland','Israel','Italy','Ivory Coast','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania','Luxembourg','Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Mauritania','Mauritius','Mexico','Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar','Namibia','Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria','North Macedonia','Norway','Oman','Pakistan','Palestine','Panama','Papua New Guinea','Paraguay','Peru','Philippines','Poland','Portugal','Qatar','Romania','Rwanda','Saudi Arabia','Senegal','Serbia','Seychelles','Sierra Leone','Singapore','Slovakia','Slovenia','Somalia','South Africa','South Korea','South Sudan','Spain','Sri Lanka','Sudan','Suriname','Sweden','Switzerland','Taiwan','Tajikistan','Tanzania','Thailand','Timor-Leste','Togo','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Uganda','Ukraine','United Arab Emirates','United Kingdom','United States','Uruguay','Uzbekistan','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe'];

const CountrySelect = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); };
  }, []);

  const filtered = COUNTRIES.filter((c) => c.toLowerCase().includes(query.trim().toLowerCase()));

  const select = (c) => { onChange(c); setQuery(''); setOpen(false); };

  return (
    <div ref={ref} className="relative">
      <Globe size={18} className="absolute left-3.5 top-[23px] -translate-y-1/2 text-white/40 pointer-events-none z-10" />
      <input
        data-testid="register-country-input"
        type="text"
        value={open ? query : (value || '')}
        onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(''); }}
        placeholder={value || 'Search your country...'}
        className="w-full bg-white/[0.04] border border-white/12 rounded-xl pl-11 pr-10 py-3 text-[15px] text-white placeholder:text-white/35 focus:outline-none focus:border-[#14b877] focus:ring-2 focus:ring-[#14b877]/25 transition"
      />
      <ChevronDown size={17} className={`absolute right-3.5 top-[23px] -translate-y-1/2 text-white/40 pointer-events-none transition-transform ${open ? 'rotate-180' : ''}`} />
      {open && (
        <div data-testid="register-country-dropdown"
             className="absolute z-30 mt-2 w-full max-h-52 overflow-y-auto rounded-xl border border-white/12 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]"
             style={{ background: 'linear-gradient(150deg, #0D1E18 0%, #071510 100%)' }}>
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-white/45">No country found</p>
          ) : filtered.map((c) => (
            <button type="button" key={c} onClick={() => select(c)} data-testid={`country-option-${c.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-[14px] transition-colors ${value === c ? 'text-[#14b877] bg-[#14b877]/10' : 'text-white/80 hover:bg-white/[0.06]'}`}>
              {c}
              {value === c && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CountrySelect;
