import appStyles from '../constants/appStyles'
import GlobalSearch from './GlobalSearch'

const logoutButtonStyle = {
  border: 'none',
  borderRadius: '8px',
  padding: '8px 10px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  background: '#e8e8ec',
  color: '#1d1d1f',
  boxShadow: 'inset 1px 1px 1px rgba(255,255,255,0.9), inset -1px -1px 1px rgba(0,0,0,0.08)',
}

const userNameStyle = {
  fontSize: '12px',
  color: '#86868b',
  maxWidth: '200px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export default function AppHeader({
  filename,
  ifcSchema,
  metadataUrl,
  onGlobalSearchSelect,
  authUserLabel,
  onLogout,
  logoutPending = false,
}) {
  return (
    <header style={appStyles.header}>
      <div style={appStyles.logo}>
        <span style={appStyles.logoText}>Digital twin</span>
      </div>
      {metadataUrl && (
        <div style={appStyles.headerCenter}>
          <div style={appStyles.headerSearchSlot}>
            <GlobalSearch metadataUrl={metadataUrl} onSelectResult={onGlobalSearchSelect} />
          </div>
        </div>
      )}
      <div style={appStyles.headerRight}>
        {filename && (
          <div style={appStyles.fileInfo}>
            <span style={appStyles.fileName}>{filename}</span>
            {ifcSchema && <span style={appStyles.fileSchema}>{ifcSchema}</span>}
          </div>
        )}
        {authUserLabel && (
          <span style={userNameStyle} title={authUserLabel}>
            {authUserLabel}
          </span>
        )}
        {onLogout && (
          <button
            style={logoutButtonStyle}
            type="button"
            onClick={onLogout}
            disabled={logoutPending}
          >
            {logoutPending ? 'Signing out...' : 'Sign out'}
          </button>
        )}
      </div>
    </header>
  )
}
