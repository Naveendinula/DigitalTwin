import React, { useState, useEffect, useMemo } from 'react'

/**
 * ValidationReportModal - Detailed validation report viewer
 * 
 * Arctic Zen minimalist design with full rule details,
 * thresholds, and actionable recommendations.
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

  const API_URL = 'http://localhost:8000'

  useEffect(() => {
    if (!isOpen || !jobId) return

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

    fetchReport()
  }, [isOpen, jobId])

  const domainRules = useMemo(() => {
    if (!report?.results) return []
    return report.results.filter(r => r.domain === selectedDomain)
  }, [report, selectedDomain])

  const overallProgress = useMemo(() => {
    if (!report?.summary) return { pass: 0, warn: 0, fail: 0, total: 0 }
    const { passCount, warnCount, failCount } = report.summary
    const total = passCount + warnCount + failCount
    return {
      pass: total > 0 ? (passCount / total) * 100 : 0,
      warn: total > 0 ? (warnCount / total) * 100 : 0,
      fail: total > 0 ? (failCount / total) * 100 : 0,
      total
    }
  }, [report])

  if (!isOpen) return null

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  const toggleRule = (ruleId) => {
    setExpandedRule(expandedRule === ruleId ? null : ruleId)
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
                color: SEVERITY_STYLES[report.overallStatus]?.color,
                backgroundColor: SEVERITY_STYLES[report.overallStatus]?.bg
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

        {report && !loading && (
          <div style={styles.content}>
            {/* Progress Overview */}
            <div style={styles.progressSection}>
              <div style={styles.progressBar}>
                <div style={{ ...styles.progressSegment, width: `${overallProgress.pass}%`, backgroundColor: '#10b981' }} />
                <div style={{ ...styles.progressSegment, width: `${overallProgress.warn}%`, backgroundColor: '#f59e0b' }} />
                <div style={{ ...styles.progressSegment, width: `${overallProgress.fail}%`, backgroundColor: '#ef4444' }} />
              </div>
              <div style={styles.progressLabels}>
                <span style={styles.progressLabel}>
                  <span style={{ ...styles.dot, backgroundColor: '#10b981' }} />
                  {report.summary.passCount} Passed
                </span>
                <span style={styles.progressLabel}>
                  <span style={{ ...styles.dot, backgroundColor: '#f59e0b' }} />
                  {report.summary.warnCount} Warnings
                </span>
                <span style={styles.progressLabel}>
                  <span style={{ ...styles.dot, backgroundColor: '#ef4444' }} />
                  {report.summary.failCount} Failed
                </span>
              </div>
            </div>

            <div style={styles.mainLayout}>
              {/* Domain Sidebar */}
              <div style={styles.sidebar}>
                <div style={styles.sidebarLabel}>Validation Domains</div>
                {Object.entries(report.domainSummaries || {}).map(([domain, summary]) => {
                  const config = DOMAIN_CONFIG[domain] || { label: domain, icon: '○' }
                  const isSelected = selectedDomain === domain
                  const statusColor = SEVERITY_STYLES[summary.status]?.color || '#6b7280'
                  
                  return (
                    <button
                      key={domain}
                      style={{
                        ...styles.domainBtn,
                        ...(isSelected ? styles.domainBtnActive : {}),
                        borderLeftColor: statusColor
                      }}
                      onClick={() => setSelectedDomain(domain)}
                    >
                      <div style={styles.domainBtnTop}>
                        <span style={styles.domainIcon}>{config.icon}</span>
                        <span style={styles.domainLabel}>{config.label}</span>
                        <span style={{
                          ...styles.domainStatus,
                          color: statusColor,
                          backgroundColor: SEVERITY_STYLES[summary.status]?.bg
                        }}>
                          {summary.featureReady ? '✓' : '○'}
                        </span>
                      </div>
                      <div style={styles.domainStats}>
                        <span style={{ color: '#10b981' }}>{summary.passed}</span>
                        <span style={styles.statDivider}>/</span>
                        <span style={{ color: '#f59e0b' }}>{summary.warned}</span>
                        <span style={styles.statDivider}>/</span>
                        <span style={{ color: '#ef4444' }}>{summary.failed}</span>
                      </div>
                    </button>
                  )
                })}
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
                  {report.domainSummaries[selectedDomain] && (
                    <div style={{
                      ...styles.featureReadyBadge,
                      backgroundColor: report.domainSummaries[selectedDomain].featureReady 
                        ? 'rgba(16, 185, 129, 0.1)' 
                        : 'rgba(245, 158, 11, 0.1)',
                      color: report.domainSummaries[selectedDomain].featureReady 
                        ? '#10b981' 
                        : '#f59e0b'
                    }}>
                      {report.domainSummaries[selectedDomain].featureReady 
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
                        style={{
                          ...styles.ruleCard,
                          borderLeftColor: severity.color
                        }}
                      >
                        <button 
                          style={styles.ruleHeader}
                          onClick={() => toggleRule(rule.ruleId)}
                        >
                          <div style={styles.ruleHeaderLeft}>
                            <span style={{
                              ...styles.ruleSeverityIcon,
                              color: severity.color,
                              backgroundColor: severity.bg
                            }}>
                              {rule.passed ? '✓' : rule.severity === 'fail' ? '✗' : '⚠'}
                            </span>
                            <div style={styles.ruleInfo}>
                              <span style={styles.ruleName}>{rule.ruleName}</span>
                              <span style={styles.ruleId}>{rule.ruleId}</span>
                            </div>
                          </div>
                          <div style={styles.ruleHeaderRight}>
                            {rule.isIdsRule && (
                              <span style={styles.idsTag}>IDS</span>
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

                            {/* IDS Rule Info */}
                            {rule.isIdsRule && (
                              <div style={styles.idsInfo}>
                                <span style={styles.idsInfoIcon}>📋</span>
                                <span>
                                  This rule is validated using <strong>IDS (Information Delivery Specification)</strong> standards.
                                  It checks for required IFC entities and their relationships.
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

const softShadow = '0 4px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)';

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '24px',
  },

  modal: {
    width: '100%',
    maxWidth: '960px',
    maxHeight: '85vh',
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    border: '1px solid rgba(0, 0, 0, 0.04)',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
    flexShrink: 0,
    background: '#ffffff',
  },

  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },

  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#1a1a1a',
    letterSpacing: '-0.02em',
  },

  statusBadge: {
    fontSize: '12px',
    fontWeight: 500,
    padding: '4px 10px',
    borderRadius: '12px',
  },

  closeBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    border: '1px solid rgba(0, 0, 0, 0.06)',
    background: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
    transition: 'all 0.2s ease',
  },

  content: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    background: '#fafafa',
  },

  progressSection: {
    padding: '16px 24px',
    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
    flexShrink: 0,
  },

  progressBar: {
    height: '6px',
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    borderRadius: '3px',
    display: 'flex',
    overflow: 'hidden',
  },

  progressSegment: {
    height: '100%',
    transition: 'width 0.3s ease',
  },

  progressLabels: {
    display: 'flex',
    gap: '16px',
    marginTop: '10px',
  },

  progressLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#6b7280',
  },

  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },

  mainLayout: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },

  sidebar: {
    width: '220px',
    borderRight: '1px solid rgba(0, 0, 0, 0.06)',
    padding: '16px',
    flexShrink: 0,
    overflowY: 'auto',
    background: '#ffffff',
  },

  sidebarLabel: {
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#9ca3af',
    marginBottom: '12px',
    padding: '0 8px',
  },

  domainBtn: {
    width: '100%',
    padding: '12px',
    marginBottom: '8px',
    background: '#f9f9f9',
    border: '1px solid rgba(0, 0, 0, 0.04)',
    borderRadius: '8px',
    cursor: 'pointer',
    textAlign: 'left',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
    transition: 'all 0.2s ease',
  },

  domainBtnActive: {
    backgroundColor: '#ffffff',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.08)',
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },

  domainBtnTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  domainIcon: {
    fontSize: '14px',
    opacity: 0.6,
  },

  domainLabel: {
    flex: 1,
    fontSize: '13px',
    fontWeight: 500,
    color: '#374151',
  },

  domainStatus: {
    width: '20px',
    height: '20px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
  },

  domainStats: {
    marginTop: '6px',
    marginLeft: '22px',
    fontSize: '11px',
    color: '#9ca3af',
  },

  statDivider: {
    margin: '0 2px',
    opacity: 0.4,
  },

  rulesPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  rulesPanelHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexShrink: 0,
  },

  rulesPanelTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 600,
    color: '#1a1a1a',
  },

  rulesPanelDesc: {
    margin: '4px 0 0 0',
    fontSize: '12px',
    color: '#9ca3af',
  },

  featureReadyBadge: {
    fontSize: '11px',
    fontWeight: 500,
    padding: '4px 10px',
    borderRadius: '12px',
  },

  rulesList: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
  },

  ruleCard: {
    marginBottom: '8px',
    borderRadius: '10px',
    borderLeft: '3px solid',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
    border: '1px solid rgba(0, 0, 0, 0.04)',
    transition: 'all 0.2s ease',
  },

  ruleHeader: {
    width: '100%',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },

  ruleHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },

  ruleSeverityIcon: {
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 600,
  },

  ruleInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },

  ruleName: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#374151',
  },

  ruleId: {
    fontSize: '10px',
    color: '#9ca3af',
    fontFamily: 'SF Mono, Monaco, monospace',
  },

  ruleHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },

  idsTag: {
    fontSize: '9px',
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    color: '#6366f1',
    letterSpacing: '0.03em',
  },

  ruleCoverage: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#6b7280',
    fontFamily: 'SF Mono, Monaco, monospace',
  },

  expandIcon: {
    fontSize: '10px',
    color: '#9ca3af',
    transition: 'transform 0.2s ease',
  },

  ruleDetails: {
    padding: '0 16px 16px 52px',
    borderTop: '1px solid rgba(0, 0, 0, 0.04)',
  },

  ruleDescription: {
    margin: '12px 0',
    fontSize: '13px',
    color: '#6b7280',
    lineHeight: 1.5,
  },

  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
    marginBottom: '16px',
  },

  metricItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },

  metricLabel: {
    fontSize: '10px',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },

  metricValue: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151',
  },

  coverageBarContainer: {
    marginBottom: '16px',
  },

  coverageBar: {
    position: 'relative',
    height: '8px',
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    borderRadius: '4px',
    overflow: 'visible',
  },

  coverageFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },

  thresholdMarker: {
    position: 'absolute',
    top: '-2px',
    width: '2px',
    height: '12px',
    backgroundColor: '#f59e0b',
    borderRadius: '1px',
  },

  coverageLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '6px',
    fontSize: '10px',
    color: '#9ca3af',
  },

  messageBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#6b7280',
    marginBottom: '12px',
  },

  messageIcon: {
    flexShrink: 0,
    width: '18px',
    height: '18px',
    borderRadius: '9px',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    color: '#6366f1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
  },

  recommendationsSection: {
    padding: '12px',
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
    borderRadius: '8px',
    border: '1px solid rgba(245, 158, 11, 0.15)',
    marginBottom: '12px',
  },

  recommendationsLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: '#d97706',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },

  recommendationsList: {
    margin: 0,
    paddingLeft: '16px',
  },

  recommendationItem: {
    fontSize: '12px',
    color: '#92400e',
    lineHeight: 1.5,
    marginBottom: '4px',
  },

  idsInfo: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: 'rgba(99, 102, 241, 0.06)',
    borderRadius: '8px',
    fontSize: '11px',
    color: '#4f46e5',
    lineHeight: 1.5,
  },

  idsInfoIcon: {
    flexShrink: 0,
  },

  footer: {
    display: 'flex',
    gap: '24px',
    padding: '12px 24px',
    borderTop: '1px solid rgba(0, 0, 0, 0.06)',
    fontSize: '11px',
    color: '#9ca3af',
    flexShrink: 0,
    background: '#ffffff',
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
    fontSize: '13px',
  },

  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid rgba(0, 0, 0, 0.06)',
    borderTopColor: '#6366f1',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },

  errorState: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    color: '#ef4444',
    fontSize: '13px',
  },

  errorIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '16px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
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
