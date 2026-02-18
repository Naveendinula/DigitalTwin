import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiFetch, parseJsonSafe } from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const response = await apiFetch('/auth/me', { skipAuthRefresh: true })
    if (!response.ok) {
      setUser(null)
      return null
    }

    const payload = await parseJsonSafe(response)
    setUser(payload || null)
    return payload
  }, [])

  useEffect(() => {
    let active = true
    const bootstrapTimeout = window.setTimeout(() => {
      if (!active) return
      setUser(null)
      setLoading(false)
    }, 6000)

    ;(async () => {
      try {
        let response = await apiFetch('/auth/me', { skipAuthRefresh: true })
        if (!response.ok && response.status === 401) {
          const refreshResponse = await apiFetch('/auth/refresh', {
            method: 'POST',
            skipAuthRefresh: true,
          })
          if (refreshResponse.ok) {
            response = await apiFetch('/auth/me', { skipAuthRefresh: true })
          }
        }

        const payload = response.ok ? await parseJsonSafe(response) : null
        if (!active) return
        setUser(payload || null)
      } catch {
        if (!active) return
        setUser(null)
      } finally {
        window.clearTimeout(bootstrapTimeout)
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
      window.clearTimeout(bootstrapTimeout)
    }
  }, [])

  const login = useCallback(async ({ email, password }) => {
    const response = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuthRefresh: true,
    })
    const payload = await parseJsonSafe(response)
    if (!response.ok) {
      throw new Error(payload?.detail || 'Unable to sign in')
    }
    setUser(payload?.user || null)
    return payload?.user || null
  }, [])

  const signup = useCallback(async ({ email, password, displayName }) => {
    const response = await apiFetch('/auth/register', {
      method: 'POST',
      body: { email, password, display_name: displayName || '' },
      skipAuthRefresh: true,
    })
    const payload = await parseJsonSafe(response)
    if (!response.ok) {
      throw new Error(payload?.detail || 'Unable to create account')
    }
    setUser(payload?.user || null)
    return payload?.user || null
  }, [])

  const logout = useCallback(async () => {
    await apiFetch('/auth/logout', {
      method: 'POST',
      skipAuthRefresh: true,
    })
    setUser(null)
  }, [])

  const requestPasswordReset = useCallback(async (email) => {
    const response = await apiFetch('/auth/password-reset-request', {
      method: 'POST',
      body: { email },
      skipAuthRefresh: true,
    })
    const payload = await parseJsonSafe(response)
    if (!response.ok) {
      throw new Error(payload?.detail || 'Unable to request password reset')
    }
    return payload?.message || ''
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated: Boolean(user),
    login,
    signup,
    logout,
    refreshUser,
    requestPasswordReset,
  }), [user, loading, login, signup, logout, refreshUser, requestPasswordReset])

  return createElement(AuthContext.Provider, { value }, children)
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
