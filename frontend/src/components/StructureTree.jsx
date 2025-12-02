import React, { useState, useEffect, useCallback } from 'react'

/**
 * StructureTree Component
 * 
 * Renders a collapsible tree view of the building hierarchy.
 * Supports selection and isolation of elements by clicking on nodes.
 * 
 * @param {string} hierarchyUrl - URL to the hierarchy JSON file
 * @param {function} onIsolate - Callback when isolating elements, receives array of GlobalIds
 * @param {function} onSelect - Callback when selecting a single element
 * @param {string|null} selectedId - Currently selected element GlobalId
 */
function StructureTree({ 
  hierarchyUrl = '/hierarchy.json', 
  onIsolate,
  onSelect,
  selectedId 
}) {
  const [hierarchy, setHierarchy] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  const [isolatedBranch, setIsolatedBranch] = useState(null)

  // Load hierarchy JSON on mount
  useEffect(() => {
    fetch(hierarchyUrl)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load hierarchy')
        return res.json()
      })
      .then(data => {
        setHierarchy(data)
        setLoading(false)
        // Auto-expand first two levels
        const initialExpanded = new Set()
        collectExpandedNodes(data, 0, 2, initialExpanded)
        setExpandedNodes(initialExpanded)
      })
      .catch(err => {
        console.error('Error loading hierarchy:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [hierarchyUrl])

  /**
   * Collect node IDs to expand initially
   */
  const collectExpandedNodes = (node, depth, maxDepth, set) => {
    if (depth >= maxDepth) return
    const nodeId = node.globalId || `${node.type}-${node.name}`
    set.add(nodeId)
    if (node.children) {
      node.children.forEach(child => collectExpandedNodes(child, depth + 1, maxDepth, set))
    }
  }

  /**
   * Toggle expand/collapse for a node
   */
  const toggleExpand = useCallback((nodeId) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  /**
   * Collect all GlobalIds in a branch (recursive)
   */
  const collectGlobalIds = useCallback((node) => {
    const ids = []
    
    const traverse = (n) => {
      // Add this node's GlobalId if it's an actual element
      if (n.globalId && n.type !== 'Category') {
        ids.push(n.globalId)
      }
      // Recurse into children
      if (n.children) {
        n.children.forEach(child => traverse(child))
      }
    }
    
    traverse(node)
    return ids
  }, [])

  /**
   * Handle isolation click - isolate all elements in this branch
   */
  const handleIsolate = useCallback((node, nodeId) => {
    const ids = collectGlobalIds(node)
    console.log(`Isolating ${ids.length} elements from "${node.name || node.type}"`)
    
    // Toggle isolation
    if (isolatedBranch === nodeId) {
      setIsolatedBranch(null)
      onIsolate?.(null) // null means show all
    } else {
      setIsolatedBranch(nodeId)
      onIsolate?.(ids)
    }
  }, [collectGlobalIds, onIsolate, isolatedBranch])

  /**
   * Handle click on a leaf element
   */
  const handleSelectElement = useCallback((node) => {
    if (node.globalId) {
      onSelect?.(node.globalId)
    }
  }, [onSelect])

  /**
   * Reset isolation
   */
  const handleShowAll = useCallback(() => {
    setIsolatedBranch(null)
    onIsolate?.(null)
  }, [onIsolate])

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <h2 style={styles.title}>Structure</h2>
        {isolatedBranch && (
          <button style={styles.showAllBtn} onClick={handleShowAll}>
            Show All
          </button>
        )}
      </div>

      <div style={styles.content}>
        {loading && (
          <div style={styles.message}>
            <div style={styles.loadingSpinner}></div>
            <p>Loading hierarchy...</p>
          </div>
        )}

        {error && (
          <div style={styles.errorMessage}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && hierarchy && (
          <div style={styles.tree}>
            <TreeNode
              node={hierarchy}
              depth={0}
              expandedNodes={expandedNodes}
              toggleExpand={toggleExpand}
              onIsolate={handleIsolate}
              onSelect={handleSelectElement}
              selectedId={selectedId}
              isolatedBranch={isolatedBranch}
            />
          </div>
        )}

        {/* Statistics */}
        {hierarchy?.statistics && (
          <div style={styles.stats}>
            <div style={styles.statsHeader}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#86868b" strokeWidth="2">
                <path d="M18 20V10" />
                <path d="M12 20V4" />
                <path d="M6 20v-6" />
              </svg>
              <span>Statistics</span>
            </div>
            <div style={styles.statsGrid}>
              <div style={styles.statItem}>
                <span style={styles.statValue}>{hierarchy.statistics.buildings}</span>
                <span style={styles.statLabel}>Buildings</span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statValue}>{hierarchy.statistics.storeys}</span>
                <span style={styles.statLabel}>Storeys</span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statValue}>{hierarchy.statistics.totalElements}</span>
                <span style={styles.statLabel}>Elements</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * TreeNode Component - Recursive tree node
 */
function TreeNode({ 
  node, 
  depth, 
  expandedNodes, 
  toggleExpand, 
  onIsolate,
  onSelect,
  selectedId,
  isolatedBranch
}) {
  const nodeId = node.globalId || `${node.type}-${node.name}-${depth}`
  const hasChildren = node.children && node.children.length > 0
  const isExpanded = expandedNodes.has(nodeId)
  const isSelected = node.globalId === selectedId
  const isIsolated = isolatedBranch === nodeId
  const isLeaf = !hasChildren && node.globalId && node.type !== 'Category'
  
  return (
    <div style={styles.nodeContainer}>
      <div 
        style={{
          ...styles.node,
          paddingLeft: `${depth * 16 + 12}px`,
          ...(isSelected ? styles.nodeSelected : {}),
          ...(isIsolated ? styles.nodeIsolated : {})
        }}
      >
        {/* Expand/Collapse button */}
        {hasChildren ? (
          <button 
            style={styles.expandBtn}
            onClick={() => toggleExpand(nodeId)}
          >
            <svg 
              width="10" 
              height="10" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ) : (
          <span style={styles.expandPlaceholder} />
        )}

        {/* Node label */}
        <span 
          style={styles.label}
          onClick={() => isLeaf && onSelect?.(node)}
        >
          {node.name || node.type?.replace('Ifc', '') || 'Unnamed'}
        </span>

        {/* Action buttons */}
        <div style={styles.actions}>
          {/* Isolate button for branches with children */}
          {hasChildren && (
            <button
              style={{
                ...styles.actionBtn,
                ...(isIsolated ? styles.actionBtnActive : {})
              }}
              onClick={() => onIsolate(node, nodeId)}
              title={isIsolated ? 'Show all' : 'Isolate this branch'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div style={styles.children}>
          {node.children.map((child, index) => (
            <TreeNode
              key={child.globalId || `${child.type}-${child.name}-${index}`}
              node={child}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              toggleExpand={toggleExpand}
              onIsolate={onIsolate}
              onSelect={onSelect}
              selectedId={selectedId}
              isolatedBranch={isolatedBranch}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Styles
 */
const styles = {
  panel: {
    width: '280px',
    height: '100%',
    background: '#ffffff',
    borderRight: '1px solid #e5e5e7',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: '#1d1d1f',
    flexShrink: 0,
  },
  header: {
    padding: '16px 16px',
    borderBottom: '1px solid #e5e5e7',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#fafafa',
  },
  title: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#86868b',
  },
  showAllBtn: {
    padding: '4px 10px',
    background: '#1d1d1f',
    border: 'none',
    borderRadius: '4px',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  message: {
    padding: '20px',
    textAlign: 'center',
    color: '#86868b',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  loadingSpinner: {
    width: '24px',
    height: '24px',
    border: '2px solid #f0f0f2',
    borderTopColor: '#1d1d1f',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  errorMessage: {
    padding: '20px',
    textAlign: 'center',
    color: '#ff3b30',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  tree: {
    fontSize: '13px',
    padding: '8px 0',
    flex: 1,
  },
  nodeContainer: {
    userSelect: 'none',
  },
  node: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    cursor: 'pointer',
    transition: 'background 0.15s',
    gap: '4px',
  },
  nodeSelected: {
    background: 'rgba(0, 122, 255, 0.1)',
  },
  nodeIsolated: {
    background: '#f5f5f7',
  },
  expandBtn: {
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    color: '#86868b',
    cursor: 'pointer',
    fontSize: '10px',
    padding: 0,
    flexShrink: 0,
    borderRadius: '4px',
  },
  expandPlaceholder: {
    width: '18px',
    flexShrink: 0,
  },
  label: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: '#1d1d1f',
  },
  actions: {
    display: 'flex',
    gap: '4px',
    opacity: 0,
    transition: 'opacity 0.15s',
  },
  actionBtn: {
    width: '22px',
    height: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f5f5f7',
    border: '1px solid #e5e5e7',
    borderRadius: '4px',
    color: '#86868b',
    cursor: 'pointer',
    padding: 0,
  },
  actionBtnActive: {
    background: '#1d1d1f',
    borderColor: '#1d1d1f',
    color: '#ffffff',
  },
  children: {
    // Children are indented via paddingLeft on node
  },
  stats: {
    padding: '16px',
    borderTop: '1px solid #e5e5e7',
    background: '#fafafa',
    marginTop: 'auto',
  },
  statsHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#86868b',
    marginBottom: '12px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 8px',
    background: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e5e7',
  },
  statValue: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1d1d1f',
  },
  statLabel: {
    fontSize: '10px',
    color: '#86868b',
    marginTop: '2px',
  },
}

// Add hover styles via CSS
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style')
  styleSheet.textContent = `
    .tree-node:hover .actions { opacity: 1 !important; }
  `
  document.head.appendChild(styleSheet)
}

export default StructureTree
