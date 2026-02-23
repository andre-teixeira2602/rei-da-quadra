import './badge.css'

const LEVELS = ['INICIANTE', 'DESAFIANTE', 'COMPETIDOR', 'ELITE', 'REI']

export default function Badge({ level = 'INICIANTE', className = '' }) {
  const safe = LEVELS.includes(level) ? level : 'INICIANTE'
  return <span className={`rqBadge rqBadge-${safe} ${className}`.trim()}>{safe}</span>
}

