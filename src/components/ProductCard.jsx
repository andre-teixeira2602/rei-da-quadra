import { useI18n } from '../i18n/useI18n.js'

const styles = {
  card: {
    border: '1px solid #eee',
    borderRadius: 12,
    padding: 12,
    background: '#fff',
    display: 'grid',
    gap: 8,
  },
  titleRow: { display: 'flex', justifyContent: 'space-between', gap: 10 },
  name: { margin: 0, fontSize: 16 },
  meta: { opacity: 0.75, fontSize: 13 },
  buttonRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  button: { padding: '6px 10px' },
  badge: {
    border: '1px solid currentColor',
    borderRadius: 999,
    padding: '2px 8px',
    fontSize: 12,
    opacity: 0.9,
  },
}

export default function ProductCard({ product, onAdd }) {
  const { t } = useI18n()

  return (
    <article style={styles.card}>
      <div style={styles.titleRow}>
        <h3 style={styles.name}>{product.name}</h3>
        <strong>R$ {product.price.toFixed(2)}</strong>
      </div>

      <div style={styles.meta}>{product.shortDescription}</div>
      <div style={styles.meta}>
        {t('shop.category')}: {product.category} · Rating: {product.rating.toFixed(1)} ·{' '}
        {product.inStock ? 'Em estoque' : 'Sem estoque'}
      </div>

      <div style={styles.buttonRow}>
        {product.inStock ? (
          <button type="button" style={styles.button} onClick={() => onAdd(product.id)}>
            {t('shop.addToCart')}
          </button>
        ) : (
          <span style={{ ...styles.badge, opacity: 0.65 }}>Indisponível</span>
        )}
      </div>
    </article>
  )
}

