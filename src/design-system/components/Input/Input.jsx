import './input.css'

export default function Input({
  id,
  label,
  helper,
  error,
  className = '',
  inputClassName = '',
  ...props
}) {
  const helperId = id ? `${id}__helper` : undefined
  const errorId = id ? `${id}__error` : undefined
  const describedBy = [error ? errorId : null, helper ? helperId : null].filter(Boolean).join(' ') || undefined

  return (
    <label className={`rqInputField ${className}`.trim()} htmlFor={id}>
      {label ? <span className="rqInputLabel">{label}</span> : null}
      <input
        id={id}
        className={`rqInput ${error ? 'rqInput--error' : ''} ${inputClassName}`.trim()}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {error ? (
        <span id={errorId} className="rqInputError" role="alert">
          {error}
        </span>
      ) : helper ? (
        <span id={helperId} className="rqInputHelper">
          {helper}
        </span>
      ) : null}
    </label>
  )
}

