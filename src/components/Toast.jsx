const ICONS = {
  success: 'M5 12.5l4.2 4.2L19 7',
  error: 'M7 7l10 10M17 7L7 17',
  info: 'M12 8v.01M12 11v6',
};

export default function Toast({ message, type, visible }) {
  return (
    <div className={`toast ${type} ${visible ? 'show' : ''}`} role="status" aria-live="polite">
      <svg className="toast-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d={ICONS[type] || ICONS.info} />
      </svg>
      <span>{message}</span>
    </div>
  );
}
