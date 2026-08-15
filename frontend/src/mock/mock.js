// Mock data for Binary Fund Global (frontend-only)
import {
  Wallet, Crosshair, HandCoins, Bank, ShieldCheck, Timer, Certificate,
  ChartLineUp, LockKey, Lightning, GlobeHemisphereWest, Stack, DeviceMobile,
  Trophy, IdentificationCard, Vault, CurrencyCircleDollar,
  RocketLaunch, Crown, Sparkle, Coins, MedalMilitary
} from '@phosphor-icons/react';

export const BRAND = {
  name: 'Binary Fund Global',
  short: 'BFG',
  tagline: 'Pass the Challenge. Trade Our Capital. Get a Funded Quotex Account.',
};

export const NAV_LINKS = [
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Challenges', href: '#challenges' },
  { label: 'Quotex Payout', href: '#quotex' },
  { label: 'Features', href: '#features' },
  { label: 'FAQ', href: '#faq' },
];

export const HERO_STATS = [
  { value: '$25', label: 'Start from' },
  { value: '$5,000', label: 'Funded up to' },
  { value: '$3,000', label: 'Real Quotex balance' },
  { value: '10,000+', label: 'Active traders' },
];

export const HOW_IT_WORKS = [
  { step: 1, icon: Wallet, title: 'Buy a Challenge', desc: 'Pick Basic, Standard or Premium and pay a one-time fee. No subscription, no monthly costs.' },
  { step: 2, icon: Crosshair, title: 'Hit Your Profit Target', desc: 'Trade your challenge balance and reach the profit target while respecting the daily and max loss rules.' },
  { step: 3, icon: HandCoins, title: 'Get Funded on Quotex', desc: 'Pass and we deposit real balance into a live Quotex account for you to trade — the profit is yours.' },
];

export const CHALLENGES = [
  {
    id: 'basic', name: 'Basic', funded: '$1,000', fee: '$25', quotex: '$500', popular: false, icon: Coins,
    tagline: 'Start your funded journey',
    rules: [
      { label: 'Daily Profit', value: '6%' },
      { label: 'Daily Loss', value: '20%' },
      { label: 'Maximum Loss', value: '40%' },
      { label: 'Profit Target', value: '60%' },
      { label: 'Challenge Duration', value: '13 days' },
      { label: 'Per Trade Amount', value: '2%' },
    ],
  },
  {
    id: 'standard', name: 'Standard', funded: '$2,500', fee: '$50', quotex: '$1,400', popular: true, icon: Crown,
    tagline: 'Best value for serious traders',
    rules: [
      { label: 'Daily Profit', value: '5%' },
      { label: 'Daily Loss', value: '30%' },
      { label: 'Maximum Loss', value: '50%' },
      { label: 'Profit Target', value: '60%' },
      { label: 'Challenge Duration', value: '15 days' },
      { label: 'Per Trade Amount', value: '1.5%' },
    ],
  },
  {
    id: 'premium', name: 'Premium', funded: '$5,000', fee: '$80', quotex: '$3,000', popular: false, icon: MedalMilitary,
    tagline: 'Maximum capital & flexibility',
    rules: [
      { label: 'Daily Profit', value: '4%' },
      { label: 'Daily Loss', value: 'No Limit' },
      { label: 'Maximum Loss', value: '50%' },
      { label: 'Profit Target', value: '65%' },
      { label: 'Challenge Duration', value: '18 days' },
      { label: 'Per Trade Amount', value: '1%' },
    ],
  },
];

export const CHALLENGE_HIGHLIGHTS = [
  { icon: Bank, title: 'Real Quotex balance', desc: 'After passing, we deposit real funds into a live Quotex account — up to $3,000.' },
  { icon: ShieldCheck, title: 'Only the fee is at risk', desc: 'Your only cost is the one-time challenge fee. After that, you trade our capital.' },
  { icon: Timer, title: 'Clear timelines', desc: 'Every challenge has a defined duration and transparent rules — no surprises.' },
  { icon: Certificate, title: 'Certificate on passing', desc: 'Receive a verifiable certificate the moment you complete your challenge.' },
];

