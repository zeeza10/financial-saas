import { useId, useState } from 'react';

export interface SeriesConfig {
  key: string;
  label: string;
  color: string;
}

export interface ChartDataPoint {
  label: string;
  [seriesKey: string]: string | number;
}

function formatCompactMoney(major: number, currency: string): string {
  const abs = Math.abs(major);
  const sign = major < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${abs.toFixed(0)} ${currency}`;
}

export function AreaLineChart({
  data,
  series,
  currency,
  formatValue,
  height = 230,
}: {
  data: ChartDataPoint[];
  series: SeriesConfig[];
  currency: string;
  formatValue: (major: number) => string;
  height?: number;
}) {
  const uid = useId().replace(/:/g, '');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 620;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const allVals: number[] = [];
  for (const pt of data) {
    for (const s of series) {
      allVals.push(Number(pt[s.key] ?? 0));
    }
  }
  const minRaw = Math.min(0, ...allVals);
  const maxRaw = Math.max(1, ...allVals);
  const span = maxRaw - minRaw || 1;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => minRaw + t * span);

  const xFor = (i: number) =>
    data.length <= 1 ? padL + plotW / 2 : padL + (i / (data.length - 1)) * plotW;
  const yFor = (val: number) => padT + plotH - ((val - minRaw) / span) * plotH;
  const baselineY = yFor(0);

  const activePoint = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div className="lc-svg-chart-wrap" onMouseLeave={() => setHoverIdx(null)}>
      <div className="lc-legend-row">
        {series.map((s) => (
          <span key={s.key} className="lc-legend-item">
            <span className="lc-legend-dot" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <div className="lc-svg-stage">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="lc-svg-chart"
          role="img"
          aria-label={series.map((s) => s.label).join(' vs ')}
        >
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`grad-${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
              </linearGradient>
            ))}
          </defs>

          {yTicks.map((tv, i) => {
            const y = yFor(tv);
            return (
              <g key={i}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke={tv === 0 ? '#cbd5e1' : '#e2e8f0'}
                  strokeDasharray={tv === 0 ? undefined : '3 3'}
                  strokeWidth="1"
                />
                <text
                  x={padL - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="10.5"
                  fill="#64748b"
                  className="lc-svg-tick"
                >
                  {formatCompactMoney(tv, currency)}
                </text>
              </g>
            );
          })}

          {series.map((s) => {
            const coords = data.map((pt, i) => ({
              x: xFor(i),
              y: yFor(Number(pt[s.key] ?? 0)),
            }));
            if (coords.length === 0) return null;
            const linePath = coords
              .map((c, idx) => `${idx === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
              .join(' ');
            const areaPath =
              coords.length >= 2
                ? `${linePath} L${coords[coords.length - 1]!.x.toFixed(1)},${baselineY.toFixed(1)} L${coords[0]!.x.toFixed(1)},${baselineY.toFixed(1)} Z`
                : '';

            return (
              <g key={s.key}>
                {areaPath && <path d={areaPath} fill={`url(#grad-${uid}-${s.key})`} />}
                {coords.length >= 2 && (
                  <path
                    d={linePath}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {coords.map((c, idx) => (
                  <circle
                    key={idx}
                    cx={c.x}
                    cy={c.y}
                    r={hoverIdx === idx ? 5 : 3.2}
                    fill={hoverIdx === idx ? s.color : '#ffffff'}
                    stroke={s.color}
                    strokeWidth="2"
                  />
                ))}
              </g>
            );
          })}

          {hoverIdx !== null && (
            <line
              x1={xFor(hoverIdx)}
              y1={padT}
              x2={xFor(hoverIdx)}
              y2={padT + plotH}
              stroke="#94a3b8"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          )}

          {data.map((pt, i) => {
            const x = xFor(i);
            const colW = data.length <= 1 ? plotW : plotW / data.length;
            return (
              <g key={pt.label}>
                <text
                  x={x}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#64748b"
                >
                  {pt.label}
                </text>
                <rect
                  x={x - colW / 2}
                  y={padT}
                  width={colW}
                  height={plotH + 16}
                  fill="transparent"
                  style={{ cursor: 'crosshair' }}
                  onMouseEnter={() => setHoverIdx(i)}
                  onFocus={() => setHoverIdx(i)}
                  tabIndex={0}
                  aria-label={`${pt.label}: ${series.map((s) => `${s.label} ${formatValue(Number(pt[s.key] ?? 0))}`).join(', ')}`}
                />
              </g>
            );
          })}
        </svg>

        {activePoint && (
          <div className="lc-chart-tooltip">
            <div className="lc-tooltip-title">{activePoint.label}</div>
            {series.map((s) => (
              <div key={s.key} className="lc-tooltip-row">
                <span className="lc-legend-item">
                  <span className="lc-legend-dot" style={{ backgroundColor: s.color }} />
                  {s.label}
                </span>
                <strong className="mono-num">{formatValue(Number(activePoint[s.key] ?? 0))}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function GroupedBarChart({
  data,
  series,
  currency,
  formatValue,
  height = 230,
}: {
  data: ChartDataPoint[];
  series: SeriesConfig[];
  currency: string;
  formatValue: (major: number) => string;
  height?: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const width = 620;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const allVals: number[] = [];
  for (const pt of data) {
    for (const s of series) {
      allVals.push(Number(pt[s.key] ?? 0));
    }
  }
  const minRaw = Math.min(0, ...allVals);
  const maxRaw = Math.max(1, ...allVals);
  const span = maxRaw - minRaw || 1;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => minRaw + t * span);
  const yFor = (val: number) => padT + plotH - ((val - minRaw) / span) * plotH;
  const zeroY = yFor(0);

  const groupW = plotW / Math.max(1, data.length);
  const barAreaW = Math.min(groupW * 0.72, series.length * 28);
  const barW = Math.max(8, (barAreaW - (series.length - 1) * 4) / Math.max(1, series.length));

  const activePoint = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div className="lc-svg-chart-wrap" onMouseLeave={() => setHoverIdx(null)}>
      <div className="lc-legend-row">
        {series.map((s) => (
          <span key={s.key} className="lc-legend-item">
            <span className="lc-legend-dot" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <div className="lc-svg-stage">
        <svg viewBox={`0 0 ${width} ${height}`} className="lc-svg-chart" role="img" aria-label="Grouped comparison chart">
          {yTicks.map((tv, i) => {
            const y = yFor(tv);
            return (
              <g key={i}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke={tv === 0 ? '#cbd5e1' : '#e2e8f0'}
                  strokeDasharray={tv === 0 ? undefined : '3 3'}
                />
                <text x={padL - 8} y={y + 3.5} textAnchor="end" fontSize="10.5" fill="#64748b">
                  {formatCompactMoney(tv, currency)}
                </text>
              </g>
            );
          })}

          {data.map((pt, gi) => {
            const centerX = padL + gi * groupW + groupW / 2;
            const totalW = series.length * barW + (series.length - 1) * 4;
            const startX = centerX - totalW / 2;
            const isActive = hoverIdx === gi;

            return (
              <g key={pt.label}>
                {isActive && (
                  <rect
                    x={padL + gi * groupW + 2}
                    y={padT}
                    width={Math.max(0, groupW - 4)}
                    height={plotH}
                    rx="6"
                    fill="#f1f5f9"
                  />
                )}
                {series.map((s, si) => {
                  const val = Number(pt[s.key] ?? 0);
                  const valY = yFor(val);
                  const barY = Math.min(zeroY, valY);
                  const barH = Math.max(2, Math.abs(zeroY - valY));
                  return (
                    <rect
                      key={s.key}
                      x={startX + si * (barW + 4)}
                      y={barY}
                      width={barW}
                      height={barH}
                      rx="4"
                      fill={s.color}
                      opacity={hoverIdx === null || isActive ? 0.95 : 0.45}
                    />
                  );
                })}
                <text x={centerX} y={height - 8} textAnchor="middle" fontSize="11" fill="#64748b">
                  {pt.label}
                </text>
                <rect
                  x={padL + gi * groupW}
                  y={padT}
                  width={groupW}
                  height={plotH + 20}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoverIdx(gi)}
                  onFocus={() => setHoverIdx(gi)}
                  tabIndex={0}
                />
              </g>
            );
          })}
        </svg>

        {activePoint && (
          <div className="lc-chart-tooltip">
            <div className="lc-tooltip-title">{activePoint.label}</div>
            {series.map((s) => (
              <div key={s.key} className="lc-tooltip-row">
                <span className="lc-legend-item">
                  <span className="lc-legend-dot" style={{ backgroundColor: s.color }} />
                  {s.label}
                </span>
                <strong className="mono-num">{formatValue(Number(activePoint[s.key] ?? 0))}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

const PALETTE = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6'];

export function pickSliceColor(index: number): string {
  return PALETTE[index % PALETTE.length]!;
}

export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  formatValue,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  centerValue: string;
  formatValue: (major: number) => string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);

  const size = 180;
  const stroke = 24;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let cumulative = 0;

  return (
    <div className="lc-donut-layout">
      <div className="lc-donut-ring">
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={centerLabel}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#f1f5f9"
            strokeWidth={stroke}
          />
          {slices.map((slice, idx) => {
            const val = Math.max(0, slice.value);
            const pct = total > 0 ? val / total : 0;
            const dash = pct * circ;
            const offset = -cumulative * circ;
            cumulative += pct;
            const isHovered = hoverIdx === idx;
            return (
              <circle
                key={slice.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={slice.color}
                strokeWidth={isHovered ? stroke + 4 : stroke}
                strokeDasharray={`${dash} ${circ}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ cursor: 'pointer', transition: 'stroke-width 0.15s ease, opacity 0.15s ease' }}
                opacity={hoverIdx === null || isHovered ? 1 : 0.4}
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
              />
            );
          })}
        </svg>
        <div className="lc-donut-center">
          <div className="lc-donut-center-label">
            {hoverIdx !== null ? slices[hoverIdx]?.label : centerLabel}
          </div>
          <div className="lc-donut-center-val">
            {hoverIdx !== null ? formatValue(slices[hoverIdx]?.value ?? 0) : centerValue}
          </div>
        </div>
      </div>

      <div className="lc-donut-legend">
        {slices.map((s, idx) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <div
              key={s.label}
              className={`lc-donut-legend-row ${hoverIdx === idx ? 'active' : ''}`}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <div className="lc-legend-item">
                <span className="lc-legend-dot" style={{ backgroundColor: s.color }} />
                <span className="lc-donut-name">{s.label}</span>
              </div>
              <div className="lc-donut-nums">
                <span className="muted">{pct.toFixed(1)}%</span>
                <strong className="mono-num">{formatValue(s.value)}</strong>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HorizontalBarList({
  items,
  formatValue,
}: {
  items: Array<{ label: string; sublabel?: string; value: number; color?: string }>;
  formatValue: (major: number) => string;
}) {
  const maxAbs = Math.max(1, ...items.map((i) => Math.abs(i.value)));

  return (
    <div className="lc-hbar-list">
      {items.map((item, idx) => {
        const pct = Math.max(3, Math.round((Math.abs(item.value) / maxAbs) * 100));
        const barColor = item.color ?? pickSliceColor(idx);
        return (
          <div key={item.label} className="lc-hbar-item">
            <div className="lc-hbar-head">
              <div>
                <span className="lc-hbar-label">{item.label}</span>
                {item.sublabel && <span className="lc-hbar-sub"> · {item.sublabel}</span>}
              </div>
              <strong className="mono-num">{formatValue(item.value)}</strong>
            </div>
            <div className="lc-hbar-track">
              <div
                className="lc-hbar-fill"
                style={{ width: `${pct}%`, backgroundColor: barColor }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
