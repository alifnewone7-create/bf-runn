import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { SignOut, Trophy, Wallet, Target, CircleNotch, ChartLineUp } from '@phosphor-icons/react';
import { CHALLENGES } from '../mock/mock';
import BrandLogo from '../components/BrandLogo';

import { API_BASE as API } from '../lib/apiBase';

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('bfg_token');
    if (!token) { navigate('/login', { replace: true }); return; }
    axios.get(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => { setUser(data); setLoading(false); })
      .catch(() => { localStorage.removeItem('bfg_token'); localStorage.removeItem('bfg_user'); navigate('/login', { replace: true }); });
  }, [navigate]);

  const logout = () => {
    localStorage.removeItem('bfg_token');
    localStorage.removeItem('bfg_user');
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#040D09' }}>
        <CircleNotch size={40} className="text-[#14b877] animate-spin" />
      </div>
    );
  }

  const challenge = CHALLENGES.find((c) => c.id === user.plan);

  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(900px 600px at 15% 0%, rgba(20,184,119,0.13), transparent 60%), radial-gradient(700px 500px at 90% 100%, rgba(20,184,119,0.08), transparent 60%), #040D09' }}>
      <header className="max-w-5xl mx-auto px-5 sm:px-8 pt-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5" data-testid="dashboard-logo-link">
          <BrandLogo className="h-8 w-auto object-contain" />
          <span className="font-display font-bold text-[16px]">Binary Fund <span className="bfg-green-text">Global</span></span>
        </Link>
        <div className="flex items-center gap-2.5">
          <Link to="/demo-trade" data-testid="dashboard-trade-link"
                className="bfg-btn-primary px-5 py-2.5 rounded-xl inline-flex items-center gap-2 text-[14px]">
            <ChartLineUp size={17} weight="bold" /> Trade
          </Link>
          <button onClick={logout} data-testid="dashboard-logout-button"
                  className="bfg-btn-outline px-5 py-2.5 rounded-xl inline-flex items-center gap-2 text-[14px]">
            <SignOut size={17} /> Log out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
        <div className="bfg-card p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-5" data-testid="dashboard-user-card">
          {user.picture ? (
            <img src={user.picture} alt={user.name} referrerPolicy="no-referrer" className="h-16 w-16 rounded-2xl object-cover border border-white/15" />
          ) : (
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center font-display font-bold text-2xl" style={{ background: 'linear-gradient(135deg, #16c481, #0f9a63)' }}>{user.name?.[0]}</div>
          )}
          <div>
            <p className="text-white/50 text-[13px] uppercase tracking-widest font-semibold">Welcome back</p>
            <h1 className="font-display font-bold text-[26px] sm:text-[30px] leading-tight" data-testid="dashboard-user-name">{user.name}</h1>
            <p className="text-white/55 text-[14px] mt-0.5" data-testid="dashboard-user-email">{user.email}</p>
          </div>
        </div>

        <h2 className="font-display font-bold text-[19px] mt-10 mb-4">Your Challenge</h2>
        {challenge ? (
          <div className="bfg-card p-6 sm:p-8" data-testid="dashboard-challenge-card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="bfg-pill px-3.5 py-1.5">{challenge.name} Challenge</span>
                <p className="text-white/55 text-[14px] mt-3">{challenge.tagline}</p>
              </div>
              <span className="text-[12px] font-semibold uppercase tracking-widest text-[#D4AF37] border border-[#D4AF37]/35 bg-[#D4AF37]/10 rounded-full px-4 py-1.5">Payment pending</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
              {[[Wallet, 'Funded account', challenge.funded], [Trophy, 'Quotex payout', challenge.quotex], [Target, 'One-time fee', challenge.fee]].map(([Icon, label, value], i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <Icon size={22} weight="duotone" className="text-[#14b877]" />
                  <p className="text-white/50 text-[12px] mt-2">{label}</p>
                  <p className="font-display font-bold text-[20px] bfg-green-text">{value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bfg-card p-8 text-center" data-testid="dashboard-no-challenge">
            <p className="text-white/60 text-[15px]">You haven't selected a challenge yet.</p>
            <Link to="/#challenges" className="inline-block mt-4 bfg-btn-primary px-7 py-3 rounded-xl text-[14px]">Browse Challenges</Link>
          </div>
        )}
      </main>
    </div>
  );
}
