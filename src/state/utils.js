export function getPlayerById(players, id) {
  return players.find((p) => p.id === id) ?? null
}

export function formatPlayerLabel(player) {
  if (!player) return '—'
  return `${player.position}º - ${player.name}`
}

export function monthKey(value) {
  const d = typeof value === 'string' ? new Date(value) : value
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '0000-00'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function getTopActivePlayer(players) {
  // #1 ativo do ranking (menor posição).
  return (
    [...players]
      .sort((a, b) => a.position - b.position)
      .find((p) => p.isActive) ?? null
  )
}

export function countKingDefenses(matches, kingPlayerId, targetMonthKey, opts) {
  const category = opts?.category
  const courtName = opts?.courtName

  return (matches ?? []).reduce((sum, m) => {
    if (!m) return sum
    if (m.winnerId !== kingPlayerId) return sum
    if (category && m.category !== category) return sum
    const mCourt = m.courtName ?? courtName
    if (courtName && mCourt !== courtName) return sum
    if (monthKey(m.playedAt) !== targetMonthKey) return sum
    return sum + 1
  }, 0)
}

export function swapPositions(players, idA, idB) {
  const a = getPlayerById(players, idA)
  const b = getPlayerById(players, idB)
  if (!a || !b) return players

  const next = players.map((p) => {
    if (p.id === a.id) return { ...p, position: b.position }
    if (p.id === b.id) return { ...p, position: a.position }
    return p
  })

  // Mantém consistência: ordena por posição e garante unicidade/intervalo.
  return [...next].sort((x, y) => x.position - y.position)
}

export function formatDate(value) {
  // Mantém simples e previsível. value pode ser ISO string ou Date.
  const d = typeof value === 'string' ? new Date(value) : value
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '—'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d)
}

