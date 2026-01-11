/**
 * App-wide soft-ui / tactile design styles
 * Inspired by neumorphism with realistic shadows
 */

// Shared shadow definitions for soft-ui effect
const softShadow = `
  rgb(255, 255, 255) 1px 1px 1px 0px inset,
  rgba(0, 0, 0, 0.12) -1px -1px 1px 0px inset,
  rgba(0, 0, 0, 0.2) 0.444584px 0.444584px 0.628737px -1px,
  rgba(0, 0, 0, 0.18) 1.21072px 1.21072px 1.71222px -1.5px,
  rgba(0, 0, 0, 0.15) 2.6583px 2.6583px 3.75941px -2.25px,
  rgba(0, 0, 0, 0.1) 5.90083px 5.90083px 8.34503px -3px,
  rgba(0, 0, 0, 0.04) 10px 10px 21.2132px -3.75px,
  -0.5px -0.5px 0 0 rgb(0 0 0 / 5%)
`

const softShadowPressed = `
  inset 0.5px 0.5px 1px #fff, 
  inset -0.5px -0.5px 1px #00000026,
  0.222px 0.222px 0.314px -0.5px #0003,
  0.605px 0.605px 0.856px -1px #0000002e,
  1.329px 1.329px 1.88px -1.5px #00000040,
  2.95px 2.95px 4.172px -2px #0000001a, 
  2.5px 2.5px 3px -2.5px #00000026,
  -0.5px -0.5px 0 0 rgb(0 0 0 / 10%)
`

const monoFont = "'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', 'Courier New', monospace"

const appStyles = {
  appContainer: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#f5f5f5',
    fontFamily: monoFont,
  },
  header: {
    height: '60px',
    background: '#ffffff',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    zIndex: 100,
    margin: '12px 16px 0 16px',
    borderRadius: '12px',
    border: '1px solid rgba(0, 0, 0, 0.04)',
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
    letterSpacing: '0.2px',
    color: '#1d1d1f',
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '13px',
    color: '#86868b',
    fontFamily: monoFont,
  },
  fileName: {
    fontWeight: 500,
    color: '#1d1d1f',
    fontFamily: monoFont,
  },
  fileSchema: {
    background: '#e8e8ec',
    padding: '4px 10px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.5px',
    boxShadow: softShadowPressed,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
    padding: '12px 16px',
    gap: '12px',
  },
  viewerContainer: {
    flex: 1,
    position: 'relative',
    borderRadius: '12px',
    overflow: 'hidden',
    background: '#ffffff',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
    border: '1px solid rgba(0, 0, 0, 0.04)',
  },
  // Shared panel styles
  panel: {
    background: '#ffffff',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: monoFont,
    color: '#1d1d1f',
    flexShrink: 0,
    overflow: 'hidden',
    border: '1px solid rgba(0, 0, 0, 0.04)',
  },
  panelHeader: {
    padding: '16px 20px',
    background: 'transparent',
  },
  panelTitle: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#86868b',
  },
  panelContent: {
    flex: 1,
    overflow: 'auto',
    padding: '0 16px 16px 16px',
  },
  // Card styles for nested content
  card: {
    background: '#f9f9f9',
    borderRadius: '10px',
    padding: '12px',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
    border: '1px solid rgba(0, 0, 0, 0.04)',
  },
  // Tag/badge styles
  tag: {
    display: 'inline-block',
    padding: '4px 10px',
    background: '#e8e8ec',
    color: '#1d1d1f',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: 600,
    boxShadow: softShadowPressed,
  },
  tagActive: {
    background: '#ff6b35',
    color: '#ffffff',
  },
  // Subtle panel toggle buttons
  panelToggle: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '24px',
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f1f1f3',
    border: '1px solid rgba(0, 0, 0, 0.16)',
    borderRadius: '0 8px 8px 0',
    cursor: 'pointer',
    color: '#4b4b4f',
    zIndex: 50,
    transition: 'all 0.2s ease',
    boxShadow: '2px 0 10px rgba(0, 0, 0, 0.12)',
    opacity: 0.85,
  },
  panelToggleLeft: {
    left: 0,
    borderRadius: '0 8px 8px 0',
  },
  panelToggleRight: {
    right: 0,
    borderRadius: '8px 0 0 8px',
    boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.06)',
    borderLeft: '1px solid rgba(0, 0, 0, 0.08)',
    borderRight: 'none',
  },
  panelToggleHidden: {
    opacity: 1,
  },
}

// Inject global soft-ui styles
if (typeof document !== 'undefined' && !document.querySelector('#soft-ui-global-styles')) {
  const styleSheet = document.createElement('style')
  styleSheet.id = 'soft-ui-global-styles'
  styleSheet.textContent = `
    /* Global soft-ui styles */
    :root {
      --soft-bg: #e8e8ec;
      --soft-surface: #f4f4f4;
      --soft-shadow: ${softShadow};
      --soft-shadow-pressed: ${softShadowPressed};
      --primary-color: #ff6b35;
    }

    body {
      font-family: ${monoFont};
    }

    button,
    input,
    select,
    textarea {
      font-family: inherit;
    }
    
    /* Custom scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.15);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 0, 0, 0.25);
    }
    
    /* Spin animation */
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `
  document.head.appendChild(styleSheet)
}

// Inject panel toggle hover styles
if (typeof document !== 'undefined' && !document.querySelector('#panel-toggle-hover-styles')) {
  const styleSheet = document.createElement('style')
  styleSheet.id = 'panel-toggle-hover-styles'
  styleSheet.textContent = `
    button[data-panel-toggle]:hover {
      opacity: 1 !important;
      color: #1d1d1f;
      transform: translateY(-50%) scale(1.05);
    }
    button[data-panel-toggle]:active {
      transform: translateY(-50%) scale(0.95);
    }
  `
  document.head.appendChild(styleSheet)
}

export default appStyles
