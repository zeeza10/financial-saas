import { useEffect, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Inbox,
  Info,
  X,
} from 'lucide-react';

export interface ToastItem {
  id: string;
  title: string;
  detail?: string;
  tone: 'success' | 'error' | 'info';
}

export function ToastHost({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="lc-toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`lc-toast lc-toast-${t.tone}`}>
          <div className="lc-toast-icon" aria-hidden="true">
            {t.tone === 'success' ? (
              <CheckCircle2 size={17} />
            ) : t.tone === 'error' ? (
              <AlertTriangle size={17} />
            ) : (
              <Info size={17} />
            )}
          </div>
          <div className="lc-toast-body">
            <div className="lc-toast-title">{t.title}</div>
            {t.detail && <div className="lc-toast-detail">{t.detail}</div>}
          </div>
          <button
            type="button"
            className="lc-icon-btn"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(t.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';

export function StatusBadge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return <span className={`lc-badge lc-badge-${tone}`}>{children}</span>;
}

export function badgeToneForStatus(status: string): BadgeTone {
  const s = status.toLowerCase();
  if (
    s === 'posted' ||
    s === 'open' ||
    s === 'active' ||
    s === 'paid' ||
    s === 'settled' ||
    s === 'completed' ||
    s === 'business'
  ) {
    return 'success';
  }
  if (
    s === 'draft' ||
    s === 'partial' ||
    s === 'partially_settled' ||
    s === 'in_progress' ||
    s === 'ready' ||
    s === 'accrued'
  ) {
    return 'warning';
  }
  if (s === 'duplicate_held' || s === 'reversed' || s === 'removed' || s === 'cancelled') {
    return 'danger';
  }
  if (s === 'personal') return 'warning';
  return 'neutral';
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="lc-empty-state">
      <div className="lc-empty-icon" aria-hidden="true">
        {icon ?? <Inbox size={20} />}
      </div>
      <div className="lc-empty-title">{title}</div>
      <p className="lc-empty-desc">{description}</p>
      {actionLabel && onAction && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function Sparkline({
  values,
  color = '#4f46e5',
}: {
  values: number[];
  color?: string;
}) {
  if (values.length < 2) return null;
  const width = 96;
  const height = 28;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, idx) => {
    const x = pad + (idx / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return { x, y };
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${path} L${pts[pts.length - 1]!.x.toFixed(1)},${height} L${pts[0]!.x.toFixed(1)},${height} Z`;
  const gradId = `spark-${color.replace('#', '')}-${values.length}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="lc-sparkline"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface KpiCardProps {
  label: string;
  value: string;
  sublabel?: string;
  icon: ReactNode;
  accent?: 'indigo' | 'emerald' | 'rose' | 'amber' | 'slate';
  deltaPct?: number | null;
  deltaLabel?: string;
  invertDeltaColor?: boolean;
  sparkValues?: number[];
  featured?: boolean;
}

export function KpiCard({
  label,
  value,
  sublabel,
  icon,
  accent = 'indigo',
  deltaPct,
  deltaLabel = 'vs prior month',
  invertDeltaColor = false,
  sparkValues,
  featured = false,
}: KpiCardProps) {
  const hasDelta = typeof deltaPct === 'number' && Number.isFinite(deltaPct);
  const isPositive = (deltaPct ?? 0) >= 0;
  const goodDelta = invertDeltaColor ? !isPositive : isPositive;
  const sparkColor =
    accent === 'emerald'
      ? '#059669'
      : accent === 'rose'
        ? '#e11d48'
        : accent === 'amber'
          ? '#d97706'
          : '#4f46e5';

  return (
    <article className={`lc-kpi-card ${featured ? 'lc-kpi-featured' : ''} lc-kpi-${accent}`}>
      <div className="lc-kpi-top">
        <span className="lc-kpi-label">{label}</span>
        <span className={`lc-kpi-icon lc-kpi-icon-${accent}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="lc-kpi-value">{value}</div>
      <div className="lc-kpi-bottom">
        <div className="lc-kpi-meta">
          {hasDelta ? (
            <span className={`lc-delta ${goodDelta ? 'lc-delta-up' : 'lc-delta-down'}`}>
              {isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {Math.abs(deltaPct).toFixed(1)}% {deltaLabel}
            </span>
          ) : sublabel ? (
            <span className="lc-kpi-sub">{sublabel}</span>
          ) : null}
        </div>
        {sparkValues && sparkValues.length >= 2 && (
          <Sparkline values={sparkValues} color={sparkColor} />
        )}
      </div>
    </article>
  );
}

export function ChartCard({
  title,
  subtitle,
  rightSlot,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`lc-card lc-chart-card ${className}`}>
      <header className="lc-card-head">
        <div>
          <h3 className="lc-card-title">{title}</h3>
          {subtitle && <p className="lc-card-sub">{subtitle}</p>}
        </div>
        {rightSlot && <div className="lc-card-actions">{rightSlot}</div>}
      </header>
      <div className="lc-chart-body">{children}</div>
    </section>
  );
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="lc-modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="lc-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lc-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lc-modal-head">
          <h3 id="lc-modal-title" style={{ margin: 0 }}>
            {title}
          </h3>
          <button
            type="button"
            className="lc-icon-btn"
            aria-label="Close dialog"
            onClick={onCancel}
          >
            <X size={16} />
          </button>
        </div>
        {description && <p className="muted" style={{ marginTop: '0.4rem' }}>{description}</p>}
        {children}
        <div className="lc-modal-foot">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="lc-skeleton-grid" aria-label="Loading dashboard metrics">
      <div className="lc-kpi-grid-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="lc-skeleton lc-skeleton-kpi" />
        ))}
      </div>
      <div className="lc-charts-grid-2">
        <div className="lc-skeleton lc-skeleton-chart" />
        <div className="lc-skeleton lc-skeleton-chart" />
      </div>
    </div>
  );
}

export function calcPctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}
