import React from 'react';

// Static, professional backdrop for auth screens — subtle curved lines with node dots (desktop only).
const STROKE = 'rgba(20,184,119,0.16)';
const NODE_FILL = '#071510';
const NODE_STROKE = 'rgba(20,184,119,0.35)';

const Node = ({ cx, cy, r = 7 }) => (
  <circle cx={cx} cy={cy} r={r} fill={NODE_FILL} stroke={NODE_STROKE} strokeWidth="1.5" />
);

const AuthBackdrop = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden hidden lg:block" aria-hidden="true">
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" fill="none">
      {/* large arc — top left */}
      <path d="M-100,520 C180,140 620,-40 1050,-120" stroke={STROKE} strokeWidth="1.5" />
      {/* vertical-ish line, left side */}
      <path d="M170,-40 C150,320 190,700 320,1120" stroke={STROKE} strokeWidth="1.5" />
      {/* large arc — right side */}
      <path d="M1380,-80 C1500,280 1620,560 1920,760" stroke={STROKE} strokeWidth="1.5" />
      {/* sweeping arc — bottom right */}
      <path d="M1920,300 C1700,520 1560,820 1520,1120" stroke={STROKE} strokeWidth="1.5" />
      {/* horizontal line — top */}
      <path d="M-40,120 L560,96 L1120,10" stroke={STROKE} strokeWidth="1.5" />
      {/* horizontal line — bottom left */}
      <path d="M-60,880 L420,910 L760,1060" stroke={STROKE} strokeWidth="1.5" />

      {/* node dots on line intersections / bends */}
      <Node cx={170} cy={160} />
      <Node cx={158} cy={470} r={6} />
      <Node cx={250} cy={905} />
      <Node cx={560} cy={96} r={6} />
      <Node cx={905} cy={-2} r={5} />
      <Node cx={1495} cy={330} />
      <Node cx={1620} cy={640} r={6} />
      <Node cx={1560} cy={960} />
      <Node cx={420} cy={910} r={5} />
      <Node cx={720} cy={128} r={5} />
    </svg>

    {/* soft vignette so the form always stays readable */}
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(760px 520px at 50% 45%, rgba(4,13,9,0.5) 0%, rgba(4,13,9,0.25) 55%, transparent 78%)',
      }}
    />
  </div>
);

export default AuthBackdrop;
