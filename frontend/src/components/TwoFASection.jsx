import React, { useState } from 'react';
import axios from 'axios';
import { ShieldCheck, CircleNotch } from '@phosphor-icons/react';
import { useToast } from '../hooks/use-toast';
import TwoFACodeInput from './TwoFACodeInput';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { API_BASE as API } from '../lib/apiBase';

export default function TwoFASection({ user, onUpdate }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const enabled = user.two_fa_enabled !== false;
  const token = localStorage.getItem('bfg_token');
  const authH = { headers: { Authorization: `Bearer ${token}` } };

  const start = async () => {
    setSending(true);
    try {
      await axios.post(`${API}/api/auth/2fa/request-toggle`, {}, authH);
      setCode('');
      setError('');
      setOpen(true);
    } catch (e) {
      toast({ title: 'Could not send code', description: e?.response?.data?.detail || 'Please try again later.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const resend = async () => {
    try {
      await axios.post(`${API}/api/auth/2fa/request-toggle`, {}, authH);
      setCode('');
      setError('');
      toast({ title: 'Code sent', description: 'A new code has been sent to your email.' });
    } catch (e) {
      toast({ title: 'Could not send code', description: e?.response?.data?.detail || 'Please try again later.', variant: 'destructive' });
    }
  };

  const confirm = async () => {
    if (code.length < 6 || busy) return;
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/api/auth/2fa/confirm-toggle`, { code }, authH);
      onUpdate(data);
      setOpen(false);
      toast({ title: data.two_fa_enabled ? 'Two-step verification is ON' : 'Two-step verification is OFF' });
    } catch (e) {
      setError(e?.response?.data?.detail || 'Invalid authentication code. Please try again.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 mt-5" data-testid="twofa-section">
      <h2 className="text-[16px] font-bold mb-4">Security</h2>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <span className="hidden sm:flex h-11 w-11 rounded-xl items-center justify-center border border-[#14b877]/25 bg-[#14b877]/10 flex-shrink-0">
          <ShieldCheck size={20} weight="duotone" className="text-[#14b877]" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold">Two-Step Verification</span>
            {enabled ? (
              <span data-testid="twofa-status-on"
                    className="inline-flex items-center px-2 py-[2px] rounded-full bg-[#14b877]/15 text-[#14b877] text-[10px] font-bold uppercase tracking-wider">ON</span>
            ) : (
              <span data-testid="twofa-status-off"
                    className="inline-flex items-center px-2 py-[2px] rounded-full bg-white/10 text-white/55 text-[10px] font-bold uppercase tracking-wider">OFF</span>
            )}
          </div>
          <p className="text-[12.5px] text-white/50 mt-1 leading-relaxed">
            {enabled
              ? 'Every time you sign in, we email you a 6 digit authentication code. Turning this off requires a code.'
              : 'Two-step verification is off. Turn it on to protect your account with an emailed code at every sign in.'}
          </p>
        </div>
        <button onClick={start} disabled={sending} data-testid="twofa-toggle-button"
                className={enabled
                  ? 'rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 px-5 py-2.5 text-[13.5px] font-semibold disabled:opacity-50 transition-colors flex-shrink-0'
                  : 'rounded-xl bg-[#14b877] text-black hover:bg-[#17cf86] px-5 py-2.5 text-[13.5px] font-bold disabled:opacity-50 transition-colors flex-shrink-0'}>
          {sending ? 'Sending code…' : enabled ? 'Turn off' : 'Turn on'}
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0a1712] border-white/10 text-white sm:max-w-[420px]" style={{ backgroundColor: '#0a1712' }} data-testid="twofa-dialog">
          <DialogHeader>
            <DialogTitle className="text-white">Enter authentication code</DialogTitle>
            <DialogDescription className="text-white/55">
              We sent a 6 digit code to <span className="text-white/85 font-semibold">{user.email}</span> to confirm
              turning {enabled ? 'off' : 'on'} two-step verification.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            <TwoFACodeInput value={code} onChange={(v) => { setCode(v); setError(''); }} disabled={busy} hasError={!!error} testPrefix="profile-twofa" />
            {error && <p data-testid="profile-twofa-error" className="mt-3 text-center text-[12.5px] text-red-400">{error}</p>}
            <div className="text-center mt-3">
              <button type="button" onClick={resend} data-testid="profile-twofa-resend"
                      className="text-[12.5px] font-semibold text-[#14b877] hover:underline">Resend code</button>
            </div>
            <button onClick={confirm} disabled={busy || code.length < 6} data-testid="profile-twofa-confirm"
                    className="w-full mt-4 rounded-xl bg-[#14b877] text-black font-bold py-3 text-[14px] hover:bg-[#17cf86] disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {busy ? <><CircleNotch size={16} className="animate-spin" /> Confirming…</> : enabled ? 'Turn off two-step verification' : 'Turn on two-step verification'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
