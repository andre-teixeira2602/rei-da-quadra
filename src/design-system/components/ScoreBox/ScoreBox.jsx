import './scorebox.css'

export default function ScoreBox({
  value,
  state = 'neutral', // 'neutral' | 'win' | 'loss'
  as = 'div', // 'div' | 'input'
  className = '',
  ...props
}) {
  const cls = `rqScoreBox rqScoreBox-${state} ${className}`.trim()
  if (as === 'input') {
    return <input {...props} value={value ?? ''} className={cls} />
  }
  return (
    <div {...props} className={cls}>
      {value ?? '—'}
    </div>
  )
}

