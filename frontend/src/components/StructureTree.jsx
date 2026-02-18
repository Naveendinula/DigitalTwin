import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { debugLog } from '../utils/logger'

/**
 * StructureTree Component
 * 
 * Renders a collapsible tree view of the building hierarchy.
 * Supports selection and isolation of elements by clicking on nodes.
 * Supports bidirectional selection sync with 3D model.
 * 
 * @param {string} hierarchyUrl - URL to the hierarchy JSON file
 * @param {function} onIsolate - Callback when isolating elements, receives array of GlobalIds
 * @param {function} onSelect - Callback when selecting a single element
 * @param {string|string[]|null} selectedId - Currently selected element GlobalId(s)
 * @param {boolean} focusLock - Whether focus is locked
 * @param {function} onToggleFocusLock - Callback to toggle focus lock
 */
function StructureTree({ 
  hierarchyUrl = '/hierarchy.json', 
  onIsolate,
  onSelect,
  selectedId,
  focusLock = true,
  onToggleFocusLock
}) {
  const [hierarchy, setHierarchy] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  const [isolatedBranch, setIsolatedBranch] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  // Track current isolation mode and IDs
  const [contextMode, setContextMode] = useState('GHOST') // 'GHOST' | 'HIDE'
  const [currentIsolatedIds, setCurrentIsolatedIds] = useState([])
  
  // Ref for scrolling to selected node
  const treeContainerRef = useRef(null)
  const selectedNodeRef = useRef(null)
  
  // Build a map of globalId -> nodeId for quick lookup
  const globalIdToNodeMap = useMemo(() => {
    if (!hierarchy) return new Map()
    
    const map = new Map()
    const traverse = (node, depth = 0) => {
      const nodeId = node.globalId || `${node.type}-${node.name}-${depth}`
      if (node.globalId) {
        map.set(node.globalId, { nodeId, node, depth })
      }
      if (node.children) {
        node.children.forEach(child => traverse(child, depth + 1))
      }
    }
    traverse(hierarchy)
    return map
  }, [hierarchy])
  
  // Normalize selectedId to array for easier comparison
  const selectedIds = useMemo(() => {
    if (!selectedId) return []
    return Array.isArray(selectedId) ? selectedId : [selectedId]
  }, [selectedId])

  const availableTypes = useMemo(() => {
    if (!hierarchy) return []
    const elementsByType = hierarchy?.statistics?.elementsByType
    if (elementsByType && typeof elementsByType === 'object') {
      return Object.keys(elementsByType).sort()
    }

    const types = new Set()
    const traverse = (node) => {
      if (node?.type?.startsWith?.('Ifc')) {
        types.add(node.type)
      }
      if (node?.category?.startsWith?.('Ifc')) {
        types.add(node.category)
      }
      if (node?.children) {
        node.children.forEach(traverse)
      }
    }
    traverse(hierarchy)
    return Array.from(types).sort()
  }, [hierarchy])

  const filterActive = searchQuery.trim() !== '' || typeFilter !== ''

  const filteredHierarchy = useMemo(() => {
    if (!hierarchy) return null

    const query = searchQuery.trim().toLowerCase()
    const typeValue = typeFilter.trim()

    const matchesQuery = (node) => {
      if (!query) return true
      const haystack = [
        node.name,
        node.type,
        node.category,
        node.globalId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    }

    const matchesType = (node) => {
      if (!typeValue) return true
      if (node.type === typeValue) return true
      if (node.category === typeValue) return true
      return false
    }

    const filterNode = (node) => {
      if (!node) return null
      const children = (node.children || [])
        .map(filterNode)
        .filter(Boolean)

      const selfMatches = matchesQuery(node) && matchesType(node)
      if (selfMatches || children.length > 0) {
        const nextNode = { ...node }
        if (children.length > 0) {
          nextNode.children = children
        } else {
          delete nextNode.children
        }
        return nextNode
      }
      return null
    }

    return filterNode(hierarchy)
  }, [hierarchy, searchQuery, typeFilter])

  // Load hierarchy JSON on mount
  useEffect(() => {
    fetch(hierarchyUrl, { credentials: 'include' })
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
    debugLog(`Isolating ${ids.length} elements from "${node.name || node.type}"`)
    
    // Toggle isolation
    if (isolatedBranch === nodeId) {
      setIsolatedBranch(null)
      setCurrentIsolatedIds([])
      onIsolate?.(null) // null means show all
    } else {
      setIsolatedBranch(nodeId)
      setCurrentIsolatedIds(ids)
      // Use current contextMode
      const behavior = contextMode === 'GHOST' ? 'FOCUS' : 'ISOLATE'
      onIsolate?.(ids, { behavior })
    }
  }, [collectGlobalIds, onIsolate, isolatedBranch, contextMode])

  /**
   * Toggle context mode (Ghosted vs Hidden)
   */
  const toggleContextMode = useCallback(() => {
    const newMode = contextMode === 'GHOST' ? 'HIDE' : 'GHOST'
    setContextMode(newMode)
    
    // Re-apply isolation with new mode if active
    if (isolatedBranch && currentIsolatedIds.length > 0) {
      const behavior = newMode === 'GHOST' ? 'FOCUS' : 'ISOLATE'
      onIsolate?.(currentIsolatedIds, { behavior })
    }
  }, [contextMode, isolatedBranch, currentIsolatedIds, onIsolate])

  /**
   * Handle click on a tree element - selects element(s) in the 3D model
   * For leaf nodes: select single element
   * For parent nodes: select all children elements
   */
  const handleSelectElement = useCallback((node) => {
    // If it's a leaf with globalId, select just that element
    if (node.globalId && (!node.children || node.children.length === 0)) {
      onSelect?.(node.globalId)
      return
    }
    
    // For parent nodes, collect all globalIds from children
    const ids = collectGlobalIds(node)
    if (ids.length > 0) {
      // Pass the first ID for single selection, or all IDs for future multi-select
      onSelect?.(ids.length === 1 ? ids[0] : ids)
    }
  }, [onSelect, collectGlobalIds])

  /**
   * Reset isolation
   */
  const handleShowAll = useCallback(() => {
    setIsolatedBranch(null)
    setCurrentIsolatedIds([])
    onIsolate?.(null)
  }, [onIsolate])

  /**
   * Auto-expand and scroll to selected node when selectedId changes from 3D model click
   */
  useEffect(() => {
    if (selectedIds.length === 0 || !hierarchy) return
    
    // Get the first selected ID to scroll to
    const targetId = selectedIds[0]
    const nodeInfo = globalIdToNodeMap.get(targetId)
    
    if (!nodeInfo) return
    
    // Find path to node and expand all ancestors
    const expandPath = (node, targetGlobalId, path = []) => {
      const nodeId = node.globalId || `${node.type}-${node.name}-${path.length}`
      
      if (node.globalId === targetGlobalId) {
        return [...path, nodeId]
      }
      
      if (node.children) {
        for (const child of node.children) {
          const result = expandPath(child, targetGlobalId, [...path, nodeId])
          if (result) return result
        }
      }
      return null
    }
    
    const pathToNode = expandPath(hierarchy, targetId)
    
    if (pathToNode) {
      // Expand all nodes in the path (except the target itself)
      setExpandedNodes(prev => {
        const next = new Set(prev)
        pathToNode.forEach(id => next.add(id))
        return next
      })
      
      // Scroll to node after a brief delay to allow expansion
      setTimeout(() => {
        if (selectedNodeRef.current) {
          selectedNodeRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          })
        }
      }, 100)
    }
  }, [selectedIds, globalIdToNodeMap, hierarchy])

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <h2 style={styles.title}>Structure</h2>
        <div style={styles.headerActions}>
          {isolatedBranch && (
            <>
              <span style={styles.xrayBadge}>
                {contextMode === 'GHOST' ? 'Focus' : 'Isolate'}
              </span>
              <div style={styles.divider} />
              
              {/* Context Toggle: Ghost vs Hide */}
              <button 
                style={styles.iconBtn} 
                onClick={toggleContextMode}
                title={contextMode === 'GHOST' ? "Context: Ghosted (Click to Hide)" : "Context: Hidden (Click to Ghost)"}
              >
                {contextMode === 'GHOST' ? (
                  // Ghost Icon
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 22h6c5 0 7-2 7-7V9c0-5-2-7-7-7H9C4 2 2 4 2 9v6c0 5 2 7 7 7z" />
                    <path d="M9 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" opacity="0.5" />
                    <path d="M15 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" opacity="0.5" />
                  </svg>
                ) : (
                  // Eye Slash Icon
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14.5 9.5L9.5 14.5M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>

              {/* Lock Toggle */}
              <button 
                style={{...styles.iconBtn, color: focusLock ? '#007AFF' : '#636366', background: focusLock ? 'rgba(0,122,255,0.1)' : 'transparent'}}
                onClick={onToggleFocusLock}
                title={focusLock ? "Focus Locked (Click to Unlock)" : "Focus Unlocked (Click to Lock)"}
              >
                {focusLock ? (
                  // Lock Closed
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ) : (
                  // Lock Open
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                )}
              </button>

              {/* Focus Selected (only if locked & selection exists) */}
              {focusLock && selectedIds.length > 0 && (
                <button 
                  style={styles.iconBtn}
                  onClick={() => {
                    const behavior = contextMode === 'GHOST' ? 'FOCUS' : 'ISOLATE'
                    onIsolate?.(selectedIds, { behavior })
                  }}
                  title="Set focus to current selection"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="22" y1="12" x2="18" y2="12" />
                    <line x1="6" y1="12" x2="2" y2="12" />
                    <line x1="12" y1="6" x2="12" y2="2" />
                    <line x1="12" y1="22" x2="12" y2="18" />
                  </svg>
                </button>
              )}

              <div style={styles.divider} />

              {/* Show All / Exit */}
              <button 
                style={styles.iconBtn} 
                onClick={handleShowAll}
                title="Show All (Exit Isolation)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </>
          )}
        </div>
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
          <>
            <div style={styles.filterBar}>
              <input
                style={styles.searchInput}
                type="text"
                value={searchQuery}
                placeholder="Search structure..."
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                style={styles.filterSelect}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All IFC Types</option>
                {availableTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              {filterActive && (
                <button
                  style={styles.clearBtn}
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setTypeFilter('')
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {filteredHierarchy ? (
              <div style={styles.tree} ref={treeContainerRef}>
                <TreeNode
                  node={filteredHierarchy}
                  depth={0}
                  expandedNodes={expandedNodes}
                  toggleExpand={toggleExpand}
                  onIsolate={handleIsolate}
                  onSelect={handleSelectElement}
                  selectedIds={selectedIds}
                  isolatedBranch={isolatedBranch}
                  selectedNodeRef={selectedNodeRef}
                  forceExpand={filterActive}
                />
              </div>
            ) : (
              <div style={styles.message}>
                <p>No matches found.</p>
              </div>
            )}
          </>
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
  selectedIds = [],
  isolatedBranch,
  selectedNodeRef,
  forceExpand = false
}) {
  const nodeId = node.globalId || `${node.type}-${node.name}-${depth}`
  const hasChildren = node.children && node.children.length > 0
  const isExpanded = forceExpand ? true : expandedNodes.has(nodeId)
  const isSelected = node.globalId && selectedIds.includes(node.globalId)
  const isIsolated = isolatedBranch === nodeId
  const isLeaf = !hasChildren && node.globalId && node.type !== 'Category'
  
  // Use ref for selected node scrolling
  const nodeRef = isSelected ? selectedNodeRef : null
  
  return (
    <div style={styles.nodeContainer} className="tree-node" ref={nodeRef}>
      <div 
        style={{
          ...styles.node,
          ...(isSelected ? styles.nodeSelected : {}),
          ...(isIsolated ? styles.nodeIsolated : {})
        }}
      >
        {/* Fixed left section: indent + expand button */}
        <div style={{ ...styles.nodeLeft, paddingLeft: `${depth * 14}px` }}>
          {hasChildren && !forceExpand ? (
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
        </div>

        {/* Scrollable label section */}
        <div style={styles.labelContainer}>
          <span 
            style={styles.label}
            onClick={() => onSelect?.(node)}
            title={node.name || node.type?.replace('Ifc', '') || 'Unnamed'}
          >
            {node.name || node.type?.replace('Ifc', '') || 'Unnamed'}
          </span>
        </div>

        {/* Fixed right section: action buttons - always visible */}
        <div style={styles.actions} className="actions">
          {hasChildren && (
            <button
              style={{
                ...styles.actionBtn,
                ...(isIsolated ? styles.actionBtnActive : {})
              }}
              onClick={(e) => {
                e.stopPropagation()
                onIsolate(node, nodeId)
              }}
              title={isIsolated ? 'Show all (Exit X-Ray)' : 'Isolate with X-Ray effect'}
            >
              {isIsolated ? (
                // Filled eye icon when isolated/X-Ray active
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" fill="white" />
                </svg>
              ) : (
                // Outline eye icon when not isolated
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
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
              selectedIds={selectedIds}
              isolatedBranch={isolatedBranch}
              selectedNodeRef={selectedNodeRef}
              forceExpand={forceExpand}
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
const softShadow = 'rgb(255, 255, 255) 1px 1px 1px 0px inset, rgba(0, 0, 0, 0.15) -1px -1px 1px 0px inset, rgba(0, 0, 0, 0.26) 0.444584px 0.444584px 0.628737px -1px, rgba(0, 0, 0, 0.22) 1.21324px 1.21324px 1.38357px -2px, rgba(0, 0, 0, 0.15) 2.60599px 2.60599px 2.68477px -3px, rgba(0, 0, 0, 0.04) 6px 6px 6px -4px';

const styles = {
  panel: {
    width: '100%',
    height: '100%',
    background: '#f4f4f4',
    borderRadius: '12px',
    boxShadow: softShadow,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'inherit',
    color: '#1d1d1f',
    flexShrink: 0,
    overflow: 'hidden',
    margin: 0,
  },
  header: {
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(255, 255, 255, 0.5)',
    gap: '8px',
    borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
  },
  title: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#86868b',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginLeft: 'auto',
  },
  xrayBadge: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#007AFF',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginRight: '4px',
  },
  iconBtn: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#e8e8ec',
    border: 'none',
    borderRadius: '8px',
    color: '#636366',
    cursor: 'pointer',
    padding: 0,
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.1), 0.5px 0.5px 1px rgba(0,0,0,0.15)',
  },
  divider: {
    width: '1px',
    height: '16px',
    background: 'rgba(0, 0, 0, 0.1)',
    margin: '0 4px',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(255, 255, 255, 0.3)',
  },
  filterBar: {
    display: 'flex',
    gap: '8px',
    padding: '12px 12px 8px 12px',
    background: 'rgba(255, 255, 255, 0.4)',
    borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
  },
  searchInput: {
    flex: 1,
    padding: '6px 10px',
    borderRadius: '8px',
    border: 'none',
    background: '#e8e8ec',
    fontSize: '12px',
    color: '#1d1d1f',
    boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.08), inset -1px -1px 2px rgba(255,255,255,0.6)',
    outline: 'none',
  },
  filterSelect: {
    width: '110px',
    padding: '6px 8px',
    borderRadius: '8px',
    border: 'none',
    background: '#e8e8ec',
    fontSize: '12px',
    color: '#1d1d1f',
    boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.08), inset -1px -1px 2px rgba(255,255,255,0.6)',
    outline: 'none',
  },
  clearBtn: {
    padding: '6px 10px',
    borderRadius: '8px',
    border: 'none',
    background: '#f4f4f4',
    fontSize: '11px',
    fontWeight: 600,
    color: '#6B7280',
    cursor: 'pointer',
    boxShadow: softShadow,
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
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  nodeContainer: {
    userSelect: 'none',
  },
  node: {
    display: 'flex',
    alignItems: 'center',
    paddingTop: '5px',
    paddingBottom: '5px',
    paddingLeft: '8px',
    paddingRight: '8px',
    cursor: 'pointer',
    transition: 'background 0.15s',
    gap: '0',
    minHeight: '28px',
  },
  nodeSelected: {
    background: 'linear-gradient(90deg, rgba(0, 212, 255, 0.15) 0%, rgba(0, 212, 255, 0.08) 100%)',
    borderLeft: '3px solid #00D4FF',
    paddingLeft: '5px',
  },
  nodeIsolated: {
    background: 'linear-gradient(90deg, rgba(0, 122, 255, 0.12) 0%, rgba(0, 122, 255, 0.05) 100%)',
    borderLeft: '3px solid #007AFF',
    paddingLeft: '5px',
  },
  nodeLeft: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
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
  labelContainer: {
    flex: 1,
    overflow: 'hidden',
    overflowX: 'auto',
    marginRight: '8px',
    scrollbarWidth: 'thin',
    scrollbarColor: '#d1d1d6 transparent',
  },
  label: {
    display: 'inline-block',
    whiteSpace: 'nowrap',
    color: '#1d1d1f',
    cursor: 'pointer',
    padding: '2px 4px',
    borderRadius: '4px',
    transition: 'background 0.15s',
  },
  actions: {
    display: 'flex',
    gap: '4px',
    flexShrink: 0,
    marginLeft: 'auto',
  },
  actionBtn: {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#e8e8ec',
    border: 'none',
    borderRadius: '6px',
    color: '#636366',
    cursor: 'pointer',
    padding: 0,
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.1), 0.5px 0.5px 1px rgba(0,0,0,0.15)',
  },
  actionBtnActive: {
    background: '#007AFF',
    color: '#ffffff',
    boxShadow: 'inset 0.5px 0.5px 1px rgba(255,255,255,0.3), inset -0.5px -0.5px 1px rgba(0,0,0,0.2)',
  },
  children: {
    // Children are indented via paddingLeft on node
  },
  stats: {
    padding: '16px',
    background: 'rgba(255, 255, 255, 0.5)',
    marginTop: 'auto',
    borderTop: '1px solid rgba(0, 0, 0, 0.05)',
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
    background: '#e8e8ec',
    borderRadius: '8px',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.08), 0.5px 0.5px 1px rgba(0,0,0,0.1)',
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
    .tree-node:hover > div:first-child { background: rgba(0, 0, 0, 0.03); }
    .tree-node:hover .actions { opacity: 1 !important; }
    .tree-node .actions { opacity: 0.6; transition: opacity 0.15s; }
    .tree-node .actions button:hover { 
      background: #e5e5e7 !important; 
      border-color: #c7c7cc !important;
      color: #1d1d1f !important;
    }
    .tree-node .actions button:active { 
      transform: scale(0.95); 
    }
    /* Custom scrollbar for label container */
    .tree-node div[style*="overflowX"]::-webkit-scrollbar {
      height: 4px;
    }
    .tree-node div[style*="overflowX"]::-webkit-scrollbar-track {
      background: transparent;
    }
    .tree-node div[style*="overflowX"]::-webkit-scrollbar-thumb {
      background: #d1d1d6;
      border-radius: 4px;
    }
    .tree-node div[style*="overflowX"]::-webkit-scrollbar-thumb:hover {
      background: #aeaeb2;
    }
    /* Label hover effect */
    .tree-node span[style*="cursor"]:hover {
      background: rgba(0, 122, 255, 0.08);
    }
  `
  document.head.appendChild(styleSheet)
}

export default StructureTree
