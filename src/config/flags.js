// Feature flags: protocolo anti-fraude (confirmação dupla) é o PADRÃO.
// Só usa o fluxo legado (confirmar na hora, sem o outro jogador) se
// VITE_LEGACY_MATCH_FLOW=true (ex.: rollback de emergência).

export const ANTI_FRAUD_V1_ENABLED = import.meta.env.VITE_LEGACY_MATCH_FLOW !== 'true'

