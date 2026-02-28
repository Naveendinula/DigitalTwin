import React from 'react'
import {
  LeafIcon,
  FanIcon,
  GraphIcon,
  ValidationIcon,
  WorkOrdersIcon,
  ChatIcon,
  ChartIcon,
  SidebarRightIcon,
} from './ViewerIcons'
import { ensureStyleInjected } from '../utils/styleInjection'

/**
 * Icon lookup for each panel key.
 */
const PANEL_ICONS = {
  properties:       (props) => <SidebarRightIcon size={18} {...props} />,
  ec:               (props) => <LeafIcon size={18} {...props} />,
  hvac:             (props) => <FanIcon size={18} {...props} />,
  graph:            (props) => <GraphIcon size={18} {...props} />,
  'ids-validation': (props) => <ValidationIcon size={18} {...props} />,
  'work-orders':    (props) => <WorkOrdersIcon size={18} {...props} />,
  'llm-chat':       (props) => <ChatIcon size={18} {...props} />,
  occupancy:        (props) => <ChartIcon size={18} {...props} />,
}

const PANEL_LABELS = {
  properties:       'Properties',
  ec:               'Embodied Carbon',
  hvac:             'HVAC / FM',
  graph:            'Graph Query',
  'ids-validation': 'IDS Validation',
  'work-orders':    'Work Orders',
  'llm-chat':       'Ask AI',
  occupancy:        'Occupancy',
}

/**
 * RightSidebar Component
 *
 * Vertical icon strip on the right edge showing icons for opened panels.
 * Active docked panel is highlighted (orange LED); floating panels get a blue LED.
 * Hover reveals a close (×) button to remove the panel from the sidebar.
 */
function RightSidebar({ openPanels, activePanel, floatingPanels = [], dockZoneActive, onToggle, onClose }) {
  if (!openPanels || openPanels.length === 0) return null

  return (
    <div style={{
      ...styles.sidebar,
      ...(dockZoneActive ? styles.sidebarDockHighlight : {}),
    }}>
      {openPanels.map((key) => {
        const isActive = activePanel === key
        const isFloating = floatingPanels.includes(key)
        const IconFn = PANEL_ICONS[key]
        const label = PANEL_LABELS[key] || key

        let btnStyle = styles.sidebarBtn
        let title = `Show ${label}`
        if (isActive) {
          btnStyle = { ...btnStyle, ...styles.sidebarBtnActive }
          title = `Minimize ${label}`
        } else if (isFloating) {
          btnStyle = { ...btnStyle, ...styles.sidebarBtnFloating }
          title = `Dock ${label}`
        } else {
          btnStyle = { ...btnStyle, ...styles.sidebarBtnDimmed }
        }

        return (
          <div key={key} style={styles.iconWrapper} data-right-sidebar-item>
            <button
              data-sidebar-btn
              onClick={() => onToggle(key)}
              title={title}
              style={btnStyle}
            >
              {IconFn && IconFn()}
              {isActive && <span style={styles.ledIndicator} />}
              {isFloating && <span style={styles.ledIndicatorFloat} />}
            </button>
            <button
              data-right-close-btn
              onClick={(e) => { e.stopPropagation(); onClose(key) }}
              title={`Close ${label}`}
              style={styles.closeBtn}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}

const styles = {
  sidebar: {
    width: '48px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 0',
    background: '#ffffff',
    borderRadius: '12px',
    border: '1px solid rgba(0, 0, 0, 0.04)',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
    overflowY: 'auto',
    overflowX: 'hidden',
    zIndex: 10,
  },
  iconWrapper: {
    position: 'relative',
  },
  sidebarBtn: {
    width: '36px',
    height: '36px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    borderRadius: '10px',
    border: 'none',
    background: 'transparent',
    color: '#4b4b4f',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    position: 'relative',
    padding: 0,
    flexShrink: 0,
  },
  sidebarBtnActive: {
    background: '#eaeaea',
    color: '#1d1d1f',
    boxShadow:
      'inset 0.5px 0.5px 1px #fff, inset -0.5px -0.5px 1px #00000026, 0.222px 0.222px 0.314px -0.5px #0003',
  },
  sidebarBtnDimmed: {
    opacity: 0.45,
  },
  sidebarBtnFloating: {
    opacity: 0.85,
  },
  ledIndicator: {
    display: 'block',
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: '#ff6b35',
    position: 'absolute',
    bottom: '2px',
    left: '50%',
    transform: 'translateX(-50%)',
  },
  ledIndicatorFloat: {
    display: 'block',
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: '#3b82f6',
    position: 'absolute',
    bottom: '2px',
    left: '50%',
    transform: 'translateX(-50%)',
  },
  sidebarDockHighlight: {
    borderColor: 'rgba(59, 130, 246, 0.5)',
    boxShadow: '0 0 12px rgba(59, 130, 246, 0.25), 0 0 4px rgba(59, 130, 246, 0.15)',
  },
  closeBtn: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    border: '1px solid rgba(0,0,0,0.1)',
    background: '#f1f1f3',
    color: '#86868b',
    fontSize: '11px',
    lineHeight: '14px',
    textAlign: 'center',
    cursor: 'pointer',
    padding: 0,
    opacity: 0,
    transition: 'opacity 0.15s ease',
    zIndex: 2,
  },
}

const rightSidebarStyles = `
  [data-right-sidebar-item]:hover [data-right-close-btn] {
    opacity: 1 !important;
  }
  [data-right-close-btn]:hover {
    background: #e0e0e2 !important;
    color: #1d1d1f !important;
  }
`
ensureStyleInjected('right-sidebar-styles', rightSidebarStyles)

export default RightSidebar
