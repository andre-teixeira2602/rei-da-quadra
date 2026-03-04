import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'

import { countKingDefenses, getPlayerById, getTopActivePlayer, monthKey, swapPositions } from './utils.js'
import { DEFAULT_CATEGORY_ID } from '../config/mvp.js'

const STORAGE_KEY = 'rei-da-quadra:state:v2'
const CATEGORY = 'B'
const DEFAULT_COURT_NAME = 'Quadra Principal'
const DEFAULT_LANG = 'pt-BR'
const SUPPORTED_LANGS = ['pt-BR', 'en', 'es', 'fr']
const KING_MONTHLY_DEFENSE_GOAL = 2

// Detecta o idioma preferido do navegador e mapeia para um idioma suportado.
// Garante que usuários brasileiros comecem em PT-BR automaticamente.
function detectBrowserLang() {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
    for (const l of langs) {
      if (!l) continue
      const lower = l.toLowerCase()
      if (lower.startsWith('pt')) return 'pt-BR'
      if (lower.startsWith('fr')) return 'fr'
      if (lower.startsWith('es')) return 'es'
      if (lower.startsWith('en')) return 'en'
    }
  } catch {
    // fallback silencioso se navigator não estiver disponível
  }
  return DEFAULT_LANG
}

function sortByPosition(players) {
  return [...players].sort((a, b) => a.position - b.position)
}

function makeInitialPlayers() {
  // 12 jogadores, categoria B, com pelo menos 2 inativos.
  // Usuário atual (id 7) começa na posição 8.
  return sortByPosition([
    { id: 1, name: 'Bruno', position: 1, category: CATEGORY, isActive: true },
    { id: 2, name: 'Carla', position: 2, category: CATEGORY, isActive: true },
    { id: 3, name: 'Diego', position: 3, category: CATEGORY, isActive: true },
    { id: 4, name: 'Evelyn', position: 4, category: CATEGORY, isActive: true },
    { id: 5, name: 'Felipe', position: 5, category: CATEGORY, isActive: true },
    { id: 6, name: 'Gabi', position: 6, category: CATEGORY, isActive: false },
    { id: 8, name: 'Hugo', position: 7, category: CATEGORY, isActive: true },
    { id: 7, name: 'Você (mock)', position: 8, category: CATEGORY, isActive: true },
    { id: 9, name: 'Igor', position: 9, category: CATEGORY, isActive: true },
    { id: 10, name: 'Ju', position: 10, category: CATEGORY, isActive: true },
    { id: 11, name: 'Kai', position: 11, category: CATEGORY, isActive: false },
    { id: 12, name: 'Lia', position: 12, category: CATEGORY, isActive: true },
  ])
}

function makeInitialState() {
  const players = makeInitialPlayers()
  const nowIso = new Date().toISOString()
  const top = getTopActivePlayer(players)

  return {
    // “usuário atual” mockado
    currentUserId: getDefaultCurrentUserId(players),
    lang: detectBrowserLang(),
    auth: { isAuthenticated: false, userId: null, email: null },
    selectedCategoryId: DEFAULT_CATEGORY_ID,
    profile: { displayName: null, loaded: false },
    cart: { items: [] }, // [{ productId, qty }]
    courtName: DEFAULT_COURT_NAME,
    kingState: {
      current: top
        ? {
            courtName: DEFAULT_COURT_NAME,
            category: CATEGORY,
            kingPlayerId: top.id,
            sinceAt: nowIso,
          }
        : null,
      history: top
        ? [
            {
              kingPlayerId: top.id,
              courtName: DEFAULT_COURT_NAME,
              category: CATEGORY,
              fromAt: nowIso,
              toAt: nowIso,
              reason: 'promoted',
            },
          ]
        : [],
      lastMonthlyCheck: nowIso,
    },
    players,
    challenges: [],
    matches: [],
  }
}

function getDefaultCurrentUserId(players) {
  // Padrão: jogador da posição 8 (se existir), senão primeiro jogador do ranking.
  const byPos = players.find((p) => p.position === 8)
  if (byPos) return byPos.id
  return players[0]?.id ?? 7
}

function safeLoadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null

    // Validação mínima (mantém app resiliente).
    if (!Array.isArray(parsed.players)) return null
    if (!Array.isArray(parsed.challenges)) return null
    if (!Array.isArray(parsed.matches)) return null

    const players = sortByPosition(parsed.players)
    const candidateCurrentUserId = parsed.currentUserId
    const currentUserId = getPlayerById(players, candidateCurrentUserId)
      ? candidateCurrentUserId
      : getDefaultCurrentUserId(players)

    // Se o idioma salvo for válido, usa-o. Caso contrário, detecta pelo navegador.
    const lang = SUPPORTED_LANGS.includes(parsed.lang) ? parsed.lang : detectBrowserLang()

    // Auth nunca é restaurado do storage – sempre vem do Supabase via AuthBridge.
    const auth = { isAuthenticated: false, userId: null, email: null }

    const selectedCategoryId =
      typeof parsed.selectedCategoryId === 'string' && parsed.selectedCategoryId.trim()
        ? parsed.selectedCategoryId
        : DEFAULT_CATEGORY_ID

    const profile = { displayName: null, loaded: false }

    const cartItems = Array.isArray(parsed.cart?.items) ? parsed.cart.items : []
    const cart = {
      items: cartItems
        .map((it) => ({
          productId: it?.productId,
          qty: Number(it?.qty ?? 0),
        }))
        .filter((it) => it.productId !== undefined && Number.isFinite(it.qty) && it.qty > 0),
    }

    const courtName =
      typeof parsed.courtName === 'string' && parsed.courtName.trim()
        ? parsed.courtName
        : DEFAULT_COURT_NAME

    const loadedKingState = parsed.kingState && typeof parsed.kingState === 'object'
      ? parsed.kingState
      : null

    const baseState = {
      currentUserId,
      lang,
      auth,
      selectedCategoryId,
      profile,
      cart,
      courtName,
      players,
      challenges: parsed.challenges,
      matches: parsed.matches,
      kingState: loadedKingState,
    }

    return runMonthlyKingCheck(initKingStateIfNeeded(baseState))
  } catch {
    return null
  }
}

function initKingStateIfNeeded(state) {
  if (state.kingState && typeof state.kingState === 'object') return state

  const nowIso = new Date().toISOString()
  const top = getTopActivePlayer(state.players ?? [])
  const courtName = state.courtName ?? DEFAULT_COURT_NAME

  return {
    ...state,
    kingState: {
      current: top
        ? { courtName, category: CATEGORY, kingPlayerId: top.id, sinceAt: nowIso }
        : null,
      history: top
        ? [
            {
              kingPlayerId: top.id,
              courtName,
              category: CATEGORY,
              fromAt: nowIso,
              toAt: nowIso,
              reason: 'promoted',
            },
          ]
        : [],
      lastMonthlyCheck: nowIso,
    },
  }
}

function getPreviousMonthKey(nowIso) {
  const d = new Date(nowIso)
  d.setMonth(d.getMonth() - 1)
  return monthKey(d)
}

