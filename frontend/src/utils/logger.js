export const isDebugEnabled = () => {
  if (typeof window === 'undefined') return false
  if (typeof window.__DT_DEBUG__ !== 'undefined') {
    return Boolean(window.__DT_DEBUG__)
  }
  try {
    return window.localStorage?.getItem('dt_debug') === '1'
  } catch (err) {
    return false
  }
}

export const debugLog = (...args) => {
  if (isDebugEnabled()) {
    console.log(...args)
  }
}

export const debugWarn = (...args) => {
  if (isDebugEnabled()) {
    console.warn(...args)
  }
}
