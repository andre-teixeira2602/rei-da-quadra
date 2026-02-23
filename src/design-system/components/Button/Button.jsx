import './button.css'

export function Button({ variant = 'primary', className = '', ...props }) {
  return <button {...props} className={`rqBtn rqBtn-${variant} ${className}`.trim()} />
}

export function ClayButton(props) {
  return <Button {...props} variant="primary" />
}

export function SecondaryButton(props) {
  return <Button {...props} variant="secondary" />
}

export default Button

