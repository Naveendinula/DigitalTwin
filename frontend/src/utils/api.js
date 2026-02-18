const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 12000)

const NO_REFRESH_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/password-reset-request',
])

let refreshPromise = null

function buildApiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path
  if (path.startsWith('/')) return `${API_BASE_URL}${path}`
  return `${API_BASE_URL}/${path}`
}

function getPathname(path) {
  if (/^https?:\/\//i.test(path)) {
    try {
      return new URL(path).pathname
    } catch {
      return path
    }
  }
  return path.startsWith('/') ? path : `/${path}`
}

export function getCookie(name) {
  const prefix = `${name}=`
  const parts = document.cookie ? document.cookie.split('; ') : []
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length))
    }
  }
  return ''
}

function shouldAttachCsrf(method) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method)
}

function buildHeaders(method, existingHeaders, body) {
  const headers = new Headers(existingHeaders || {})

  if (shouldAttachCsrf(method)) {
    const csrfToken = getCookie('csrf_token')
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken)
    }
  }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  if (body && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return headers
}

function buildRequestInit(options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const bodyInput = options.body
  const headers = buildHeaders(method, options.headers, bodyInput)
  const isFormData = typeof FormData !== 'undefined' && bodyInput instanceof FormData
  const body = bodyInput && !isFormData && typeof bodyInput !== 'string'
    ? JSON.stringify(bodyInput)
    : bodyInput

  return {
    ...options,
    method,
    headers,
    body,
    credentials: 'include',
  }
}

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const timeoutEnabled = Number.isFinite(timeoutMs) && timeoutMs > 0
  const hasOwnSignal = Boolean(options.signal)
  const controller = !hasOwnSignal ? new AbortController() : null
  let timeoutId = null

  try {
    const requestInit = buildRequestInit({
      ...options,
      signal: options.signal || controller?.signal,
    })

    if (timeoutEnabled && controller) {
      timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
    }

    return await fetch(url, requestInit)
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Request timed out. Check that backend is running on http://localhost:8000.')
    }
    throw error
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId)
    }
  }
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshResponse = await fetchWithTimeout(
        buildApiUrl('/auth/refresh'),
        { method: 'POST' }
      )
      return refreshResponse.ok
    })().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

export async function apiFetch(path, options = {}) {
  const url = buildApiUrl(path)
  const pathname = getPathname(path)
  const skipAuthRefresh = Boolean(options.skipAuthRefresh)

  let response = await fetchWithTimeout(url, options)

  if (
    response.status === 401
    && !skipAuthRefresh
    && !NO_REFRESH_PATHS.has(pathname)
  ) {
    const refreshed = await refreshSession()
    if (refreshed) {
      response = await fetchWithTimeout(url, options)
    }
  }

  return response
}

export async function parseJsonSafe(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}
