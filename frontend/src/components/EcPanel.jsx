import React, { useState } from 'react'
import DraggablePanel from './DraggablePanel'
import { getEcColor } from '../utils/colorUtils'

/**
 * EcPanel Component
 * 
 * Draggable panel for triggering and displaying Embodied Carbon calculations.
 * Matches the application's "Arctic Zen" aesthetic.
 */
function EcPanel({ isOpen, onClose, jobId, selectedId, onSelectContributor, focusToken, zIndex }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [selectedMaterialClass, setSelectedMaterialClass] = useState(null)
  
  // Overrides state
  const [overrides, setOverrides] = useState({
    material_classes: {},
    ifc_types: {},
    elements: {}
  })
  
  // Override Modal state
  const [overrideModal, setOverrideModal] = useState({
    isOpen: false,
    type: null, // 'material_class', 'ifc_type', 'element'
    target: null, // Name/ID
    subType: null, // 'factor' or 'total'
    values: {} // Current values being edited
  })
  
  // Floating panel state
  const [position, setPosition] = useState({ x: 20, y: 80 })
  const [size, setSize] = useState({ width: 360, height: 500 })

  if (!isOpen) return null

  const handleCalculate = async (overridesInput) => {
    // Determine if we were passed specific overrides or an event object
    // If called from onClick, overridesInput is an Event.
    const effectiveOverrides = (overridesInput && !overridesInput.preventDefault && !overridesInput.nativeEvent) 
      ? overridesInput 
      : overrides

    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`http://localhost:8000/api/ec/calculate/${jobId}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ overrides: effectiveOverrides })
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.detail || 'Calculation failed')
      }
      const data = await response.json()
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Override handlers
  const openOverrideModal = (type, target, subType) => {
    // Pre-fill with existing override if any
    let existing = {}
    if (type === 'material_class') existing = overrides.material_classes[target] || {}
    if (type === 'ifc_type') existing = overrides.ifc_types[target] || {}
    if (type === 'element') existing = overrides.elements[target] || {}

    setOverrideModal({
      isOpen: true,
      type,
      target,
      subType,
      values: { ...existing }
    })
  }

  const saveOverride = () => {
    const { type, target, values } = overrideModal
    
    const newOverrides = { ...overrides }
    if (type === 'material_class') {
      newOverrides.material_classes = { ...newOverrides.material_classes, [target]: values }
    } else if (type === 'ifc_type') {
      newOverrides.ifc_types = { ...newOverrides.ifc_types, [target]: values }
    } else if (type === 'element') {
      newOverrides.elements = { ...newOverrides.elements, [target]: values }
    }
    
    setOverrides(newOverrides)
    setOverrideModal({ isOpen: false, type: null, target: null, subType: null, values: {} })
    
    // Trigger recalculation with new values
    handleCalculate(newOverrides)
  }

  const resetOverride = (type, target) => {
    const newOverrides = { ...overrides }
    if (type === 'material_class') {
        const { [target]: _, ...rest } = newOverrides.material_classes
        newOverrides.material_classes = rest
    } else if (type === 'ifc_type') {
        const { [target]: _, ...rest } = newOverrides.ifc_types
        newOverrides.ifc_types = rest
    } else if (type === 'element') {
        const { [target]: _, ...rest } = newOverrides.elements
        newOverrides.elements = rest
    }
    
    setOverrides(newOverrides)
    handleCalculate(newOverrides)
  }

  return (
    <DraggablePanel
      position={position}
      setPosition={setPosition}
      size={size}
      setSize={setSize}
      minWidth={300}
      minHeight={300}
      panelStyle={styles.panel}
      resizeHandleStyle={styles.resizeHandle}
      zIndex={zIndex}
      focusToken={focusToken}
      stopPointerDown
    >
      <div style={styles.header} className="drag-handle">
        <div style={styles.titleContainer}>
          <span style={styles.dragIcon}>⋮⋮</span>
          <h3 style={styles.title}>Embodied Carbon</h3>
        </div>
        <button onClick={onClose} style={styles.closeButton} className="ec-close-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      
      <div style={styles.content}>
        {error && (
          <div style={styles.error}>
            <p style={styles.errorText}>{error}</p>
            <button onClick={handleCalculate} style={styles.retryButton} className="ec-secondary-btn">Try Again</button>
          </div>
        )}

        {loading && (
          <div style={styles.loading}>
            <div style={styles.spinner}></div>
            <p>Calculating carbon footprint...</p>
          </div>
        )}

        {!loading && !result && !error && (
          <div style={styles.initial}>
            <p style={styles.description}>
              Calculate the embodied carbon for the current model based on material quantities.
            </p>
            <button onClick={handleCalculate} style={styles.primaryButton} className="ec-primary-btn">
              Calculate
            </button>
          </div>
        )}

        {!loading && result && (
          <div style={styles.result}>
            <div style={styles.summaryCard}>
              <span style={styles.label}>Total Embodied Carbon</span>
              <span style={styles.value}>{result.summary.total.avg_kgCO2e.toFixed(2)} kgCO2e</span>
              <span style={styles.subValue}>({result.summary.total.avg_tCO2e.toFixed(2)} tCO2e)</span>
            </div>

            {result.quality && (
              <div style={styles.qualityContainer}>
                <h4 style={styles.subtitle}>Data Coverage</h4>
                <div style={styles.qualityBarContainer}>
                  <div 
                    style={{
                      ...styles.qualityFill, 
                      width: `${(result.quality.rows_with_factors / result.quality.rows_total) * 100}%`,
                      backgroundColor: (result.quality.rows_with_factors / result.quality.rows_total) > 0.8 ? '#34c759' : '#ff9500'
                    }} 
                  />
                </div>
                <p style={styles.qualityText}>
                  {result.quality.rows_with_factors} / {result.quality.rows_total} elements mapped
                </p>
                
                {result.quality.rows_missing_factors > 0 && (
                  <div style={styles.missingInfo}>
                    <p style={styles.missingLabel}>Missing impacts for:</p>
                    <ul style={styles.missingList}>
                      {result.quality.missing_material_names_top.map((item, i) => (
                        <li key={i} style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                          <span>{item.name} ({item.count})</span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              onClick={() => openOverrideModal('material_class', item.name, 'factor')}
                              style={styles.linkButton}
                              className="ec-link-btn"
                              title="Set density and EC factor"
                            >
                              Set factor
                            </button>
                            <span style={{ color: '#d2d2d7' }}>|</span>
                            <button 
                              onClick={() => openOverrideModal('material_class', item.name, 'total')}
                              style={styles.linkButton}
                              className="ec-link-btn"
                              title="Set total EC directly"
                            >
                              Set total
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <button 
              onClick={() => setShowDetails(!showDetails)}
              style={styles.secondaryButton}
              className="ec-secondary-btn"
            >
              {showDetails ? 'Hide Breakdown' : 'Show Breakdown'}
            </button>

            {showDetails && (
              <div style={styles.detailsContainer}>
                <h4 style={styles.subtitle}>By Material Class</h4>
                <div style={styles.tableContainer}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Material</th>
                        <th style={styles.th}>EC (kgCO2e)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.summary.by_material_class.map((item, idx) => {
                        const isSelected = selectedMaterialClass === item.material_class
                        let components = []
                        let minEc = 0
                        let maxEc = 0

                        if (isSelected) {
                          const componentsMap = new Map()
                          result.details.elements.forEach((el, index) => {
                            if (el.MaterialClass !== item.material_class) return
                            const key = el.GlobalId || `${el.Name || 'Unnamed'}-${el.IfcType || ''}-${index}`
                            const existing = componentsMap.get(key)
                            if (existing) {
                              existing.ec_avg_kgCO2e += el.EC_avg_kgCO2e || 0
                              return
                            }
                            componentsMap.set(key, {
                              key,
                              GlobalId: el.GlobalId || null,
                              Name: el.Name || 'Unnamed',
                              IfcType: el.IfcType || '',
                              ec_avg_kgCO2e: el.EC_avg_kgCO2e || 0
                            })
                          })

                          components = Array.from(componentsMap.values())
                            .sort((a, b) => b.ec_avg_kgCO2e - a.ec_avg_kgCO2e)

                          const ecValues = components
                            .map(component => component.ec_avg_kgCO2e || 0)
                            .filter(v => v > 0)
                          minEc = ecValues.length ? Math.min(...ecValues) : 0
                          maxEc = ecValues.length ? Math.max(...ecValues) : 0
                        }

                        return (
                          <React.Fragment key={item.material_class || idx}>
                            <tr 
                              style={{
                                ...styles.tr,
                                ...styles.materialRow,
                                ...(isSelected ? styles.materialRowSelected : {})
                              }}
                              className="ec-material-row"
                              onClick={() => {
                                setSelectedMaterialClass(prev => (
                                  prev === item.material_class ? null : item.material_class
                                ))
                              }}
                            >
                              <td style={styles.td}>
                                <span style={styles.materialToggle}>{isSelected ? '-' : '+'}</span>
                                {item.material_class}
                              </td>
                              <td style={styles.td}>{item.ec_avg_kgCO2e.toFixed(2)}</td>
                            </tr>
                            {isSelected && (
                              components.length > 0 ? (
                                components.map((component) => (
                                  <tr
                                    key={component.key}
                                    style={{ ...styles.tr, ...styles.componentRow }}
                                    className={component.GlobalId ? "ec-row-hover" : ""}
                                    onClick={(e) => {
                                      if (!component.GlobalId) return
                                      e.stopPropagation()
                                      onSelectContributor && onSelectContributor(component.GlobalId, {
                                        ecValue: component.ec_avg_kgCO2e,
                                        minEc,
                                        maxEc
                                      })
                                    }}
                                    title={component.GlobalId ? "Click to select in model" : "No model mapping"}
                                  >
                                    <td style={{ ...styles.td, ...styles.componentCell }}>
                                      {component.Name}
                                      {component.IfcType ? ` (${component.IfcType.replace('Ifc', '')})` : ''}
                                    </td>
                                    <td style={styles.td}>{component.ec_avg_kgCO2e.toFixed(2)}</td>
                                  </tr>
                                ))
                              ) : (
                                <tr style={{ ...styles.tr, ...styles.componentRow }}>
                                  <td style={{ ...styles.td, ...styles.componentCell, ...styles.componentEmpty }} colSpan={2}>
                                    No components in the current detail list.
                                  </td>
                                </tr>
                              )
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <h4 style={{...styles.subtitle, marginTop: '16px'}}>By IFC Type</h4>
                <div style={styles.tableContainer}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Type</th>
                        <th style={styles.th}>Mass (kg)</th>
                        <th style={styles.th}>EC (kgCO2e)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.summary.by_ifc_type.map((item, idx) => (
                        <tr key={idx} style={styles.tr}>
                          <td style={styles.td}>{item.ifc_type.replace('Ifc', '')}</td>
                          <td style={styles.td}>{item.mass_kg.toFixed(0)}</td>
                          <td style={styles.td}>{item.ec_avg_kgCO2e.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            <h4 style={styles.subtitle}>Top Contributors</h4>
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Element</th>
                    <th style={styles.th}>Material</th>
                    <th style={styles.th}>EC (kgCO2e)</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Calculate min/max for color scaling
                    const ecValues = result.details.elements
                      .map(e => e.EC_avg_kgCO2e || 0)
                      .filter(v => v > 0)
                    const minEc = ecValues.length ? Math.min(...ecValues) : 0
                    const maxEc = ecValues.length ? Math.max(...ecValues) : 0

                    return result.details.elements.map((el, idx) => {
                    const isOverridden = 
                      (el.GlobalId && overrides.elements[el.GlobalId]) ||
                      (el.MaterialClass && overrides.material_classes[el.MaterialClass]) ||
                      (el.IfcType && overrides.ifc_types[el.IfcType]);
                    
                    const isSelected = el.GlobalId && selectedId === el.GlobalId
                    const ecColor = getEcColor(el.EC_avg_kgCO2e || 0, minEc, maxEc)
                    const baseBg = ecColor ? `${ecColor}33` : 'transparent' // ~20% alpha
                    const baseBorder = ecColor ? `3px solid ${ecColor}` : '3px solid transparent'
                      
                    return (
                    <tr 
                      key={idx} 
                      style={{
                        ...styles.tr,
                        backgroundColor: isSelected ? 'rgba(0, 212, 255, 0.15)' : baseBg,
                        borderLeft: isSelected ? '3px solid #00D4FF' : baseBorder
                      }}
                      className={el.GlobalId ? "ec-row-hover" : ""}
                      onClick={(e) => {
                        e.stopPropagation()
                        el.GlobalId && onSelectContributor && onSelectContributor(el.GlobalId, {
                          ecValue: el.EC_avg_kgCO2e || 0,
                          minEc,
                          maxEc
                        })
                      }}
                      title={el.GlobalId ? "Click to select in model" : "No model mapping"}
                    >
                      <td style={styles.td}>
                        {el.Name || 'Unnamed'}
                        {isOverridden && (
                          <span style={styles.overrideChip} title="User overridden value">
                            • Modified
                          </span>
                        )}
                      </td>
                      <td style={styles.td}>{el.MaterialName || 'Unknown'}</td>
                      <td style={styles.td}>{(el.EC_avg_kgCO2e || 0).toFixed(2)}</td>
                    </tr>
                  )})})()}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Override Modal */}
      {overrideModal.isOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>
              Override: {overrideModal.target}
            </h3>
            <p style={styles.modalSubtitle}>
              {overrideModal.subType === 'factor' 
                ? 'Set material properties to calculate EC.' 
                : 'Set total EC value directly.'}
            </p>
            
            <div style={styles.modalForm}>
              {overrideModal.subType === 'factor' && (
                <>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Density (kg/m³)</label>
                    <input 
                      type="number" 
                      style={styles.input}
                      value={overrideModal.values.density_kg_m3 || ''}
                      onChange={e => setOverrideModal(prev => ({
                        ...prev,
                        values: { ...prev.values, density_kg_m3: parseFloat(e.target.value) }
                      }))}
                      placeholder="e.g. 2400"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>EC Factor (kgCO2e/kg)</label>
                    <input 
                      type="number" 
                      style={styles.input}
                      step="0.01"
                      value={overrideModal.values.EC_avg_kgCO2e_per_kg || ''}
                      onChange={e => setOverrideModal(prev => ({
                        ...prev,
                        values: { ...prev.values, EC_avg_kgCO2e_per_kg: parseFloat(e.target.value) }
                      }))}
                      placeholder="e.g. 0.15"
                    />
                  </div>
                </>
              )}
              
              {overrideModal.subType === 'total' && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Total EC (kgCO2e)</label>
                  <input 
                    type="number" 
                    style={styles.input}
                    value={overrideModal.values.EC_total_kgCO2e || ''}
                    onChange={e => setOverrideModal(prev => ({
                      ...prev,
                      values: { ...prev.values, EC_total_kgCO2e: parseFloat(e.target.value) }
                    }))}
                  />
                </div>
              )}
            </div>
            
            <div style={{...styles.modalActions, justifyContent: 'space-between'}}>
              {/* Show Reset if override exists */}
              {(
                (overrideModal.type === 'material_class' && overrides.material_classes[overrideModal.target]) ||
                (overrideModal.type === 'ifc_type' && overrides.ifc_types[overrideModal.target]) ||
                (overrideModal.type === 'element' && overrides.elements[overrideModal.target])
              ) ? (
                 <button 
                  onClick={() => {
                    resetOverride(overrideModal.type, overrideModal.target)
                    setOverrideModal({ ...overrideModal, isOpen: false })
                  }}
                  style={{...styles.secondaryButton, color: '#ff3b30', width: 'auto'}}
                  className="ec-secondary-btn"
                >
                  Reset
                </button>
              ) : <div />}

              <div style={{display: 'flex', gap: '8px'}}>
                <button 
                  onClick={() => setOverrideModal({ ...overrideModal, isOpen: false })}
                  style={{...styles.secondaryButton, width: 'auto'}}
                  className="ec-secondary-btn"
                >
                  Cancel
                </button>
                <button 
                  onClick={saveOverride}
                  style={{...styles.primaryButton, width: 'auto'}}
                  className="ec-primary-btn"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DraggablePanel>
  )
}

const softShadow = 'rgb(255, 255, 255) 1px 1px 1px 0px inset, rgba(0, 0, 0, 0.15) -1px -1px 1px 0px inset, rgba(0, 0, 0, 0.26) 0.444584px 0.444584px 0.628737px -1px, rgba(0, 0, 0, 0.22) 1.21324px 1.21324px 1.38357px -2px, rgba(0, 0, 0, 0.15) 2.60599px 2.60599px 2.68477px -3px, rgba(0, 0, 0, 0.04) 6px 6px 6px -4px';
const softShadowPressed = 'inset 0.5px 0.5px 1px #fff, inset -0.5px -0.5px 1px #00000026, inset 0 0 2px #00000026, rgb(255, 255, 255) 1px 1px 1px 0px, rgba(0, 0, 0, 0.07) -1px -1px 1px 0px';

const styles = {
  panel: {
    position: 'absolute',
    backgroundColor: '#f4f4f4',
    borderRadius: '12px',
    boxShadow: softShadow,
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1000,
    overflow: 'hidden',
    fontFamily: 'inherit',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'grab',
    userSelect: 'none',
    background: 'rgba(255, 255, 255, 0.5)',
  },
  titleContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  dragIcon: {
    color: '#86868b',
    fontSize: '12px',
    letterSpacing: '-2px',
    cursor: 'grab',
  },
  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: '#1d1d1f',
  },
  closeButton: {
    background: '#e8e8ec',
    border: 'none',
    cursor: 'pointer',
    padding: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.1), 0.5px 0.5px 1px rgba(0,0,0,0.15)',
  },
  content: {
    padding: '16px',
    overflowY: 'auto',
    flex: 1, // Take remaining space
    background: 'rgba(255, 255, 255, 0.3)',
  },
  resizeHandle: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: '20px',
    height: '20px',
    cursor: 'nwse-resize',
    background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.1) 50%)',
    borderBottomRightRadius: '12px',
    zIndex: 10,
  },
  initial: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '12px',
  },
  description: {
    color: '#424245',
    fontSize: '13px',
    lineHeight: '1.5',
    marginBottom: '16px',
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    padding: '10px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    background: '#e8e8ec',
    color: '#1d1d1f',
    boxShadow: softShadow,
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '20px',
    color: '#86868b',
    fontSize: '13px',
  },
  spinner: {
    width: '24px',
    height: '24px',
    border: '2px solid #e5e5e7',
    borderTopColor: '#0071e3',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '12px',
  },
  result: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  summaryCard: {
    backgroundColor: '#e8e8ec',
    padding: '16px',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.08), 0.5px 0.5px 1px rgba(0,0,0,0.1)',
  },
  label: {
    fontSize: '11px',
    color: '#86868b',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  value: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#1d1d1f',
  },
  subValue: {
    fontSize: '13px',
    color: '#86868b',
    marginTop: '4px',
  },
  secondaryButton: {
    width: '100%',
    padding: '8px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    background: '#e8e8ec',
    color: '#1d1d1f',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.08), 0.5px 0.5px 1px rgba(0,0,0,0.1)',
  },
  detailsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    animation: 'fadeIn 0.3s ease-in-out',
  },
  materialRow: {
    cursor: 'pointer',
  },
  materialRowSelected: {
    background: 'rgba(0, 113, 227, 0.08)',
  },
  materialToggle: {
    display: 'inline-block',
    width: '12px',
    marginRight: '6px',
    color: '#86868b',
    fontWeight: 600,
  },
  componentRow: {
    background: 'rgba(0, 0, 0, 0.02)',
  },
  componentCell: {
    paddingLeft: '28px',
    color: '#424245',
  },
  componentEmpty: {
    fontSize: '11px',
    color: '#86868b',
  },
  qualityContainer: {
    backgroundColor: '#e8e8ec',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '8px',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.08)',
  },
  qualityBarContainer: {
    height: '6px',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: '3px',
    overflow: 'hidden',
    margin: '8px 0 4px 0',
  },
  qualityFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.5s ease-out',
  },
  qualityText: {
    fontSize: '11px',
    color: '#86868b',
    textAlign: 'right',
    margin: 0,
  },
  missingInfo: {
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid rgba(0, 0, 0, 0.06)',
  },
  missingLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#1d1d1f',
    margin: '0 0 4px 0',
  },
  missingList: {
    margin: 0,
    paddingLeft: '16px',
    fontSize: '11px',
    color: '#424245',
  },
  subtitle: {
    margin: '0 0 8px 0',
    fontSize: '13px',
    fontWeight: 600,
    color: '#1d1d1f',
  },
  tableContainer: {
    background: '#e8e8ec',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.08)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    color: '#86868b',
    fontWeight: 500,
    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
  },
  tr: {
    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
  },
  td: {
    padding: '8px 12px',
    color: '#1d1d1f',
  },
  error: {
    textAlign: 'center',
    color: '#ff3b30',
    fontSize: '13px',
  },
  errorText: {
    marginBottom: '12px',
  },
  retryButton: {
    padding: '6px 12px',
    background: '#e8e8ec',
    color: '#1d1d1f',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.1), 0.5px 0.5px 1px rgba(0,0,0,0.15)',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    // color: '#0071e3', // Moved to CSS
    fontSize: '11px',
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.2)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  modal: {
    backgroundColor: '#f4f4f4',
    borderRadius: '12px',
    padding: '20px',
    width: '80%',
    maxWidth: '300px',
    boxShadow: softShadow,
  },
  modalTitle: {
    margin: '0 0 8px 0',
    fontSize: '14px',
    fontWeight: 600,
    color: '#1d1d1f',
  },
  modalSubtitle: {
    margin: '0 0 16px 0',
    fontSize: '12px',
    color: '#86868b',
  },
  modalForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  input: {
    padding: '8px',
    borderRadius: '6px',
    border: 'none',
    background: '#e8e8ec',
    fontSize: '13px',
    width: '100%',
    boxSizing: 'border-box',
    boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.1), inset -1px -1px 2px rgba(255,255,255,0.5)',
  },
  modalActions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  overrideChip: {
    display: 'inline-block',
    marginLeft: '6px',
    fontSize: '9px',
    color: '#ff9500',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
}

// Add spinner animation and button styles
const styleSheet = document.createElement('style')
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .ec-row-hover:hover {
    background-color: rgba(0, 113, 227, 0.1) !important;
    cursor: pointer;
  }
  .ec-material-row:hover {
    background-color: rgba(0, 113, 227, 0.08) !important;
    cursor: pointer;
  }
  
  /* Button Classes */
  .ec-primary-btn {
    background-color: #0071e3;
    color: #ffffff;
    transition: background-color 0.2s ease;
  }
  .ec-primary-btn:hover {
    background-color: #005bb5 !important; /* Darker blue on hover */
  }
  
  .ec-secondary-btn {
    background-color: rgba(0, 0, 0, 0.05);
    color: #1d1d1f;
    transition: background-color 0.2s ease;
  }
  .ec-secondary-btn:hover {
    background-color: rgba(0, 0, 0, 0.12) !important; /* Darker gray on hover */
  }
  
  .ec-link-btn {
    color: #0071e3;
    transition: color 0.2s ease;
  }
  .ec-link-btn:hover {
    color: #005bb5 !important;
    text-decoration: underline;
  }
  
  .ec-close-btn {
    color: #86868b;
    transition: background-color 0.2s, color 0.2s;
  }
  .ec-close-btn:hover {
    background-color: rgba(0, 0, 0, 0.05);
    color: #1d1d1f !important;
  }
`
if (typeof document !== 'undefined') {
  document.head.appendChild(styleSheet)
}

export default EcPanel
