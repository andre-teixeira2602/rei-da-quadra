import './progress.css'

export default function ProgressBar({ value = 0, label, className = '' }) {
  const raw = Number(value)
  const pct = Number.isFinite(raw) ? (raw > 1 ? Math.max(0, Math.min(100, raw)) : Math.max(0, Math.min(1, raw)) * 100) : 0

  return (
    <div className={`rqProgress ${className}`.trim()} aria-label={label}>
      <div className="rqProgressTrack">
        <div className="rqProgressFill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

