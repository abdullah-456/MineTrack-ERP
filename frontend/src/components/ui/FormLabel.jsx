/** Label for form fields. Pass `required` only for fields the business flow cannot proceed without. */
export default function FormLabel({ children, required, className = '', variant = 'default' }) {
  const variantClass = {
    default: 'text-xs font-medium mb-1 block',
    semibold: 'text-xs font-semibold mb-1.5 block',
    admin: 'form-label',
    login: 'block text-sm font-medium mb-2',
  }[variant] || 'text-xs font-medium mb-1 block';

  return (
    <label
      className={[variantClass, className].filter(Boolean).join(' ')}
      style={variant === 'admin' || variant === 'login' ? undefined : { color: 'var(--text-secondary)' }}
    >
      {children}
      {required && <span className="text-red-400 ms-0.5" aria-hidden="true">*</span>}
    </label>
  );
}
