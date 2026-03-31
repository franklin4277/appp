import { memo } from "react";

const ToastStack = ({ toasts = [], onDismiss }) => {
  if (!toasts.length) {
    return null;
  }

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <article
          key={toast.id}
          className={`toast-item ${toast.type === "error" ? "toast-item-error" : toast.type === "success" ? "toast-item-success" : ""}`}
          role="status"
        >
          <p>{toast.message}</p>
          <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
            x
          </button>
        </article>
      ))}
    </div>
  );
};

export default memo(ToastStack);

