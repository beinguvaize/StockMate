import React from 'react';
import { Figures, FigureTile, SectionTitle } from './frame';

// Shared presentational bits for the light reports, now drawn with the
// report frame (web redesign). Call sites are unchanged.

export const SectionHead = ({ title, sub }) => <SectionTitle title={title} sub={sub} />;

/**
 * StatStrip: a row of grey figure tiles.
 *
 *   <StatStrip items={[
 *     { label: 'Revenue',      value: '₹1,71,554' },
 *     { label: 'Gross profit', value: '₹24,897', tone: 'pos' },  // pos | neg | amber
 *   ]} loading={loading} />
 */
export const StatStrip = ({ items = [], loading = false }) => {
  const n = items.length;
  const cols = n >= 5 ? 5 : n === 3 ? 3 : n === 2 ? 2 : 4;
  return (
    <Figures cols={cols} className="mb-0">
      {items.map((it) => (
        <FigureTile key={it.label} label={it.label} value={it.value} sub={it.sub} tone={it.tone} loading={loading} />
      ))}
    </Figures>
  );
};

/**
 * KPI: a single grey figure tile (`<KPI label value loading />`). icon and
 * color are accepted and not painted, as before.
 */
export const KPI = ({ label, value, sub, tone, loading }) => (
  <FigureTile label={label} value={value} sub={sub} tone={tone} loading={loading} />
);
