import React, { useState } from 'react';
import { 
  ResponsiveContainer, BarChart, Bar, LineChart, Line, 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, Cell, PieChart, Pie, Legend
} from 'recharts';
import { ChevronUp, ChevronDown, BarChart3, PieChart as PieIcon, LineChart as LineIcon, Activity, Maximize2, Minimize2 } from 'lucide-react';

/**
 * ReportChartSection Component
 * 
 * Props:
 * @param {Array} data - The chart data [{ name, value, value2, label }]
 * @param {string} type - 'bar' | 'line' | 'area' | 'pie'
 * @param {Array} series - [{ key, name, color, type }] for multi-series
 * @param {Function} onSegmentClick - Callback when clicking a chart element
 * @param {string} title - Chart title
 * @param {boolean} isLoading - Loading state
 */

const ReportChartSection = ({ 
  data = [], 
  type = 'bar', 
  series = [{ key: 'value', name: 'Value', color: '#6366f1' }],
  onSegmentClick = () => {},
  title = "Analytical Projection",
  isLoading = false
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeSegment, setActiveSegment] = useState(null);

  const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

  const formatCurrency = (val) => {
    if (val >= 100000) return `₹ ${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `₹ ${(val / 1000).toFixed(1)}k`;
    return `₹ ${val}`;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-ink-primary border border-white/10 p-4 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <p className="text-[10px] font-black uppercase text-white/50 mb-2 tracking-widest">{label || payload[0].payload.name}</p>
          <div className="space-y-1">
            {payload.map((entry, index) => (
              <div key={index} className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-xs font-bold text-white uppercase">{entry.name}:</span>
                </div>
                <span className="text-sm font-black text-accent-signature tabular-nums">
                  {typeof entry.value === 'number' ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(entry.value) : entry.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    if (isLoading) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center gap-4 animate-pulse">
          <Activity size={48} className="text-accent-signature opacity-20" />
          <div className="h-4 w-32 bg-canvas rounded-full" />
        </div>
      );
    }

    if (data.length === 0) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center gap-4 opacity-20">
          <BarChart3 size={48} />
          <p className="text-[10px] font-black uppercase tracking-widest">Awaiting Numerical Input</p>
        </div>
      );
    }

    const commonProps = {
      data,
      margin: { top: 20, right: 20, left: -20, bottom: 0 },
      onClick: (e) => {
        if (e && e.activePayload) {
          const payload = e.activePayload[0].payload;
          setActiveSegment(payload.name);
          onSegmentClick(payload);
        }
      }
    };

    switch (type) {
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={120}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
              animationBegin={0}
              animationDuration={1500}
            >
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={COLORS[index % COLORS.length]} 
                  className="transition-all hover:opacity-80 active:scale-95 cursor-pointer outline-none"
                  stroke={activeSegment === entry.name ? '#000' : 'none'}
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }} />
          </PieChart>
        );

      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={formatCurrency} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(0,0,0,0.05)', strokeWidth: 2 }} />
            {series.map(s => (
              <Line 
                key={s.key} 
                type="monotone" 
                dataKey={s.key} 
                name={s.name} 
                stroke={s.color} 
                strokeWidth={3} 
                dot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: s.color }} 
                activeDot={{ r: 6, strokeWidth: 0, fill: s.color }} 
              />
            ))}
          </LineChart>
        );

      case 'area':
        return (
          <AreaChart {...commonProps}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={i} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={s.color} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={s.color} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={formatCurrency} />
            <Tooltip content={<CustomTooltip />} />
            {series.map(s => (
              <Area 
                key={s.key} 
                type="monotone" 
                dataKey={s.key} 
                name={s.name} 
                stroke={s.color} 
                strokeWidth={2} 
                fillOpacity={1} 
                fill={`url(#grad-${s.key})`} 
              />
            ))}
          </AreaChart>
        );

      default:
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={formatCurrency} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
            {series.map((s, i) => (
              <Bar 
                key={s.key} 
                dataKey={s.key} 
                name={s.name} 
                fill={s.color} 
                radius={[6, 6, 0, 0]} 
                barSize={32}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={activeSegment === entry.name ? '#000' : s.color} 
                    className="transition-all hover:opacity-80 cursor-pointer active:scale-95"
                  />
                ))}
              </Bar>
            ))}
          </BarChart>
        );
    }
  };

  return (
    <div className={`transition-all duration-500 ease-in-out no-print ${isCollapsed ? 'mb-2' : 'mb-6'}`}>
      <div className="bg-white rounded-[2.5rem] border border-black/5 shadow-sm overflow-hidden flex flex-col">
        
        {/* Header Toggle */}
        <div 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-6 flex justify-between items-center cursor-pointer hover:bg-canvas/40 transition-colors border-b border-black/5"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-ink-primary text-accent-signature flex items-center justify-center shadow-lg">
              {type === 'pie' ? <PieIcon size={20} /> : type === 'line' ? <LineIcon size={20} /> : <BarChart3 size={20} />}
            </div>
            <div className="flex flex-col gap-0.5">
              <h3 className="text-xl font-black font-sora text-ink-primary uppercase tracking-tighter leading-none">
                {title}<span className="text-accent-signature">.</span>
              </h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Statistical Visualization</p>
            </div>
          </div>
          <button className="w-10 h-10 rounded-full border border-black/5 flex items-center justify-center hover:bg-canvas transition-all text-ink-primary">
            {isCollapsed ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </button>
        </div>

        {/* Chart Body */}
        {!isCollapsed && (
          <div className="p-8 h-[380px] w-full animate-in slide-in-from-top-4 duration-500">
            <ResponsiveContainer width="100%" height="100%">
              {renderChart()}
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportChartSection;
