import { useMemo, useState } from 'react'

import CartPanel from '../components/CartPanel.jsx'
import ProductCard from '../components/ProductCard.jsx'
import { useI18n } from '../i18n/useI18n.js'
import { useAppActions } from '../state/AppState.jsx'

const CATEGORIES = ['Munhequeiras', 'Bolas', 'Cordas', 'Overgrips']

function makeProducts() {
  return [
    {
      id: 'p1',
      name: 'Munhequeira Pro Dry',
      category: 'Munhequeiras',
      price: 39.9,
      shortDescription: 'Absorção alta e confortável para jogos longos.',
      rating: 4.6,
      inStock: true,
    },
    {
      id: 'p2',
      name: 'Munhequeira Classic',
      category: 'Munhequeiras',
      price: 24.9,
      shortDescription: 'Simples, leve e eficaz.',
      rating: 4.2,
      inStock: true,
    },
    {
      id: 'p3',
      name: 'Bola Speed Court (tubo)',
      category: 'Bolas',
      price: 59.9,
      shortDescription: 'Quique consistente e boa durabilidade.',
      rating: 4.5,
      inStock: true,
    },
    {
      id: 'p4',
      name: 'Bola Training Pack',
      category: 'Bolas',
      price: 79.9,
      shortDescription: 'Pacote para treino: custo-benefício.',
      rating: 4.1,
      inStock: false,
    },
    {
      id: 'p5',
      name: 'Corda Spin 1.25',
      category: 'Cordas',
      price: 89.9,
      shortDescription: 'Mais rotação, controle e sensação firme.',
      rating: 4.4,
      inStock: true,
    },
    {
      id: 'p6',
      name: 'Corda Comfort 1.30',
      category: 'Cordas',
      price: 99.9,
      shortDescription: 'Conforto no braço com boa potência.',
      rating: 4.3,
      inStock: true,
    },
    {
      id: 'p7',
      name: 'Overgrip Ultra Tac (3un)',
      category: 'Overgrips',
      price: 34.9,
      shortDescription: 'Pegada firme, troca rápida.',
      rating: 4.7,
      inStock: true,
    },
    {
      id: 'p8',
      name: 'Overgrip Comfort (3un)',
      category: 'Overgrips',
      price: 29.9,
      shortDescription: 'Mais macio e absorvente.',
      rating: 4.4,
      inStock: true,
    },
  ]
}

const styles = {
  page: { display: 'grid', gap: 12 },
  layout: { display: 'grid', gridTemplateColumns: '1fr 320px', gap: 12, alignItems: 'start' },
  left: { display: 'grid', gap: 10 },
  filters: {
    border: '1px solid #e6e6e6',
    borderRadius: 12,
    padding: 12,
    background: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  select: { padding: '6px 10px', borderRadius: 10, border: '1px solid #ddd' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.35)',
    display: 'grid',
    placeItems: 'center',
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: 'min(560px, 100%)',
    background: '#fff',
    border: '1px solid #e6e6e6',
    borderRadius: 12,
    padding: 14,
  },
  button: { padding: '6px 10px' },
}

export default function Loja() {
  const { t } = useI18n()
  const { cartAddItem } = useAppActions()

  const products = useMemo(() => makeProducts(), [])
  const [category, setCategory] = useState('all')
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)

  const filtered = useMemo(() => {
    if (category === 'all') return products
    return products.filter((p) => p.category === category)
  }, [products, category])

  return (
    <section style={styles.page}>
      <header>
        <h2 style={{ margin: 0 }}>{t('shop.title')}</h2>
        <p style={{ margin: '6px 0 0', opacity: 0.75 }}>
          Produtos esportivos mockados para testar carrinho e checkout.
        </p>
      </header>

      <div style={styles.layout}>
        <div style={styles.left}>
          <div style={styles.filters}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ opacity: 0.75, fontSize: 13 }}>{t('shop.category')}</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={styles.select}
                aria-label={t('shop.category')}
              >
                <option value="all">Todos</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.grid}>
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={(productId) => cartAddItem({ productId })} />
            ))}
          </div>
        </div>

        <CartPanel
          products={products}
          onCheckout={() => {
            setIsCheckoutOpen(true)
          }}
        />
      </div>

      {isCheckoutOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Checkout"
          style={styles.modalOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCheckoutOpen(false)
          }}
        >
          <div style={styles.modal}>
            <h3 style={{ margin: 0 }}>{t('shop.checkout')}</h3>
            <p style={{ margin: '8px 0 0', opacity: 0.8 }}>{t('shop.checkoutSoon')}</p>
            <div style={{ marginTop: 12 }}>
              <button type="button" style={styles.button} onClick={() => setIsCheckoutOpen(false)}>
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

