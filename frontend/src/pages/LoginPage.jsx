import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f4f4f4',
    padding: '24px',
    color: '#1d1d1f',
    fontFamily: 'inherit',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    background: '#f4f4f4',
    borderRadius: '16px',
    padding: '28px',
    boxShadow:
      'rgb(255,255,255) 1px 1px 1px 0px inset, rgba(0,0,0,0.12) -1px -1px 1px 0px inset, rgba(0,0,0,0.14) 2px 2px 8px -2px',
    border: '1px solid rgba(0,0,0,0.05)',
  },
  heading: {
    margin: '0 0 8px 0',
    fontSize: '24px',
    fontWeight: 700,
    letterSpacing: '-0.3px',
  },
  subtitle: {
    margin: '0 0 20px 0',
    color: '#86868b',
    fontSize: '13px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  label: {
    fontSize: '12px',
    color: '#86868b',
    marginBottom: '4px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid rgba(0,0,0,0.08)',
    background: '#ffffff',
    fontSize: '14px',
    color: '#1d1d1f',
    boxSizing: 'border-box',
    outline: 'none',
  },
  button: {
    marginTop: '6px',
    padding: '10px 12px',
    border: 'none',
    borderRadius: '10px',
    background: '#0071e3',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryButton: {
    marginTop: '6px',
    padding: '8px 10px',
    border: 'none',
    borderRadius: '10px',
    background: 'rgba(0,0,0,0.06)',
    color: '#1d1d1f',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  error: {
    margin: '4px 0 0 0',
    padding: '8px 10px',
    borderRadius: '8px',
    background: 'rgba(255,59,48,0.12)',
    color: '#a3201c',
    fontSize: '12px',
  },
  helper: {
    marginTop: '14px',
    color: '#86868b',
    fontSize: '12px',
  },
  link: {
    color: '#0071e3',
    textDecoration: 'none',
    fontWeight: 600,
  },
  status: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#347e37',
  },
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, requestPasswordReset } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [resetStatus, setResetStatus] = useState('')

  const redirectTo = useMemo(() => {
    const stateFrom = location.state?.from
    return typeof stateFrom === 'string' && stateFrom ? stateFrom : '/'
  }, [location.state])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setResetStatus('')
    setSubmitting(true)
    try {
      await login({ email, password })
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message || 'Unable to sign in')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetStub = async () => {
    if (!email.trim()) {
      setError('Enter your email first to request a reset.')
      return
    }
    setError('')
    setResetStatus('')
    setSubmitting(true)
    try {
      const message = await requestPasswordReset(email)
      setResetStatus(message || 'Reset instructions requested.')
    } catch (err) {
      setError(err.message || 'Unable to request reset')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Sign in</h1>
        <p style={styles.subtitle}>Access your Digital Twin workspace.</p>

        <form style={styles.form} onSubmit={handleSubmit}>
          <div>
            <div style={styles.label}>Email</div>
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              maxLength={320}
            />
          </div>

          <div>
            <div style={styles.label}>Password</div>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              minLength={8}
              maxLength={128}
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}
          {resetStatus && <div style={styles.status}>{resetStatus}</div>}

          <button type="submit" style={styles.button} disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={handleResetStub}
            disabled={submitting}
          >
            Forgot password
          </button>
        </form>

        <div style={styles.helper}>
          No account yet?{' '}
          <Link style={styles.link} to="/signup">
            Create one
          </Link>
        </div>
      </div>
    </div>
  )
}
