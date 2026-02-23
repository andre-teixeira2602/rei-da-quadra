export default function TopBar({ title, rightSlot, onBack, sticky = true }) {
  return (
    <div className={`topBar ${sticky ? 'topBarSticky' : ''}`}>
      {onBack ? (
        <button type="button" className="iconButton" onClick={onBack} aria-label="Voltar">
          ←
        </button>
      ) : null}
      <h1 className="topBarTitle" style={{ flex: 1 }}>
        {title}
      </h1>
      {rightSlot ? <div>{rightSlot}</div> : null}
    </div>
  )
}

