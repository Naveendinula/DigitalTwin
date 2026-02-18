import React, { useState, useEffect, useRef } from 'react'
import { Button, ButtonLED } from './Button'
import {
  BoxIcon,
  ChartIcon,
  CheckIcon,
  ClearIcon,
  FanIcon,
  FitIcon,
  LeafIcon,
  PeopleIcon,
  ResetIcon,
  SectionIcon,
  ValidationIcon,
  WorkOrdersIcon,
  ViewCubeIcon,
  EyeIcon,
  SidebarLeftIcon,
  SidebarRightIcon
} from './ViewerIcons'
import { ensureStyleInjected } from '../utils/styleInjection'

/**
 * ViewerToolbar Component
 * 
 * Toolbar overlay for the 3D viewer with tool buttons.
 * Matches the existing UI aesthetic with clean, minimal design.
 * 
 * @param {boolean} sectionModeEnabled - Whether section mode is currently active
 * @param {function} onToggleSectionMode - Callback to toggle section mode
 * @param {boolean} hasSectionPlane - Whether a section plane is currently active
 * @param {function} onClearSectionPlane - Callback to clear the section plane
 * @param {string} viewMode - Current view mode ('free', 'top', 'front', etc.)
 * @param {function} onSetViewMode - Callback to set view mode
 * @param {Array} availableViews - Array of { mode, label } for available views
 * @param {function} onResetView - Callback to reset view to default perspective
 * @param {function} onFitToModel - Callback to fit camera to model bounds
 */
function ViewerToolbar({ 
  sectionModeEnabled, 
  onToggleSectionMode,
  hasSectionPlane,
  onClearSectionPlane,
  viewMode = 'free',
  onSetViewMode,
  availableViews = [],
  onResetView,
  onFitToModel,
  onOpenEcPanel,
  onOpenHvacPanel,
  onOpenWorkOrdersPanel,
  onOpenIdsValidationPanel,
  onToggleSpaceOverlay,
  spaceOverlayEnabled,
  spaceOverlayLoading = false,
  onToggleOccupancy,
  occupancyEnabled,
  onOpenOccupancyPanel,
  geometryHidden,
  onToggleGeometry,
  hasModel
}) {
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const viewMenuRef = useRef(null)
  const showSpaceLoading = spaceOverlayEnabled && spaceOverlayLoading
  
  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(event.target)) {
        setViewMenuOpen(false)
      }
    }
    
    if (viewMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [viewMenuOpen])

  const spacesLabel = (
    <div style={styles.toolLabelRow}>
      <span style={styles.toolLabel}>Spaces</span>
      {showSpaceLoading && (
        <span style={styles.loadingDots} aria-hidden="true">
          <span style={{
            ...styles.loadingDot,
            ...(spaceOverlayEnabled ? styles.loadingDotActive : {}),
            animationDelay: '0s'
          }} />
          <span style={{
            ...styles.loadingDot,
            ...(spaceOverlayEnabled ? styles.loadingDotActive : {}),
            animationDelay: '0.15s'
          }} />
          <span style={{
            ...styles.loadingDot,
            ...(spaceOverlayEnabled ? styles.loadingDotActive : {}),
            animationDelay: '0.3s'
          }} />
        </span>
      )}
    </div>
  )

  const toolbarButtons = [
    {
      key: 'section',
      show: true,
      selected: sectionModeEnabled,
      onClick: onToggleSectionMode,
      title: sectionModeEnabled ? 'Disable Section Mode' : 'Enable Section Mode',
      icon: <SectionIcon />,
      label: 'Section',
      led: sectionModeEnabled
    },
    {
      key: 'carbon',
      show: hasModel,
      onClick: onOpenEcPanel,
      title: 'Calculate Embodied Carbon',
      icon: <LeafIcon />,
      label: 'Carbon'
    },
    {
      key: 'hvac',
      show: hasModel,
      onClick: onOpenHvacPanel,
      title: 'Analyze HVAC/FM',
      icon: <FanIcon />,
      label: 'HVAC/FM'
    },
    {
      key: 'ids-validation',
      show: hasModel,
      onClick: onOpenIdsValidationPanel,
      title: 'IDS Validation',
      icon: <ValidationIcon />,
      label: 'Validate'
    },
    {
      key: 'work-orders',
      show: hasModel,
      onClick: onOpenWorkOrdersPanel,
      title: 'Open Work Orders',
      icon: <WorkOrdersIcon />,
      label: 'CMMS'
    },
    {
      key: 'spaces',
      show: hasModel,
      selected: spaceOverlayEnabled,
      onClick: onToggleSpaceOverlay,
      title: showSpaceLoading ? 'Loading spaces...' : 'Show Spaces',
      icon: <BoxIcon />,
      label: spacesLabel,
      led: spaceOverlayEnabled
    },
    {
      key: 'occupancy',
      show: hasModel,
      selected: occupancyEnabled,
      onClick: onToggleOccupancy,
      title: occupancyEnabled ? 'Stop Occupancy Simulation' : 'Start Occupancy Simulation',
      icon: <PeopleIcon />,
      label: 'Occupancy',
      led: occupancyEnabled
    },
    {
      key: 'occupancy-details',
      show: hasModel && occupancyEnabled,
      onClick: onOpenOccupancyPanel,
      title: 'Occupancy Details',
      icon: <ChartIcon />,
      label: 'Details'
    },
    {
      key: 'geometry',
      show: hasModel && (occupancyEnabled || spaceOverlayEnabled),
      selected: geometryHidden,
      onClick: onToggleGeometry,
      title: geometryHidden ? 'Show Building Geometry' : 'Hide Building Geometry',
      icon: <EyeIcon hidden={geometryHidden} />,
      label: geometryHidden ? 'Show' : 'Hide',
      led: geometryHidden
    },
    {
      key: 'clear',
      show: hasSectionPlane,
      onClick: onClearSectionPlane,
      title: 'Clear Section Plane',
      icon: <ClearIcon />,
      label: 'Clear'
    }
  ]

  const renderToolbarButton = (button) => {
    if (!button.show) return null
    const labelNode = typeof button.label === 'string'
      ? <span style={styles.toolLabel}>{button.label}</span>
      : button.label
    const className = `viewer-tool-button${button.selected ? ' active' : ''}`
    return (
      <Button
        key={button.key}
        selected={button.selected}
        onClick={button.onClick}
        title={button.title}
        className={className}
      >
        {button.icon}
        {button.led && <ButtonLED />}
        {labelNode}
      </Button>
    )
  }
  return (
    <div style={styles.toolbar}>
      {/* View Mode Dropdown */}
      <div style={styles.viewModeContainer} ref={viewMenuRef}>
        <Button
          selected={viewMenuOpen}
          onClick={() => setViewMenuOpen(!viewMenuOpen)}
          title="View Presets"
          className={`viewer-tool-button${viewMenuOpen ? ' active' : ''}`}
        >
          <ViewCubeIcon />
          <span style={styles.toolLabel}>
            {viewMode === 'free' ? 'View' : viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
          </span>
        </Button>
        
        {/* Dropdown Menu */}
        {viewMenuOpen && (
          <div style={styles.viewMenu}>
            {availableViews.map(({ mode, label }) => (
              <button
                key={mode}
                data-view-menu-item
                style={{
                  ...styles.viewMenuItem,
                  ...(viewMode === mode ? styles.viewMenuItemActive : {})
                }}
                onClick={() => {
                  onSetViewMode?.(mode)
                  setViewMenuOpen(false)
                }}
              >
                {label}
                {viewMode === mode && <CheckIcon />}
              </button>
            ))}
            <div style={styles.viewMenuDivider} />
            <button
              data-view-menu-item
              style={styles.viewMenuItem}
              onClick={() => {
                onFitToModel?.()
                setViewMenuOpen(false)
              }}
            >
              <FitIcon />
              <span style={{ marginLeft: '8px' }}>Fit All</span>
            </button>
            <button
              data-view-menu-item
              style={styles.viewMenuItem}
              onClick={() => {
                onResetView?.()
                setViewMenuOpen(false)
              }}
            >
              <ResetIcon />
              <span style={{ marginLeft: '8px' }}>Reset View</span>
            </button>
          </div>
        )}
      </div>
      {toolbarButtons.map(renderToolbarButton)}
    </div>
  )
}

