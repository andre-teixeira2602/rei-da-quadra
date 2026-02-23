import { useMemo } from 'react'

import { useI18n } from '../i18n/useI18n.js'
import { useAppActions, useAppState } from '../state/AppState.jsx'

const styles = {
  panel: {
    border: '1px solid #e6e6e6',
    borderRadius: 12,
    padding: 12,
    background: '#fff',
    display: 'grid',
    gap: 10,
  },
  titleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  title: { margin: 0, fontSize: 16 },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    border: '1px solid #eee',
    borderRadius: 10,
    padding: '8px 10px',
  },
  left: { minWidth: 0 },
  name: { fontSize: 13, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  meta: { fontSize: 12, opacity: 0.75, marginTop: 2 },
  qtyInput: { width: 56, padding: 6, borderRadius: 8, border: '1px solid #ddd' },
  button: { padding: '6px 10px' },
  subtotal: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  empty: { opacity: 0.75, fontSize: 13 },
}

export default function CartPanel({ products, onCheckout }) {
  const { t } = useI18n()
  const { cart } = useAppState()
  const { cartRemoveItem, cartSetQty, cartClear } = useAppActions()

  const productById = useMemo(() => {
    const map = new Map()
    for (const p of products) map.set(p.id, p)
    return map
  }, [products])

  const subtotal = useMemo(() => {
    return (cart?.items ?? []).reduce((sum, it) => {
      const p = productById.get(it.productId)
      if (!p) return sum
      return sum + p.price * it.qty
    }, 0)
  }, [cart?.items, productById])

  const items = cart?.items ?? []

  return (
    <aside style={styles.panel} aria-label={t('shop.cart')}>
      <div style={styles.titleRow}>
        <h3 style={styles.title}>{t('shop.cart')}</h3>
        {items.length > 0 ? (
          <button type="button" style={styles.button} onClick={() => cartClear()}>
            Limpar
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div style={styles.empty}>Seu carrinho está vazio.</div>
      ) : (
        <ul style={styles.list}>
          {items.map((it) => {
            const p = productById.get(it.productId)
            if (!p) return null

            return (
              <li key={it.productId} style={styles.row}>
                <div style={styles.left}>
                  <p style={styles.name}>{p.name}</p>
                  <div style={styles.meta}>R$ {p.price.toFixed(2)}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number"
                    min={1}
                    value={it.qty}
                    onChange={(e) =>
                      cartSetQty({
                        productId: it.productId,
                        qty: Math.max(0, Number(e.target.value)),
                      })
                    }
                    style={styles.qtyInput}
                    aria-label="Quantidade"
                  />
                  <button
                    type="button"
                    style={styles.button}
                    onClick={() => cartRemoveItem({ productId: it.productId })}
                  >
                    Remover
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div style={styles.subtotal}>
        <span style={{ opacity: 0.75 }}>{t('shop.subtotal')}</span>
        <strong>R$ {subtotal.toFixed(2)}</strong>
      </div>

      <button
        type="button"
        style={styles.button}
        onClick={onCheckout}
        disabled={items.length === 0}
      >
        {t('shop.checkout')}
      </button>
    </aside>
  )
}

