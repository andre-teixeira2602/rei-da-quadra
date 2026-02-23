## Rei da Quadra — Design System v1

Este design system foca em **premium + competitivo + gamificado**, com um “toque tênis” moderado.
Ele não muda fluxos/lógica do produto — apenas **identidade visual, hierarquia e componentes base**.

### Princípios
- **Arena, não SaaS**: fundo dark navy, superfícies em hard-court blue, contraste alto.
- **Status primeiro**: posição, progresso e risco devem aparecer antes de listas/inputs.
- **Recompensa sutil**: glow e micro-motion são curtos, discretos e respeitam `prefers-reduced-motion`.
- **Tennis accents com moderação**:
  - **Clay**: ações primárias (CTA)
  - **Grass**: sucesso/vitória/progresso
  - **Neon**: elite/#1/rei (raramente)

### Tokens
Arquivos:
- `src/design-system/tokens/tokens.css`
- `src/design-system/tokens/global.css`

Tokens principais:
- **Cores**: `--rq-bg`, `--rq-surface-1`, `--rq-surface-2`, `--rq-border`, `--rq-text`, `--rq-text-muted`,
  `--rq-clay`, `--rq-grass`, `--rq-neon`, `--rq-danger`
- **Radius**: `--rq-r-sm`, `--rq-r-md`, `--rq-r-lg`
- **Spacing**: `--rq-s-1..--rq-s-4` (escala 8px)
- **Typo**: `--rq-font`, `--rq-h1`, `--rq-h2`, `--rq-body`, `--rq-caption`, `--rq-score`
- **Motion**: `--rq-ease`, `--rq-dur-1`, `--rq-dur-2`
- **Focus**: `--rq-focus`

### Componentes (React)
Local: `src/design-system/components/`

#### Card
- Arquivos: `Card/Card.jsx`, `Card/card.css`
- Uso:

```jsx
import Card from '@/design-system/components/Card/Card.jsx'

<Card title="Seu status" rightSlot={<span className="rq-muted">#4</span>}>
  Conteúdo
</Card>
```

#### Button
- Arquivos: `Button/Button.jsx`, `Button/button.css`
- Variants:
  - `primary` (clay)
  - `secondary` (outline)

```jsx
import Button, { ClayButton, SecondaryButton } from '@/design-system/components/Button/Button.jsx'
```

#### ProgressBar
- Arquivos: `ProgressBar/ProgressBar.jsx`, `ProgressBar/progress.css`
- `value`: aceita `0..1` ou `0..100`

#### Badge (Rank level)
- Arquivos: `Badge/Badge.jsx`, `Badge/badge.css`
- Levels: `INICIANTE | DESAFIANTE | COMPETIDOR | ELITE | REI`

#### ScoreBox
- Arquivos: `ScoreBox/ScoreBox.jsx`, `ScoreBox/scorebox.css`
- Pode renderizar como `div` ou `input` (`as="input"`)

### Utilitários globais
Em `global.css`:
- `.rq-muted`
- `.rq-container`
- `.rq-grid-gap`

### Do / Don’t
- **Do**: usar `--rq-clay` só para CTA/ações primárias.
- **Do**: usar `--rq-grass` para sucesso/vitória e `ProgressBar`.
- **Do**: usar `--rq-neon` somente para “elite / #1 / rei”.
- **Don’t**: neon em texto longo ou em múltiplos cards na mesma tela.
- **Don’t**: gradientes pesados ou decoração excessiva.

