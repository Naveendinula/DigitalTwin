import React, { useState, useEffect, useCallback } from 'react'

/**
 * Toast Component
 * 
 * Displays a subtle notification message that auto-dismisses.
 * 
 * @param {string} message - The message to display
 * @param {string} type - 'info' | 'warning' | 'error' | 'success'
 * @param {number} duration - How long to show the toast (ms)
 * @param {function} onDismiss - Callback when toast is dismissed
 */
function Toast({ message, type = 'info', duration = 3000, onDismiss }) {
  const [visible, setVisible] = useState(true)
  const [exiting, setExiting] = useState(false)

  const dismiss = useCallback(() => {
    setExiting(true)
    setTimeout(() => {
      setVisible(false)
      onDismiss?.()
    }, 200)
  }, [onDismiss])

  useEffect(() => {
    const timer = setTimeout(dismiss, duration)
    return () => clearTimeout(timer)
  }, [duration, dismiss])

  if (!visible) return null

  const typeStyles = {
    info: {
      background: 'rgba(0, 122, 255, 0.95)',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      )
    },
    warning: {
      background: 'rgba(255, 159, 10, 0.95)',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )
    },
    error: {
      background: 'rgba(255, 59, 48, 0.95)',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      )
    },
    success: {
      background: 'rgba(52, 199, 89, 0.95)',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      )
    }
  }

  const { background, icon } = typeStyles[type] || typeStyles.info

  return (
    <div
      style={{
        ...styles.toast,
        background,
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'translateX(100%)' : 'translateX(0)',
      }}
      onClick={dismiss}
    >
      <span style={styles.icon}>{icon}</span>
      <span style={styles.message}>{message}</span>
      <button style={styles.closeBtn} onClick={dismiss}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

/**
 * ToastContainer Component
 * 
 * Manages multiple toasts and provides a hook-like interface.
 */
export function ToastContainer({ toasts = [], onRemove }) {
  return (
    <div style={styles.container}>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onDismiss={() => onRemove?.(toast.id)}
        />
      ))}
    </div>
  )
}

/**
 * Custom hook for managing toasts
 */
export function useToast() {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type, duration }])
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const clearToasts = useCallback(() => {
    setToasts([])
  }, [])

  return {
    toasts,
    showToast,
    removeToast,
    clearToasts,
    ToastContainer: () => <ToastContainer toasts={toasts} onRemove={removeToast} />
  }
}

const styles = {
  container: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'none',
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    borderRadius: '8px',
    color: '#ffffff',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 500,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    transition: 'all 0.2s ease-out',
    pointerEvents: 'auto',
    cursor: 'pointer',
    maxWidth: '320px',
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  message: {
    flex: 1,
    lineHeight: 1.4,
  },
  closeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.2)',
    border: 'none',
    borderRadius: '4px',
    padding: '4px',
    color: '#ffffff',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.15s',
  },
}

export default Toast
