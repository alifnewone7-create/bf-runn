import React from 'react';
import { TRUST_METRICS } from '../mock/mock';

const Stats = () => (
  <section className="border-y border-white/5 bg-white/[0.015]" data-testid="stats-section">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 grid grid-cols-2 lg:grid-cols-4 gap-8">
      {TRUST_METRICS.map((m) => (
        <div key={m.label} className="text-center lg:text-left">
          <div className="text-3xl font-bold font-display text-white">{m.value}</div>
          <div className="mt-1.5 text-sm lux-muted">{m.label}</div>
        </div>
      ))}
    </div>
  </section>
);

export default Stats;