/**
 * Styles
 */
const styles = {
  toolbar: {
    position: 'absolute',
    top: '16px',
    left: '16px',
    display: 'flex',
    gap: '8px',
    zIndex: 10,
  },
  viewModeContainer: {
    position: 'relative',
  },
  viewMenu: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: '0',
    background: '#ffffff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#e5e5e7',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
    padding: '4px',
    minWidth: '120px',
    zIndex: 20,
  },
  viewMenuItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '8px 12px',
    background: 'transparent',
    borderWidth: '0',
    borderStyle: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    color: '#1d1d1f',
    textAlign: 'left',
    transition: 'background 0.15s ease',
    fontFamily: 'inherit',
  },
  viewMenuItemActive: {
    background: '#f0f0f2',
    color: '#1d1d1f',
  },
  viewMenuDivider: {
    height: '1px',
    background: '#e5e5e7',
    margin: '4px 0',
  },
  toolLabel: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#1d1d1f',
  },
  toolLabelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  loadingDots: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  },
  loadingDot: {
    width: '3px',
    height: '3px',
    borderRadius: '50%',
    background: '#1d1d1f',
    animation: 'pulse 1s ease-in-out infinite',
  },
  loadingDotActive: {
    background: '#0071e3',
  },
}

const toolbarStyles = `
  @keyframes pulse {
    0%, 100% { opacity: 0.3; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1); }
  }
  
  /* View menu item hover */
  [data-view-menu-item]:hover {
    background: #f5f5f7 !important;
  }
`
ensureStyleInjected('viewer-toolbar-styles', toolbarStyles)

export default ViewerToolbar
