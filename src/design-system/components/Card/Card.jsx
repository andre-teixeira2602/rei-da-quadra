import './card.css'

export default function Card({ title, rightSlot, children, elevated = false, className = '' }) {
  return (
    <section className={`rqCard ${elevated ? 'rqCardElevated' : ''} ${className}`.trim()}>
      {title || rightSlot ? (
        <header className="rqCardHeader">
          {title ? <h3 className="rqCardTitle">{title}</h3> : <div />}
          {rightSlot ? <div className="rqCardRight">{rightSlot}</div> : null}
        </header>
      ) : null}
      <div className="rqCardBody">{children}</div>
    </section>
  )
}

