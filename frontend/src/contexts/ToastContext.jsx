import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext({
  showToast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
  warning: () => {},
});

const TOAST_CONFIG = {
  success: {
    icon: 'check_circle',
    classes: 'border-emerald-200 bg-white text-emerald-950 shadow-emerald-950/10',
    iconClasses: 'bg-emerald-100 text-emerald-700',
    progressClasses: 'bg-emerald-500',
  },
  error: {
    icon: 'error',
    classes: 'border-red-200 bg-white text-red-950 shadow-red-950/10',
    iconClasses: 'bg-red-100 text-red-700',
    progressClasses: 'bg-red-500',
  },
  warning: {
    icon: 'warning',
    classes: 'border-amber-200 bg-white text-amber-950 shadow-amber-950/10',
    iconClasses: 'bg-amber-100 text-amber-700',
    progressClasses: 'bg-amber-500',
  },
  info: {
    icon: 'info',
    classes: 'border-blue-200 bg-white text-blue-950 shadow-blue-950/10',
    iconClasses: 'bg-blue-100 text-[#0040a1]',
    progressClasses: 'bg-[#0040a1]',
  },
};

function Toast({ toast, onDismiss }) {
  const config = TOAST_CONFIG[toast.type] || TOAST_CONFIG.info;
  const role = toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status';

  return (
    <div
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      className={`toast-enter pointer-events-auto relative w-full overflow-hidden rounded-2xl border p-4 pr-11 shadow-xl ${config.classes}`}
    >
      <div className="flex items-start gap-3">
        <span className={`material-symbols-outlined flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[21px] ${config.iconClasses}`} style={{ fontVariationSettings: "'FILL' 1" }}>
          {config.icon}
        </span>
        <div className="min-w-0 pt-0.5">
          {toast.title && <p className="text-[14px] font-bold leading-5">{toast.title}</p>}
          <p className={`text-[13px] leading-5 ${toast.title ? 'mt-0.5 opacity-75' : 'font-semibold'}`}>{toast.message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="absolute right-3 top-3 rounded-lg p-1 text-[#737785] transition-colors hover:bg-black/5 hover:text-[#1a1c1e] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0040a1]"
        aria-label="Cerrar notificación"
      >
        <span className="material-symbols-outlined block text-[19px]">close</span>
      </button>
      {toast.duration > 0 && (
        <div className={`toast-progress absolute bottom-0 left-0 h-1 ${config.progressClasses}`} style={{ animationDuration: `${toast.duration}ms` }} />
      )}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const timers = useRef(new Map());

  const dismissToast = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const showToast = useCallback(({ message, title, type = 'info', duration = 5000 }) => {
    const id = ++nextId.current;
    const toast = { id, message, title, type, duration };
    setToasts(current => [...current, toast].slice(-4));
    if (duration > 0) timers.current.set(id, setTimeout(() => dismissToast(id), duration));
    return id;
  }, [dismissToast]);

  const value = {
    showToast,
    success: (message, options = {}) => showToast({ ...options, message, type: 'success' }),
    error: (message, options = {}) => showToast({ ...options, message, type: 'error' }),
    info: (message, options = {}) => showToast({ ...options, message, type: 'info' }),
    warning: (message, options = {}) => showToast({ ...options, message, type: 'warning' }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3 sm:right-6 sm:top-6" aria-label="Notificaciones">
        {toasts.map(toast => <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}