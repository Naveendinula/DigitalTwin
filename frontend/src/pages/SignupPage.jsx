import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
}

export default function SignupPage() {
  const navigate = useNavigate()
  const { signup } = useAuth()

  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signup({ email, password, displayName })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Unable to create account')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Create account</h1>
        <p style={styles.subtitle}>Set up your local Digital Twin login.</p>

        <form style={styles.form} onSubmit={handleSubmit}>
          <div>
            <div style={styles.label}>Display name (optional)</div>
            <input
              style={styles.input}
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              maxLength={120}
            />
          </div>

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
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.button} disabled={submitting}>
            {submitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div style={styles.helper}>
          Already have an account?{' '}
          <Link style={styles.link} to="/login">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