export const PLATFORM_FEATURES = [
  { icon: ChartLineUp, title: 'High payouts', desc: 'Trade high-payout binary markets and keep the profits from your funded Quotex account.' },
  { icon: LockKey, title: 'Fixed, capped risk', desc: 'Your maximum loss per trade is always capped at the amount you place — never more.' },
  { icon: Lightning, title: 'Instant settlement', desc: 'Trades settle automatically at expiry and credit your balance in under a second.' },
  { icon: GlobeHemisphereWest, title: '40+ live & OTC markets', desc: 'Trade live forex during sessions, or OTC crypto, commodities and indices 24/7.' },
  { icon: Stack, title: 'Flexible timeframes', desc: 'From 5-second to 1-day expiry — match your tempo and trading style.' },
  { icon: DeviceMobile, title: 'Built for mobile', desc: 'Fully responsive and lag-free on every device — no app install required.' },
];

export const QUOTEX_STEPS = [
  { icon: Trophy, title: 'Pass your challenge', desc: 'Reach the profit target within your rules and duration.' },
  { icon: IdentificationCard, title: 'Account verification', desc: 'Quick KYC to confirm your identity and secure your funds.' },
  { icon: Vault, title: 'Real balance deposited', desc: 'We fund a live Quotex account with real capital for you.' },
  { icon: CurrencyCircleDollar, title: 'Trade & withdraw', desc: 'Trade the live account and withdraw your profits on demand.' },
];

export const TESTIMONIALS = [
  { name: 'Daniel M.', role: 'Funded · Premium', country: 'Ghana', quote: 'Passed the Premium challenge in 12 days. The $3,000 Quotex balance was deposited exactly as promised. This is the real deal.', avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?crop=entropy&cs=srgb&fm=jpg&q=85&w=200' },
  { name: 'Priya S.', role: 'Funded · Standard', country: 'India', quote: 'Clear rules, no hidden fees, and a genuinely funded Quotex account at the end. Support answered every question fast.', avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?crop=entropy&cs=srgb&fm=jpg&q=85&w=200' },
  { name: 'Carlos R.', role: 'Funded · Basic', country: 'Mexico', quote: 'Started with the $25 Basic challenge just to test it. Ended up funded and withdrawing profits. Best decision this year.', avatar: 'https://images.unsplash.com/photo-1718209881007-c0ecdfc00f9d?crop=entropy&cs=srgb&fm=jpg&q=85&w=200' },
];

export const TRUST_METRICS = [
  { value: '$1.2M+', label: 'Deposited to funded traders' },
  { value: '40+', label: 'Countries served' },
  { value: '98%', label: 'Payout success rate' },
  { value: '<24h', label: 'Avg. funding time' },
];

export const FAQS = [
  { q: 'What is Binary Fund Global?', a: 'Binary Fund Global is a binary options prop firm. You pass a one-time challenge, and once you succeed we deposit real balance into a live Quotex account for you to trade.' },
  { q: 'What exactly do I receive after passing?', a: 'After completing your challenge you receive a real, funded Quotex account with balance deposited by us — $500 (Basic), $1,400 (Standard) or $3,000 (Premium).' },
  { q: 'How do the three challenges differ?', a: 'Basic funds a $1,000 account ($25 fee), Standard funds $2,500 ($50 fee) and Premium funds $5,000 ($80 fee). Each has its own rules for daily profit, loss limits, target and duration.' },
  { q: 'How do I pay for a challenge?', a: 'You pay a single one-time fee. There is no subscription and no monthly cost. (Payment processing will be added in a later step.)' },
  { q: 'Is there a daily loss limit?', a: 'Basic allows up to 20% daily loss, Standard up to 30%, and Premium has no daily-loss limit. All plans respect a maximum overall loss rule.' },
  { q: 'How long do I have to pass?', a: 'Basic runs for 13 days, Standard for 15 days and Premium for 18 days.' },
  { q: 'Can I lose more than the fee?', a: 'No. Binary options are fixed-risk and your only financial risk is the one-time challenge fee. Once funded, you trade with our capital on Quotex.' },
];

export const FOOTER_LINKS = {
  Platform: ['How It Works', 'Challenges', 'Quotex Payout', 'Features'],
  Company: ['About Us', 'Contact', 'Careers', 'Blog'],
  Legal: ['Terms of Service', 'Privacy Policy', 'Risk Disclosure', 'Refund Policy'],
};

export const IMAGES = {
  heroBg: 'https://images.unsplash.com/photo-1710438399422-2fca27686bcd?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600',
  tradingDesk: 'https://images.unsplash.com/photo-1748439281934-2803c6a3ee36?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200',
};
