import React, { useState, useEffect, useRef } from 'react'
import { ButtonLED } from './Button'
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
  GraphIcon,
  ChatIcon,
  SidebarLeftIcon,
} from './ViewerIcons'
import { ensureStyleInjected } from '../utils/styleInjection'

/**
 * LeftSidebar Component
 *
 * Vertical icon-only sidebar docked to the left edge.
 * Contains the StructureTree toggle and all viewer tool buttons.
 * Tooltips appear on hover via the title attribute.
 */
function LeftSidebar({
  // Structure tree toggle
  structureTreeVisible,
  onToggleStructureTree,
  // Toolbar props
  sectionModeEnabled,
  onToggleSectionMode,
  hasSectionPlane,
  onClearSectionPlane,
  viewMode = 'free',
  onSetViewMode,
  availableViews = [],
  onResetView,
  onFitToModel,
  // Docked panel controls
  onTogglePanel,
  activePanel,
  floatingPanels = [],
  onToggleSpaceOverlay,
  spaceOverlayEnabled,
  spaceOverlayLoading = false,
  onToggleOccupancy,
  occupancyEnabled,
  onOpenOccupancyPanel,
  geometryHidden,
  onToggleGeometry,
  hasModel,
}) {
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const viewMenuRef = useRef(null)
  const showSpaceLoading = spaceOverlayEnabled && spaceOverlayLoading

  // Close view menu when clicking outside
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

  const toolbarButtons = [
    {
      key: 'view',
      show: true,
      selected: viewMenuOpen,
      onClick: () => setViewMenuOpen(!viewMenuOpen),
      title: 'View Presets',
      icon: <ViewCubeIcon />,
      isViewMenu: true,
    },
    {
      key: 'section',
      show: true,
      selected: sectionModeEnabled,
      onClick: onToggleSectionMode,
      title: sectionModeEnabled ? 'Disable Section Mode' : 'Enable Section Mode',
      icon: <SectionIcon />,
      led: sectionModeEnabled,
    },
    {
      key: 'carbon',
      panelKey: 'ec',
      show: hasModel,
      onClick: () => onTogglePanel('ec'),
      title: 'Calculate Embodied Carbon',
      icon: <LeafIcon />,
      led: activePanel === 'ec' || floatingPanels.includes('ec'),
    },
    {
      key: 'hvac',
      panelKey: 'hvac',
      show: hasModel,
      onClick: () => onTogglePanel('hvac'),
      title: 'Analyze HVAC/FM',
      icon: <FanIcon />,
      led: activePanel === 'hvac' || floatingPanels.includes('hvac'),
    },
    {
      key: 'graph-query',
      panelKey: 'graph',
      show: hasModel,
      onClick: () => onTogglePanel('graph'),
      title: 'Open Graph Query',
      icon: <GraphIcon />,
      led: activePanel === 'graph' || floatingPanels.includes('graph'),
    },
    {
      key: 'ids-validation',
      panelKey: 'ids-validation',
      show: hasModel,
      onClick: () => onTogglePanel('ids-validation'),
      title: 'IDS Validation',
      icon: <ValidationIcon />,
      led: activePanel === 'ids-validation' || floatingPanels.includes('ids-validation'),
    },
    {
      key: 'work-orders',
      panelKey: 'work-orders',
      show: hasModel,
      onClick: () => onTogglePanel('work-orders'),
      title: 'Open Work Orders',
      icon: <WorkOrdersIcon />,
      led: activePanel === 'work-orders' || floatingPanels.includes('work-orders'),
    },
    {
      key: 'llm-chat',
      panelKey: 'llm-chat',
      show: hasModel,
      onClick: () => onTogglePanel('llm-chat'),
      title: 'Ask AI about this model',
      icon: <ChatIcon />,
      led: activePanel === 'llm-chat' || floatingPanels.includes('llm-chat'),
    },
    {
      key: 'spaces',
      show: hasModel,
      selected: spaceOverlayEnabled,
      onClick: onToggleSpaceOverlay,
      title: showSpaceLoading ? 'Loading spaces...' : 'Show Spaces',
      icon: <BoxIcon />,
      led: spaceOverlayEnabled,
    },
    {
      key: 'occupancy',
      show: hasModel,
      selected: occupancyEnabled,
      onClick: onToggleOccupancy,
      title: occupancyEnabled ? 'Stop Occupancy Simulation' : 'Start Occupancy Simulation',
      icon: <PeopleIcon />,
      led: occupancyEnabled,
    },
    {
      key: 'occupancy-details',
      show: hasModel && occupancyEnabled,
      onClick: onOpenOccupancyPanel,
      title: 'Occupancy Details',
      icon: <ChartIcon />,
    },
    {
      key: 'geometry',
      show: hasModel && (occupancyEnabled || spaceOverlayEnabled),
      selected: geometryHidden,
      onClick: onToggleGeometry,
      title: geometryHidden ? 'Show Building Geometry' : 'Hide Building Geometry',
      icon: <EyeIcon hidden={geometryHidden} />,
      led: geometryHidden,
    },
    {
      key: 'clear',
      show: hasSectionPlane,
      onClick: onClearSectionPlane,
      title: 'Clear Section Plane',
      icon: <ClearIcon />,
    },
  ]

  return (
    <div style={styles.sidebar}>
      {/* Structure Tree toggle */}
      <button
        data-sidebar-btn
        onClick={onToggleStructureTree}
        title={structureTreeVisible ? 'Hide Structure Tree' : 'Show Structure Tree'}
        style={{
          ...styles.sidebarBtn,
          ...(structureTreeVisible ? styles.sidebarBtnActive : {}),
        }}
      >
        <SidebarLeftIcon size={18} />
        {structureTreeVisible && <span style={styles.ledIndicator} />}
      </button>

      <div style={styles.divider} />

      {/* Toolbar buttons */}
      {toolbarButtons.map((btn) => {
        if (!btn.show) return null
        if (btn.isViewMenu) {
          return (
            <div key={btn.key} ref={viewMenuRef} style={{ position: 'relative' }}>
              <button
                data-sidebar-btn
                onClick={btn.onClick}
                title={btn.title}
                style={{
                  ...styles.sidebarBtn,
                  ...(btn.selected ? styles.sidebarBtnActive : {}),
                }}
              >
                {btn.icon}
              </button>
              {viewMenuOpen && (
                <div style={styles.viewMenu}>
                  {availableViews.map(({ mode, label }) => (
                    <button
                      key={mode}
                      data-view-menu-item
                      style={{
                        ...styles.viewMenuItem,
                        ...(viewMode === mode ? styles.viewMenuItemActive : {}),
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
          )
        }
        return (
          <button
            key={btn.key}
            data-sidebar-btn
            onClick={btn.onClick}
            title={btn.title}
            style={{
              ...styles.sidebarBtn,
              ...(btn.selected ? styles.sidebarBtnActive : {}),
            }}
          >
            {btn.icon}
            {btn.led && <span style={styles.ledIndicator} />}
          </button>
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
  divider: {
    width: '24px',
    height: '1px',
    background: 'rgba(0, 0, 0, 0.08)',
    margin: '2px 0',
    flexShrink: 0,
  },
  viewMenu: {
    position: 'absolute',
    top: '0',
    left: 'calc(100% + 8px)',
    background: '#ffffff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#e5e5e7',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
    padding: '4px',
    minWidth: '120px',
    zIndex: 30,
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
}

const sidebarStyles = `
  [data-sidebar-btn]:hover {
    background: #f5f5f7 !important;
    color: #1d1d1f !important;
  }
  [data-sidebar-btn]:active {
    transform: scale(0.92);
  }
  [data-view-menu-item]:hover {
    background: #f5f5f7 !important;
  }

  /* Hide scrollbar on sidebar but allow scroll */
  .left-sidebar::-webkit-scrollbar {
    width: 0;
  }
`
ensureStyleInjected('left-sidebar-styles', sidebarStyles)

export default LeftSidebar
