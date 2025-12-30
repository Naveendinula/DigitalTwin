const appStyles = {
  appContainer: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#f5f5f7',
  },
  header: {
    height: '60px',
    background: '#ffffff',
    borderBottom: '1px solid #e5e5e7',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    zIndex: 100,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoIcon: {
    fontSize: '20px',
    color: '#1d1d1f',
  },
  logoText: {
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '1.5px',
    color: '#1d1d1f',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
  },
  viewerContainer: {
    flex: 1,
    position: 'relative',
    margin: '16px',
    marginLeft: '0',
    marginRight: '0',
    borderRadius: '12px',
    overflow: 'hidden',
    background: '#f0f0f2',
  },
}

export default appStyles