function runMonthlyKingCheck(state) {
  const kingState = state.kingState
  if (!kingState || typeof kingState !== 'object') return state

  const nowIso = new Date().toISOString()
  const lastIso = typeof kingState.lastMonthlyCheck === 'string' ? kingState.lastMonthlyCheck : nowIso
  const nowKey = monthKey(nowIso)
  const lastKey = monthKey(lastIso)

  // Se já rodou neste mês, apenas garante estrutura.
  if (nowKey === lastKey) {
    return {
      ...state,
      kingState: { ...kingState, lastMonthlyCheck: lastIso },
    }
  }

  const current = kingState.current
  const courtName = current?.courtName ?? state.courtName ?? DEFAULT_COURT_NAME
  const category = current?.category ?? CATEGORY

  // Se não houver rei atual (ou rei inválido), promove o #1 ativo.
  const currentKingPlayerId = current?.kingPlayerId
  const currentKingExists = currentKingPlayerId
    ? Boolean(getPlayerById(state.players, currentKingPlayerId))
    : false

  const prevKey = getPreviousMonthKey(nowIso)

  let nextKingState = { ...kingState, lastMonthlyCheck: nowIso }

  // Caso de correção: rei ausente/inválido.
  if (!current || !currentKingExists) {
    const top = getTopActivePlayer(state.players) // #1 ativo
    if (!top) return { ...state, kingState: nextKingState }

    nextKingState = {
      ...nextKingState,
      current: { courtName, category, kingPlayerId: top.id, sinceAt: nowIso },
      history: [
        {
          kingPlayerId: top.id,
          courtName,
          category,
          fromAt: nowIso,
          toAt: nowIso,
          reason: 'promoted',
        },
        ...(nextKingState.history ?? []),
      ],
    }

    return { ...state, kingState: nextKingState }
  }

  // Verificação do mês anterior: se defesas < meta, perde o título.
  const defensesPrevMonth = countKingDefenses(state.matches, currentKingPlayerId, prevKey, {
    category,
    courtName,
  })

  if (defensesPrevMonth >= KING_MONTHLY_DEFENSE_GOAL) {
    return { ...state, kingState: nextKingState }
  }

  const top = getTopActivePlayer(state.players)
  if (!top) return { ...state, kingState: nextKingState }

  // Se o #1 ativo já é o rei atual, mantemos, mas registramos a checagem.
  if (top.id === currentKingPlayerId) {
    return { ...state, kingState: nextKingState }
  }

  const nextHistory = [
    {
      kingPlayerId: currentKingPlayerId,
      courtName,
      category,
      fromAt: current.sinceAt ?? lastIso,
      toAt: nowIso,
      reason: 'lost_no_defense',
    },
    {
      kingPlayerId: top.id,
      courtName,
      category,
      fromAt: nowIso,
      toAt: nowIso,
      reason: 'promoted',
    },
    ...(nextKingState.history ?? []),
  ]

  nextKingState = {
    ...nextKingState,
    current: { courtName, category, kingPlayerId: top.id, sinceAt: nowIso },
    history: nextHistory,
  }

  return { ...state, kingState: nextKingState }
}

