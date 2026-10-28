import { useEffect, useRef } from 'react';

// Native <dialog> gives us focus trapping, Escape to close and a backdrop for free.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Keep it',
  onConfirm,
  onCancel,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      onCancel={onCancel}
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
    >
      <h3 id="confirm-title">{title}</h3>
      <p id="confirm-message" className="muted">
        {message}
      </p>
      <div className="confirm-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="btn-danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
