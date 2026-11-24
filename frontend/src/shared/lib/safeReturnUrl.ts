/** Accept only local navigation targets, including after switching auth forms. */
export function safeReturnUrl(value: string | null): string | null {
  if (!value?.startsWith('/') || /^\/[\\/]/.test(value)) return null;
  try {
    return new URL(value, window.location.origin).origin === window.location.origin ? value : null;
  } catch {
    return null;
  }
}
