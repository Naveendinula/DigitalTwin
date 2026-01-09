import React, { useState, useEffect } from 'react'
import IdsManager from './IdsManager'

/**
 * ValidationReportModal - Detailed validation report viewer
 * 
 * Arctic Zen minimalist design with full rule details,
 * thresholds, and actionable recommendations.
 * 
 * Includes IDS template management tab.
 */

const DOMAIN_CONFIG = {
  core: {
    label: 'Core Viewer',
    description: 'Essential requirements for the 3D viewer to function',
    icon: '◉'
  },
  hvac_fm: {
    label: 'HVAC / FM',
    description: 'Requirements for HVAC and facilities management analysis',
    icon: '⬡'
  },
  ec: {
    label: 'Embodied Carbon',
    description: 'Requirements for embodied carbon calculations',
    icon: '◈'
  },
  occupancy: {
    label: 'Occupancy',
    description: 'Requirements for occupancy simulation',
    icon: '◇'
  }
}

const SEVERITY_STYLES = {
  pass: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.08)', label: 'Pass' },
  warn: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)', label: 'Warning' },
  fail: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)', label: 'Fail' },
  info: { color: '#6b7280', bg: 'rgba(107, 114, 128, 0.08)', label: 'Info' }
}

function ValidationReportModal({ isOpen, onClose, jobId }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedDomain, setSelectedDomain] = useState('core')
  const [expandedRule, setExpandedRule] = useState(null)
  const [activeTab, setActiveTab] = useState('rules') // 'rules' or 'ids'

  const API_URL = 'http://localhost:8000'

  const fetchReport = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/validation/${jobId}`)
      if (!response.ok) throw new Error('Failed to fetch validation report')
      const data = await response.json()
      setReport(data)
      // Auto-select first domain with issues, or first domain
      const domains = Object.keys(data.domainSummaries || {})
      const problemDomain = domains.find(d => 
        data.domainSummaries[d].failed > 0 || data.domainSummaries[d].warned > 0
      )
      setSelectedDomain(problemDomain || domains[0] || 'core')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen || !jobId) return
    fetchReport()
  }, [isOpen, jobId])

  // Handle IDS changes - trigger revalidation
  const handleIdsChange = async () => {
    // Revalidate after IDS change
    try {
      await fetch(`${API_URL}/validation/${jobId}/revalidate`, { method: 'POST' })
      await fetchReport()
    } catch (err) {
      console.error('Revalidation failed:', err)
    }
  }

  const domainSummaries = report?.domainSummaries || {}
  const domainEntries = Object.entries(domainSummaries)
  const selectedSummary = domainSummaries[selectedDomain]
  const domainRules = report?.results?.filter(r => r.domain === selectedDomain) || []
  const summary = report?.summary
  const totalCount = summary ? summary.passCount + summary.warnCount + summary.failCount : 0
  const overallProgress = summary ? {
    pass: totalCount > 0 ? (summary.passCount / totalCount) * 100 : 0,
    warn: totalCount > 0 ? (summary.warnCount / totalCount) * 100 : 0,
    fail: totalCount > 0 ? (summary.failCount / totalCount) * 100 : 0
  } : { pass: 0, warn: 0, fail: 0 }
  const overallStyle = report ? SEVERITY_STYLES[report.overallStatus] : null

  if (!isOpen) return null

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  const toggleRule = (ruleId) => {
    setExpandedRule(currentRule => (currentRule === ruleId ? null : ruleId))
  }

  return (
    <div style={styles.backdrop} onClick={handleBackdropClick}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <h2 style={styles.title}>Model Validation Report</h2>
            {report && (
              <span style={{
                ...styles.statusBadge,
                color: overallStyle?.color,
                backgroundColor: overallStyle?.bg
              }}>
                {report.overallStatus === 'pass' ? '✓ Valid' : 
                 report.overallStatus === 'warn' ? '⚠ Warnings' : '✗ Issues Found'}
              </span>
            )}
          </div>
          <button style={styles.closeBtn} onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={styles.tabBar}>
          <button
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'rules' ? styles.tabBtnActive : {})
            }}
            onClick={() => setActiveTab('rules')}
          >
            Validation Rules
          </button>
          <button
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'ids' ? styles.tabBtnActive : {})
            }}
            onClick={() => setActiveTab('ids')}
          >
            IDS Templates
          </button>
        </div>

        {loading && (
          <div style={styles.loadingState}>
            <div style={styles.spinner} />
            <span>Loading validation report...</span>
          </div>
        )}

        {error && (
          <div style={styles.errorState}>
            <span style={styles.errorIcon}>!</span>
            <span>{error}</span>
          </div>
        )}

        {/* IDS Templates Tab */}
        {activeTab === 'ids' && !loading && (
          <div style={styles.content}>
            <IdsManager jobId={jobId} onIdsChange={handleIdsChange} />
          </div>
        )}

        {/* Rules Tab */}
        {activeTab === 'rules' && report && !loading && (
          <div style={styles.content}>
            {/* Progress Overview */}
            <div style={styles.progressSection}>
              <div style={styles.sectionLabel}>PROGRESS</div>
              <div style={styles.progressBar}>
                <div style={{ ...styles.progressSegment, width: `${overallProgress.pass}%`, backgroundColor: '#10b981' }} />
                <div style={{ ...styles.progressSegment, width: `${overallProgress.warn}%`, backgroundColor: '#f59e0b' }} />
                <div style={{ ...styles.progressSegment, width: `${overallProgress.fail}%`, backgroundColor: '#ef4444' }} />
              </div>
              <div style={styles.progressLabels}>
                <span style={styles.progressLabel}>
                  <span style={{ ...styles.dot, backgroundColor: '#10b981' }} />
                  {report.summary.passCount} passed
                </span>
                <span style={styles.progressLabel}>
                  <span style={{ ...styles.dot, backgroundColor: '#f59e0b' }} />
                  {report.summary.warnCount} warnings
                </span>
                <span style={styles.progressLabel}>
                  <span style={{ ...styles.dot, backgroundColor: '#ef4444' }} />
                  {report.summary.failCount} failed
                </span>
              </div>
            </div>

            <div style={styles.mainLayout}>
              {/* Domain Sidebar */}
              <div style={styles.sidebar}>
                <div style={styles.sidebarLabel}>DOMAINS</div>
                <div style={styles.domainGrid}>
                  {domainEntries.map(([domain, summary]) => {
                    const config = DOMAIN_CONFIG[domain] || { label: domain, icon: '○' }
                    const isSelected = selectedDomain === domain
                    const statusStyle = SEVERITY_STYLES[summary.status]
                    const statusColor = statusStyle?.color || '#6b7280'
                    
                    return (
                      <button
                        key={domain}
                        style={{
                          ...styles.domainBtn,
                          ...(isSelected ? styles.domainBtnActive : {}),
                        }}
                        onClick={() => setSelectedDomain(domain)}
                      >
                        <div style={styles.domainBtnTop}>
                          <span style={styles.domainLabel}>{config.label}</span>
                          <span style={{
                            ...styles.domainStatus,
                            backgroundColor: statusColor,
                          }} />
                        </div>
                        <div style={styles.domainStats}>
                          <span style={{ color: '#10b981' }}>{summary.passed}</span>
                          <span style={styles.statDivider}>{'\u00B7'}</span>
                          <span style={{ color: '#f59e0b' }}>{summary.warned}</span>
                          <span style={styles.statDivider}>{'\u00B7'}</span>
                          <span style={{ color: '#ef4444' }}>{summary.failed}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Rules List */}
              <div style={styles.rulesPanel}>
                <div style={styles.rulesPanelHeader}>
                  <div>
                    <h3 style={styles.rulesPanelTitle}>
                      {DOMAIN_CONFIG[selectedDomain]?.label || selectedDomain}
                    </h3>
                    <p style={styles.rulesPanelDesc}>
                      {DOMAIN_CONFIG[selectedDomain]?.description}
                    </p>
                  </div>
                  {selectedSummary && (
                    <div style={{
                      ...styles.featureReadyBadge,
                      backgroundColor: selectedSummary.featureReady 
                        ? 'rgba(16, 185, 129, 0.1)' 
                        : 'rgba(245, 158, 11, 0.1)',
                      color: selectedSummary.featureReady 
                        ? '#10b981' 
                        : '#f59e0b'
                    }}>
                      {selectedSummary.featureReady 
                        ? '✓ Feature Ready' 
                        : '○ Limited Functionality'}
                    </div>
                  )}
                </div>

                <div style={styles.rulesList}>
                  {domainRules.map((rule) => {
                    const severity = SEVERITY_STYLES[rule.severity] || SEVERITY_STYLES.info
                    const isExpanded = expandedRule === rule.ruleId
                    
                    return (
                      <div 
                        key={rule.ruleId} 
                        style={styles.ruleCard}
                      >
                        <button 
                          style={styles.ruleHeader}
                          onClick={() => toggleRule(rule.ruleId)}
                        >
                          <div style={styles.ruleHeaderLeft}>
                            <span style={{
                              ...styles.ruleSeverityIcon,
                              backgroundColor: severity.color,
                            }} />
                            <div style={styles.ruleInfo}>
                              <span style={styles.ruleName}>{rule.ruleName}</span>
                              <span style={styles.ruleId}>{rule.ruleId}</span>
                            </div>
                          </div>
                          <div style={styles.ruleHeaderRight}>
                            {rule.isIdsRule && (
                              <span style={{
                                ...styles.idsTag,
                                ...(rule.idsSource === 'external' ? {
                                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                                  color: '#10b981',
                                } : {})
                              }}>
                                {rule.idsSource === 'external' ? 'IDS↗' : 'IDS'}
                              </span>
                            )}
                            <span style={styles.ruleCoverage}>
                              {rule.coveragePercent}%
                            </span>
                            <span style={{
                              ...styles.expandIcon,
                              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                            }}>
                              ▾
                            </span>
                          </div>
                        </button>

                        {isExpanded && (
                          <div style={styles.ruleDetails}>
                            <p style={styles.ruleDescription}>{rule.description}</p>
                            
                            {/* Metrics */}
                            <div style={styles.metricsGrid}>
                              <div style={styles.metricItem}>
                                <span style={styles.metricLabel}>Status</span>
                                <span style={{
                                  ...styles.metricValue,
                                  color: severity.color
                                }}>
                                  {severity.label}
                                </span>
                              </div>
                              <div style={styles.metricItem}>
                                <span style={styles.metricLabel}>Coverage</span>
                                <span style={styles.metricValue}>
                                  {rule.passCount} / {rule.totalCount}
                                </span>
                              </div>
                              <div style={styles.metricItem}>
                                <span style={styles.metricLabel}>Pass Threshold</span>
                                <span style={styles.metricValue}>≥ {rule.thresholdPass}%</span>
                              </div>
                              <div style={styles.metricItem}>
                                <span style={styles.metricLabel}>Warn Threshold</span>
                                <span style={styles.metricValue}>≥ {rule.thresholdWarn}%</span>
                              </div>
                            </div>

                            {/* Progress bar for coverage */}
                            <div style={styles.coverageBarContainer}>
                              <div style={styles.coverageBar}>
                                <div style={{
                                  ...styles.coverageFill,
                                  width: `${Math.min(rule.coveragePercent, 100)}%`,
                                  backgroundColor: severity.color
                                }} />
                                <div style={{
                                  ...styles.thresholdMarker,
                                  left: `${rule.thresholdWarn}%`
                                }} title={`Warn: ${rule.thresholdWarn}%`} />
                                <div style={{
                                  ...styles.thresholdMarker,
                                  left: `${rule.thresholdPass}%`,
                                  backgroundColor: '#10b981'
                                }} title={`Pass: ${rule.thresholdPass}%`} />
                              </div>
                              <div style={styles.coverageLabels}>
                                <span>0%</span>
                                <span style={{ color: '#f59e0b' }}>{rule.thresholdWarn}%</span>
                                <span style={{ color: '#10b981' }}>{rule.thresholdPass}%</span>
                                <span>100%</span>
                              </div>
                            </div>

                            {/* Message */}
                            {rule.message && (
                              <div style={styles.messageBox}>
                                <span style={styles.messageIcon}>ℹ</span>
                                <span>{rule.message}</span>
                              </div>
                            )}

                            {/* Recommendations */}
                            {rule.recommendations?.length > 0 && (
                              <div style={styles.recommendationsSection}>
                                <span style={styles.recommendationsLabel}>
                                  How to fix this:
                                </span>
                                <ul style={styles.recommendationsList}>
                                  {rule.recommendations.map((rec, idx) => (
                                    <li key={idx} style={styles.recommendationItem}>
                                      {rec}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* IDS Facet Details - for external IDS rules */}
                            {rule.facetDetails?.length > 0 && (
                              <div style={styles.facetDetailsSection}>
                                <span style={styles.facetDetailsLabel}>IDS Facet Checks:</span>
                                <div style={styles.facetGrid}>
                                  {rule.facetDetails.map((facet, idx) => (
                                    <div 
                                      key={idx} 
                                      style={{
                                        ...styles.facetItem,
                                        borderLeftColor: facet.passed ? '#10b981' : '#ef4444'
                                      }}
                                    >
                                      <div style={styles.facetHeader}>
                                        <span style={styles.facetType}>{facet.type}</span>
                                        <span style={{
                                          ...styles.facetStatus,
                                          color: facet.passed ? '#10b981' : '#ef4444'
                                        }}>
                                          {facet.passed ? '✓' : '✗'}
                                        </span>
                                      </div>
                                      {facet.name && (
                                        <span style={styles.facetName}>{facet.name}</span>
                                      )}
                                      {facet.details && Object.keys(facet.details).length > 0 && (
                                        <div style={styles.facetDetailsInner}>
                                          {facet.details.propertySet && (
                                            <span>Pset: {facet.details.propertySet}</span>
                                          )}
                                          {facet.details.baseName && (
                                            <span>Property: {facet.details.baseName}</span>
                                          )}
                                          {facet.details.system && (
                                            <span>System: {facet.details.system}</span>
                                          )}
                                          {facet.details.dataType && (
                                            <span>Type: {facet.details.dataType}</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* IDS Rule Info */}
                            {rule.isIdsRule && (
                              <div style={styles.idsInfo}>
                                <span style={styles.idsInfoIcon}>📋</span>
                                <span>
                                  {rule.idsSource === 'external' ? (
                                    <>
                                      This rule is from an <strong>external IDS file</strong>. 
                                      It validates specific IFC requirements defined in the uploaded specification.
                                    </>
                                  ) : (
                                    <>
                                      This rule is validated using <strong>IDS (Information Delivery Specification)</strong> standards.
                                      It checks for required IFC entities and their relationships.
                                    </>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Footer with file info */}
            <div style={styles.footer}>
              <span style={styles.footerItem}>
                <strong>File:</strong> {report.ifcFilename}
              </span>
              <span style={styles.footerItem}>
                <strong>Schema:</strong> {report.ifcSchema}
              </span>
              <span style={styles.footerItem}>
                <strong>Version:</strong> {report.schemaVersion}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const monoFont = "'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', 'Courier New', monospace";

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '24px',
  },

  modal: {
    width: '100%',
    maxWidth: '1100px',
    maxHeight: '90vh',
    backgroundColor: '#f5f5f5',
    borderRadius: '16px',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.12)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: monoFont,
    border: '1px solid rgba(0, 0, 0, 0.08)',
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '24px 28px 20px',
    flexShrink: 0,
    background: '#f5f5f5',
  },

  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },

  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 700,
    color: '#1a1a1a',
    letterSpacing: '-0.01em',
    fontFamily: monoFont,
  },

  statusBadge: {
    fontSize: '12px',
    fontWeight: 400,
    padding: '0',
    color: '#6b7280',
    fontFamily: monoFont,
    borderRadius: 0,
    background: 'none',
  },

  closeBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: '1px solid rgba(0, 0, 0, 0.08)',
    background: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9ca3af',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
    transition: 'all 0.15s ease',
  },

  tabBar: {
    display: 'flex',
    gap: '4px',
    padding: '0 28px 16px',
    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
    background: '#f5f5f5',
  },

  tabBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: monoFont,
    color: '#6b7280',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  tabBtnActive: {
    color: '#1a1a1a',
    background: '#ffffff',
    border: '1px solid rgba(0, 0, 0, 0.08)',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
  },

  tabIcon: {
    fontSize: '14px',
  },

  content: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    background: '#f5f5f5',
    padding: '0 28px 20px',
  },

  progressSection: {
    marginBottom: '20px',
    flexShrink: 0,
  },

  sectionLabel: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#1a1a1a',
    marginBottom: '12px',
    fontFamily: monoFont,
  },

  progressBar: {
    height: '4px',
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: '2px',
    display: 'flex',
    overflow: 'hidden',
    marginBottom: '10px',
  },

  progressSegment: {
    height: '100%',
    transition: 'width 0.3s ease',
  },

  progressLabels: {
    display: 'flex',
    gap: '20px',
  },

  progressLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    color: '#6b7280',
    fontFamily: monoFont,
  },

  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
  },

  mainLayout: {
    flex: 1,
    display: 'flex',
    gap: '16px',
    overflow: 'hidden',
  },

  sidebar: {
    width: '280px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    overflowY: 'auto',
  },

  sidebarLabel: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#1a1a1a',
    marginBottom: '8px',
    fontFamily: monoFont,
  },

  domainGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },

  domainBtn: {
    width: '100%',
    padding: '14px 14px 12px',
    background: '#f4f4f4',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    textAlign: 'left',
    boxShadow: `
      rgb(255, 255, 255) 1px 1px 1px 0px inset,
      rgba(0, 0, 0, 0.15) -1px -1px 1px 0px inset,
      rgba(0, 0, 0, 0.26) 0.444584px 0.444584px 0.628737px -1px,
      rgba(0, 0, 0, 0.247) 1.21072px 1.21072px 1.71222px -1.5px,
      rgba(0, 0, 0, 0.23) 2.6583px 2.6583px 3.75941px -2.25px,
      rgba(0, 0, 0, 0.192) 5.90083px 5.90083px 8.34503px -3px,
      rgba(0, 0, 0, 0.056) 10px 10px 21.2132px -3.75px,
      -0.5px -0.5px 0 0 rgb(0 0 0 / 5%)
    `,
    transition: 'all 0.2s ease',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: '90px',
    position: 'relative',
    userSelect: 'none',
  },

  domainBtnActive: {
    background: '#eaeaea',
    transform: 'scale(0.98)',
    boxShadow: `
      inset 0.5px 0.5px 1px #fff, 
      inset -0.5px -0.5px 1px #00000026,
      0.222px 0.222px 0.314px -0.5px #0003,
      0.605px 0.605px 0.856px -1px #0000002e,
      1.329px 1.329px 1.88px -1.5px #00000040,
      2.95px 2.95px 4.172px -2px #0000001a, 
      2.5px 2.5px 3px -2.5px #00000026,
      -0.5px -0.5px 0 0 rgb(0 0 0 / 10%)
    `,
  },

  domainBtnTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
  },

  domainIcon: {
    display: 'none',
  },

  domainLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#1a1a1a',
    fontFamily: monoFont,
    lineHeight: 1.3,
    flex: 1,
  },

  domainStatus: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    flexShrink: 0,
    marginTop: '4px',
  },

  domainStats: {
    fontSize: '11px',
    color: '#9ca3af',
    fontFamily: monoFont,
    marginTop: 'auto',
  },

  statDivider: {
    margin: '0 3px',
    opacity: 0.5,
  },

  rulesPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: '#ffffff',
    borderRadius: '12px',
    border: '1px solid rgba(0, 0, 0, 0.06)',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
  },

  rulesPanelHeader: {
    padding: '16px 18px',
    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexShrink: 0,
    background: '#ffffff',
  },

  rulesPanelTitle: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 600,
    color: '#1a1a1a',
    fontFamily: monoFont,
  },

  rulesPanelDesc: {
    margin: '4px 0 0 0',
    fontSize: '11px',
    color: '#9ca3af',
    fontFamily: monoFont,
  },

  featureReadyBadge: {
    fontSize: '10px',
    fontWeight: 500,
    padding: '4px 8px',
    borderRadius: '6px',
    fontFamily: monoFont,
  },

  rulesList: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
  },

  ruleCard: {
    marginBottom: '6px',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#fafafa',
    border: '1px solid rgba(0, 0, 0, 0.04)',
    transition: 'all 0.15s ease',
  },

  ruleHeader: {
    width: '100%',
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: monoFont,
  },

  ruleHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },

  ruleSeverityIcon: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    flexShrink: 0,
  },

  ruleInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },

  ruleName: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#1a1a1a',
    fontFamily: monoFont,
  },

  ruleId: {
    fontSize: '10px',
    color: '#9ca3af',
    fontFamily: monoFont,
  },

  ruleHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },

  idsTag: {
    fontSize: '9px',
    fontWeight: 600,
    padding: '2px 5px',
    borderRadius: '4px',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    color: '#6366f1',
    letterSpacing: '0.02em',
    fontFamily: monoFont,
  },

  ruleCoverage: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#9ca3af',
    fontFamily: monoFont,
  },

  expandIcon: {
    fontSize: '10px',
    color: '#9ca3af',
    transition: 'transform 0.15s ease',
  },

  ruleDetails: {
    padding: '12px 14px 14px 31px',
    borderTop: '1px solid rgba(0, 0, 0, 0.04)',
    background: '#ffffff',
  },

  ruleDescription: {
    margin: '0 0 12px 0',
    fontSize: '11px',
    color: '#6b7280',
    lineHeight: 1.5,
    fontFamily: monoFont,
  },

  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
    marginBottom: '14px',
  },

  metricItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },

  metricLabel: {
    fontSize: '9px',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
    fontFamily: monoFont,
  },

  metricValue: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#1a1a1a',
    fontFamily: monoFont,
  },

  coverageBarContainer: {
    marginBottom: '14px',
  },

  coverageBar: {
    position: 'relative',
    height: '4px',
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    borderRadius: '2px',
    overflow: 'visible',
  },

  coverageFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  },

  thresholdMarker: {
    position: 'absolute',
    top: '-2px',
    width: '2px',
    height: '8px',
    backgroundColor: '#f59e0b',
    borderRadius: '1px',
  },

  coverageLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '6px',
    fontSize: '9px',
    color: '#9ca3af',
    fontFamily: monoFont,
  },

  messageBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: '#fafafa',
    borderRadius: '6px',
    fontSize: '11px',
    color: '#6b7280',
    marginBottom: '10px',
    fontFamily: monoFont,
    lineHeight: 1.4,
  },

  messageIcon: {
    flexShrink: 0,
    width: '16px',
    height: '16px',
    borderRadius: '8px',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    color: '#6366f1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '9px',
  },

  recommendationsSection: {
    padding: '10px 12px',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    borderRadius: '6px',
    border: '1px solid rgba(245, 158, 11, 0.1)',
    marginBottom: '10px',
  },

  recommendationsLabel: {
    display: 'block',
    fontSize: '10px',
    fontWeight: 600,
    color: '#d97706',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
    fontFamily: monoFont,
  },

  recommendationsList: {
    margin: 0,
    paddingLeft: '14px',
  },

  recommendationItem: {
    fontSize: '11px',
    color: '#92400e',
    lineHeight: 1.4,
    marginBottom: '3px',
    fontFamily: monoFont,
  },

  // IDS Facet Details styles
  facetDetailsSection: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: 'rgba(99, 102, 241, 0.03)',
    borderRadius: '8px',
    border: '1px solid rgba(99, 102, 241, 0.1)',
  },

  facetDetailsLabel: {
    display: 'block',
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#4f46e5',
    marginBottom: '10px',
    fontFamily: monoFont,
  },

  facetGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '8px',
  },

  facetItem: {
    padding: '8px 10px',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: '6px',
    borderLeft: '3px solid #6b7280',
    fontSize: '10px',
    fontFamily: monoFont,
  },

  facetHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },

  facetType: {
    fontWeight: 600,
    textTransform: 'capitalize',
    color: '#4f46e5',
  },

  facetStatus: {
    fontSize: '12px',
    fontWeight: 600,
  },

  facetName: {
    display: 'block',
    color: '#374151',
    fontWeight: 500,
    marginBottom: '4px',
  },

  facetDetailsInner: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    color: '#6b7280',
    fontSize: '9px',
  },

  idsInfo: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: 'rgba(99, 102, 241, 0.04)',
    borderRadius: '6px',
    fontSize: '10px',
    color: '#4f46e5',
    lineHeight: 1.4,
    fontFamily: monoFont,
  },

  idsInfoIcon: {
    flexShrink: 0,
    fontSize: '12px',
  },

  footer: {
    display: 'flex',
    gap: '24px',
    padding: '14px 28px',
    borderTop: '1px solid rgba(0, 0, 0, 0.06)',
    fontSize: '10px',
    color: '#9ca3af',
    flexShrink: 0,
    background: '#f5f5f5',
    fontFamily: monoFont,
  },

  footerItem: {
    display: 'flex',
    gap: '4px',
  },

  loadingState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    color: '#9ca3af',
    fontSize: '12px',
    fontFamily: monoFont,
  },

  spinner: {
    width: '24px',
    height: '24px',
    border: '2px solid rgba(0, 0, 0, 0.06)',
    borderTopColor: '#1a1a1a',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },

  errorState: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    color: '#ef4444',
    fontSize: '12px',
    fontFamily: monoFont,
  },

  errorIcon: {
    width: '24px',
    height: '24px',
    borderRadius: '12px',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    fontSize: '12px',
  },
}

// Add keyframes for spinner
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style')
  styleSheet.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `
  document.head.appendChild(styleSheet)
}

export default ValidationReportModal
