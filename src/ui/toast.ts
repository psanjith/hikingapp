interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
  /** Auto-dismiss after this many ms. Omit to keep it until dismissed or actioned. */
  durationMs?: number;
}

/**
 * Shows a short message at the bottom of the screen, optionally with a button.
 */
export function showToast(message: string, options: ToastOptions = {}): void {
  const region = document.getElementById('toasts');
  if (!region) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');

  const text = document.createElement('span');
  text.textContent = message;
  toast.append(text);

  if (options.actionLabel && options.onAction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = options.actionLabel;
    button.addEventListener('click', () => {
      toast.remove();
      options.onAction?.();
    });
    toast.append(button);
  }

  region.append(toast);
  if (options.durationMs) setTimeout(() => toast.remove(), options.durationMs);
}
