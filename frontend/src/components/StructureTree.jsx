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
          <div style={styles.message}>Loading hierarchy...</div>
        )}

        {error && (
          <div style={styles.errorMessage}>⚠️ {error}</div>
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
            <div style={styles.statItem}>
              <span>Buildings</span>
              <span>{hierarchy.statistics.buildings}</span>
            </div>
            <div style={styles.statItem}>
              <span>Storeys</span>
              <span>{hierarchy.statistics.storeys}</span>
            </div>
            <div style={styles.statItem}>
              <span>Elements</span>
              <span>{hierarchy.statistics.totalElements}</span>
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
  
  // Get icon based on type
  const icon = getTypeIcon(node.type)
  
  return (
    <div style={styles.nodeContainer}>
      <div 
        style={{
          ...styles.node,
          paddingLeft: `${depth * 16 + 8}px`,
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
            {isExpanded ? '▼' : '▶'}
          </button>
        ) : (
          <span style={styles.expandPlaceholder} />
        )}

        {/* Icon */}
        <span style={styles.icon}>{icon}</span>

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
              {isIsolated ? '👁️' : '◎'}
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
 * Get icon for IFC type
 */
function getTypeIcon(type) {
  const icons = {
    'IfcProject': '📋',
    'IfcSite': '🌍',
    'IfcBuilding': '🏢',
    'IfcBuildingStorey': '📐',
    'IfcSpace': '⬜',
    'IfcWall': '🧱',
    'IfcWallStandardCase': '🧱',
    'IfcDoor': '🚪',
    'IfcWindow': '🪟',
    'IfcSlab': '⬛',
    'IfcRoof': '🏠',
    'IfcStair': '🪜',
    'IfcColumn': '🔲',
    'IfcBeam': '📏',
    'IfcFurniture': '🪑',
    'IfcCovering': '🎨',
    'IfcRailing': '🚧',
    'Category': '📁',
  }
  return icons[type] || '📦'
}

/**
 * Styles
 */
const styles = {
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '280px',
    height: '100%',
    background: 'rgba(26, 26, 46, 0.95)',
    borderRight: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#ffffff',
    backdropFilter: 'blur(10px)',
  },
  header: {
    padding: '16px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  showAllBtn: {
    padding: '4px 8px',
    background: 'rgba(100, 108, 255, 0.3)',
    border: '1px solid rgba(100, 108, 255, 0.5)',
    borderRadius: '4px',
    color: '#a5a8ff',
    fontSize: '11px',
    cursor: 'pointer',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '8px 0',
  },
  message: {
    padding: '20px',
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  errorMessage: {
    padding: '20px',
    textAlign: 'center',
    color: '#ff6b6b',
  },
  tree: {
    fontSize: '13px',
  },
  nodeContainer: {
    userSelect: 'none',
  },
  node: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 8px',
    cursor: 'pointer',
    transition: 'background 0.15s',
    gap: '4px',
  },
  nodeSelected: {
    background: 'rgba(255, 255, 0, 0.15)',
  },
  nodeIsolated: {
    background: 'rgba(100, 108, 255, 0.2)',
  },
  expandBtn: {
    width: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.4)',
    cursor: 'pointer',
    fontSize: '10px',
    padding: 0,
    flexShrink: 0,
  },
  expandPlaceholder: {
    width: '16px',
    flexShrink: 0,
  },
  icon: {
    fontSize: '14px',
    marginRight: '4px',
    flexShrink: 0,
  },
  label: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'flex',
    gap: '4px',
    opacity: 0.6,
  },
  actionBtn: {
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: '4px',
    color: 'rgba(255, 255, 255, 0.6)',
    cursor: 'pointer',
    fontSize: '10px',
    padding: 0,
  },
  actionBtnActive: {
    background: 'rgba(100, 108, 255, 0.3)',
    borderColor: 'rgba(100, 108, 255, 0.5)',
    color: '#a5a8ff',
  },
  children: {
    // Children are indented via paddingLeft on node
  },
  stats: {
    padding: '12px 16px',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  statItem: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.5)',
  },
}

export default StructureTree
