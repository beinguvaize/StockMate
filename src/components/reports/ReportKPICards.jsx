import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';

/**
 * ReportKPICards Component
 * 
 * Props:
 * @param {Array} cards - [{ label, value, trend, trendDir, chartData, color, id }]
 * @param {Function} onCardClick - Callback for filtering the table by metric
 * @param {string} activeCardId - The currently active metric ID for filtering
 */

const ReportKPICards = ({ 
  cards = [], 
  onCardClick = () => {}, 
  activeCardId = null 
}) => {
  // Rule 3: Intl.NumberFormat('en-IN') for Indian formatting
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val).replace('₹', '₹ ');
  };

  const formatCompact = (val) => {
    if (val >= 10000000) return `₹ ${(val / 10000000).toFixed(2)}Cr`;
    if (val >= 100000) return `₹ ${(val / 100000).toFixed(2)}L`;
    return formatCurrency(val);
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">
      {cards.map((card, idx) => {
        const isPositive = card.trendDir === 'up';
        const isActive = activeCardId === card.id;

        return (
          <div 
            key={card.id || idx}
            onClick={() => onCardClick(card.id)}
            className={`
              glass-panel !p-6 !rounded-[2.5rem] relative group cursor-pointer transition-all border border-black/5 flex flex-col justify-between overflow-hidden
              ${isActive ? 'bg-ink-primary text-white shadow-2xl scale-[1.02] ring-8 ring-ink-primary/10' : 'bg-white hover:border-black/10 hover:shadow-premium'}
            `}
          >
            {/* Background Glow */}
            <div className={`absolute top-0 right-0 w-32 h-32 blur-3xl opacity-10 transition-opacity group-hover:opacity-20 pointer-events-none -mr-16 -mt-16 bg-${card.color || 'blue'}-500`} />

            <div className="relative z-10">
              <div className="flex justify-between items-start mb-4">
                <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-white/60' : 'text-gray-400'}`}>
                  {card.label}
                </span>
                <div className={`
                  flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black
                  ${isActive ? 'bg-white/10 text-white' : isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}
                `}>
                  {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {card.trend}%
                </div>
              </div>

              <div className="group/value relative mb-6">
                <h3 className="text-3xl lg:text-4xl font-black font-sora tracking-tighter leading-none truncate">
                  {typeof card.value === 'number' ? formatCompact(card.value) : card.value}
                </h3>
                {/* Rule 3: Full value in tooltip on hover */}
                {typeof card.value === 'number' && card.value > 100000 && (
                  <div className="absolute top-full left-0 mt-2 px-3 py-1.5 bg-ink-primary text-white text-[10px] font-bold rounded-lg opacity-0 pointer-events-none group-hover/value:opacity-100 transition-opacity z-50 shadow-2xl whitespace-nowrap border border-white/10">
                    {formatCurrency(card.value)}
                  </div>
                )}
              </div>
            </div>

            {/* Sparkline (Rule 4) */}
            <div className="h-16 w-full -mx-4 -mb-4 opacity-80 group-hover:opacity-100 transition-opacity overflow-hidden rounded-b-[2.5rem]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={card.chartData || []}>
                  <defs>
                    <linearGradient id={`grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isPositive ? '#10b981' : '#ef4444'} stopOpacity={0.4}/>
                      <stop offset="95%" stopColor={isPositive ? '#10b981' : '#ef4444'} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke={isPositive ? '#10b981' : '#ef4444'} 
                    strokeWidth={2.5}
                    fillOpacity={1} 
                    fill={`url(#grad-${idx})`} 
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Active Indicator Pin */}
            {isActive && (
              <div className="absolute top-4 left-4 w-2 h-2 rounded-full bg-accent-signature animate-pulse" />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ReportKPICards;
