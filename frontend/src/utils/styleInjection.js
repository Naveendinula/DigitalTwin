export const ensureStyleInjected = (id, cssText) => {
  if (typeof document === 'undefined') return
  if (id && document.getElementById(id)) return

  const styleSheet = document.createElement('style')
  if (id) {
    styleSheet.id = id
  }
  styleSheet.textContent = cssText
  document.head.appendChild(styleSheet)
}