function reducer(state, action) {
  switch (action.type) {
    case 'INIT_FROM_STORAGE': {
      return action.payload ?? state
    }
    case 'INIT_KING_STATE_IF_NEEDED': {
      return initKingStateIfNeeded(state)
    }
    case 'RUN_MONTHLY_KING_CHECK': {
      return runMonthlyKingCheck(initKingStateIfNeeded(state))
    }
    case 'SET_KING_MANUAL': {
      const kingPlayerId = action.payload?.kingPlayerId
      const courtName = action.payload?.courtName ?? state.courtName ?? DEFAULT_COURT_NAME
      const category = action.payload?.category ?? CATEGORY

      if (!getPlayerById(state.players, kingPlayerId)) return state
      const nowIso = new Date().toISOString()

      return {
        ...state,
        kingState: {
          ...(state.kingState ?? {}),
          current: { courtName, category, kingPlayerId, sinceAt: nowIso },
          history: [
            {
              kingPlayerId,
              courtName,
              category,
              fromAt: nowIso,
              toAt: nowIso,
              reason: 'manual',
            },
            ...((state.kingState?.history ?? [])),
          ],
          lastMonthlyCheck: state.kingState?.lastMonthlyCheck ?? nowIso,
        },
      }
    }
    case 'CREATE_CHALLENGE': {
      const c = action.challenge ?? {}
      const challengerId = c.challengerId
      const opponentId = c.opponentId

      const challenger = getPlayerById(state.players, challengerId)
      const opponent = getPlayerById(state.players, opponentId)

      const normalizedChallenge = {
        id: c.id ?? `challenge_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        createdAt: c.createdAt ?? new Date().toISOString(),
        status: c.status ?? 'pending', // "pending" | "accepted" | "awaiting_confirmation" | "completed" | "disputed" | "cancelled"
        challengerId,
        opponentId,
        scheduledAt: c.scheduledAt ?? null,
        courtName: c.courtName ?? null,

        // Confirmação bilateral / auditoria local
        resultProposal: c.resultProposal ?? null, // { proposedById, proposedAt, winnerId, scoreText } | null
        confirmedById: c.confirmedById ?? null,
        confirmedAt: c.confirmedAt ?? null,
        dispute: c.dispute ?? null, // { disputedById, disputedAt, reasonText? } | null
        resultMatchId: c.resultMatchId ?? null,

        // Snapshot para regra de swap (ambos ativos no momento do desafio)
        challengerWasActive: c.challengerWasActive ?? Boolean(challenger?.isActive),
        opponentWasActive: c.opponentWasActive ?? Boolean(opponent?.isActive),
      }

      return { ...state, challenges: [normalizedChallenge, ...state.challenges] }
    }
    case 'CANCEL_CHALLENGE': {
      const { challengeId, cancelledById } = action.payload ?? {}
      return {
        ...state,
        challenges: state.challenges.map((c) => {
          if (c.id !== challengeId) return c
          // Hardening: só pode cancelar se pending e quem cancelou é o challenger.
          if (c.status !== 'pending') return c
          if (cancelledById !== c.challengerId) return c
          return { ...c, status: 'cancelled' }
        }),
      }
    }
    case 'PROPOSE_RESULT': {
      const { challengeId, proposedById, winnerId, scoreText } = action.payload ?? {}
      const idx = state.challenges.findIndex((c) => c.id === challengeId)
      if (idx === -1) return state

      const challenge = state.challenges[idx]
      const isActive = challenge.status === 'pending' || challenge.status === 'accepted'
      if (!isActive) return state

      const isParticipant =
        proposedById === challenge.challengerId || proposedById === challenge.opponentId
      if (!isParticipant) return state

      const winnerIsParticipant =
        winnerId === challenge.challengerId || winnerId === challenge.opponentId
      if (!winnerIsParticipant) return state

      const nextChallenges = [...state.challenges]
      nextChallenges[idx] = {
        ...challenge,
        status: 'awaiting_confirmation',
        resultProposal: {
          proposedById,
          proposedAt: new Date().toISOString(),
          winnerId,
          scoreText: scoreText ?? '',
        },
        confirmedById: null,
        confirmedAt: null,
        dispute: null,
        resultMatchId: null,
      }
      return { ...state, challenges: nextChallenges }
    }
    case 'CONFIRM_RESULT': {
      const { challengeId, confirmedById } = action.payload ?? {}
      const idx = state.challenges.findIndex((c) => c.id === challengeId)
      if (idx === -1) return state

      const challenge = state.challenges[idx]
      if (challenge.status !== 'awaiting_confirmation') return state
      if (!challenge.resultProposal) return state
      if (challenge.resultMatchId) return state

      const isParticipant =
        confirmedById === challenge.challengerId || confirmedById === challenge.opponentId
      if (!isParticipant) return state

      if (confirmedById === challenge.resultProposal.proposedById) return state

      const { winnerId, scoreText } = challenge.resultProposal

      const challenger = getPlayerById(state.players, challenge.challengerId)
      const opponent = getPlayerById(state.players, challenge.opponentId)

      const rankingSwapApplied =
        winnerId === challenge.challengerId &&
        Boolean(challenge.challengerWasActive) &&
        Boolean(challenge.opponentWasActive) &&
        Boolean(challenger) &&
        Boolean(opponent)

      const matchId = `match_${Date.now()}_${Math.random().toString(16).slice(2)}`
      const match = {
        id: matchId,
        playedAt: new Date().toISOString(),
        challengerId: challenge.challengerId,
        opponentId: challenge.opponentId,
        winnerId,
        scoreText: scoreText ?? '',
        category: CATEGORY,
        courtName: challenge.courtName ?? null,
        rankingSwapApplied,
      }

      const nextPlayers = rankingSwapApplied
        ? swapPositions(state.players, challenge.challengerId, challenge.opponentId)
        : state.players

      const nextChallenges = [...state.challenges]
      nextChallenges[idx] = {
        ...challenge,
        status: 'completed',
        confirmedById,
        confirmedAt: new Date().toISOString(),
        resultMatchId: matchId,
      }

      return {
        ...state,
        players: sortByPosition(nextPlayers),
        challenges: nextChallenges,
        matches: [match, ...state.matches],
      }
    }
    case 'DISPUTE_RESULT': {
      const { challengeId, disputedById, reasonText } = action.payload ?? {}
      const idx = state.challenges.findIndex((c) => c.id === challengeId)
      if (idx === -1) return state

      const challenge = state.challenges[idx]
      if (challenge.status !== 'awaiting_confirmation') return state
      if (!challenge.resultProposal) return state
      if (challenge.resultMatchId) return state

      const isParticipant =
        disputedById === challenge.challengerId || disputedById === challenge.opponentId
      if (!isParticipant) return state

      if (disputedById === challenge.resultProposal.proposedById) return state

      const nextChallenges = [...state.challenges]
      nextChallenges[idx] = {
        ...challenge,
        status: 'disputed',
        dispute: {
          disputedById,
          disputedAt: new Date().toISOString(),
          reasonText: reasonText ?? '',
        },
      }
      return { ...state, challenges: nextChallenges }
    }
    case 'COMPLETE_CHALLENGE': {
      const { challengeId, match } = action.payload
      return {
        ...state,
        challenges: state.challenges.map((c) =>
          c.id === challengeId ? { ...c, status: 'completed' } : c,
        ),
        matches: [match, ...state.matches],
      }
    }
    case 'UPDATE_PLAYERS': {
      return { ...state, players: sortByPosition(action.players) }
    }
    case 'SET_CURRENT_USER': {
      const raw = action.payload?.userId
      const userId = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
      if (!getPlayerById(state.players, userId)) return state
      return { ...state, currentUserId: userId }
    }
    case 'SET_LANG': {
      const next = action.payload?.lang
      if (!SUPPORTED_LANGS.includes(next)) return state
      return { ...state, lang: next }
    }
    case 'SET_SELECTED_CATEGORY': {
      const id = action.payload?.categoryId
      if (typeof id !== 'string' || !id.trim()) return state
      return { ...state, selectedCategoryId: id }
    }
    case 'SET_PROFILE': {
      const displayName = action.payload?.displayName
      const loaded = Boolean(action.payload?.loaded)
      return {
        ...state,
        profile: {
          displayName: typeof displayName === 'string' ? displayName : null,
          loaded,
        },
      }
    }
    case 'LOGIN': {
      const userEmail = action.payload?.userEmail
      if (typeof userEmail !== 'string') return state
      return { ...state, auth: { isAuthenticated: true, userEmail } }
    }
    case 'LOGOUT': {
      return { ...state, auth: { isAuthenticated: false, userEmail: '' } }
    }
    case 'SET_SESSION': {
      const { isAuthenticated, userId, email } = action.payload ?? {}
      return {
        ...state,
        auth: {
          isAuthenticated: Boolean(isAuthenticated),
          userId: userId ?? null,
          email: email ?? null,
        },
      }
    }    
    case 'CART_ADD_ITEM': {
      const { productId } = action.payload ?? {}
      if (productId === undefined || productId === null) return state
      const nextItems = [...state.cart.items]
      const idx = nextItems.findIndex((it) => it.productId === productId)
      if (idx === -1) nextItems.push({ productId, qty: 1 })
      else nextItems[idx] = { ...nextItems[idx], qty: nextItems[idx].qty + 1 }
      return { ...state, cart: { items: nextItems } }
    }
    case 'CART_REMOVE_ITEM': {
      const { productId } = action.payload ?? {}
      const nextItems = state.cart.items.filter((it) => it.productId !== productId)
      return { ...state, cart: { items: nextItems } }
    }
    case 'CART_SET_QTY': {
      const { productId, qty } = action.payload ?? {}
      const nextQty = Number(qty)
      if (!Number.isFinite(nextQty)) return state
      const nextItems = state.cart.items
        .map((it) => (it.productId === productId ? { ...it, qty: nextQty } : it))
        .filter((it) => it.qty > 0)
      return { ...state, cart: { items: nextItems } }
    }
    case 'CART_CLEAR': {
      return { ...state, cart: { items: [] } }
    }
    case 'RESET_DEMO': {
      return makeInitialState()
    }
    default:
      return state
  }
}

const AppStateContext = createContext(null)
const AppActionsContext = createContext(null)

export function AppStateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const fromStorage = safeLoadFromStorage()
    const initial = fromStorage ?? makeInitialState()
    // Bootstrap: garante kingState e roda checagem mensal quando virar o mês.
    return runMonthlyKingCheck(initKingStateIfNeeded(initial))
  })

  // Persistência: salva a cada mudança relevante. Auth não é persistido (vem do Supabase).
  useEffect(() => {
    try {
      const { auth: _auth, ...rest } = state
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rest))
    } catch {
      // Se storage estiver indisponível/cheio, seguimos sem persistir.
    }
  }, [state])

  const actions = useMemo(() => {
    function initFromStorage(payload) {
      dispatch({ type: 'INIT_FROM_STORAGE', payload })
    }

    function createChallenge(challenge) {
      dispatch({ type: 'CREATE_CHALLENGE', challenge })
    }

    function cancelChallenge({ challengeId, cancelledById }) {
      dispatch({ type: 'CANCEL_CHALLENGE', payload: { challengeId, cancelledById } })
    }

    function completeChallenge({ challengeId, match }) {
      dispatch({ type: 'COMPLETE_CHALLENGE', payload: { challengeId, match } })
    }

    function updatePlayers(players) {
      dispatch({ type: 'UPDATE_PLAYERS', players })
    }

    function setCurrentUser({ userId }) {
      dispatch({ type: 'SET_CURRENT_USER', payload: { userId } })
    }

    function setLang({ lang }) {
      dispatch({ type: 'SET_LANG', payload: { lang } })
    }

    function setSelectedCategory({ categoryId }) {
      dispatch({ type: 'SET_SELECTED_CATEGORY', payload: { categoryId } })
    }

    function setProfile({ displayName, loaded }) {
      dispatch({ type: 'SET_PROFILE', payload: { displayName, loaded } })
    }

    function login({ userEmail }) {
      dispatch({ type: 'LOGIN', payload: { userEmail } })
    }

    function logout() {
      dispatch({ type: 'LOGOUT' })
    }

    function cartAddItem({ productId }) {
      dispatch({ type: 'CART_ADD_ITEM', payload: { productId } })
    }

    function cartRemoveItem({ productId }) {
      dispatch({ type: 'CART_REMOVE_ITEM', payload: { productId } })
    }

    function cartSetQty({ productId, qty }) {
      dispatch({ type: 'CART_SET_QTY', payload: { productId, qty } })
    }

    function cartClear() {
      dispatch({ type: 'CART_CLEAR' })
    }

    function proposeResult({ challengeId, proposedById, winnerId, scoreText }) {
      dispatch({
        type: 'PROPOSE_RESULT',
        payload: { challengeId, proposedById, winnerId, scoreText },
      })
    }

    function confirmResult({ challengeId, confirmedById }) {
      dispatch({ type: 'CONFIRM_RESULT', payload: { challengeId, confirmedById } })
    }

    function disputeResult({ challengeId, disputedById, reasonText }) {
      dispatch({
        type: 'DISPUTE_RESULT',
        payload: { challengeId, disputedById, reasonText },
      })
    }

    function resetDemo() {
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // ignore
      }
      dispatch({ type: 'RESET_DEMO' })
    }

    return {
      initFromStorage,
      initKingStateIfNeeded: () => dispatch({ type: 'INIT_KING_STATE_IF_NEEDED' }),
      runMonthlyKingCheck: () => dispatch({ type: 'RUN_MONTHLY_KING_CHECK' }),
      setKingManual: (payload) => dispatch({ type: 'SET_KING_MANUAL', payload }),
      createChallenge,
      cancelChallenge,
      completeChallenge,
      updatePlayers,
      setCurrentUser,
      setLang,
      setSelectedCategory,
      setProfile,
      login,
      logout,
      setSession: (payload) => dispatch({ type: 'SET_SESSION', payload }),
      cartAddItem,
      cartRemoveItem,
      cartSetQty,
      cartClear,
      proposeResult,
      confirmResult,
      disputeResult,
      resetDemo,
    }
  }, [])

  return (
    <AppStateContext.Provider value={state}>
      <AppActionsContext.Provider value={actions}>
        {children}
      </AppActionsContext.Provider>
    </AppStateContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppState() {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState deve ser usado dentro de <AppStateProvider>.')
  return ctx
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppActions() {
  const ctx = useContext(AppActionsContext)
  if (!ctx) throw new Error('useAppActions deve ser usado dentro de <AppStateProvider>.')
  return ctx
}

