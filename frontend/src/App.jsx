import React, { useCallback, useState } from 'react'
import Viewer from './components/Viewer'
import SelectableModel from './components/SelectableModelWithVisibility'
import PropertyPanel from './components/PropertyPanel'
import StructureTree from './components/StructureTree'
import UploadPanel from './components/UploadPanel'
import useSelection from './hooks/useSelection'
import useVisibility from './hooks/useVisibility'

/**
 * Main Application Component
 * 
 * Composes the Viewer, Model, PropertyPanel, and StructureTree components.
 * Supports element selection, property display, and visibility isolation.
 */
function App() {
  // Model URLs - null until uploaded
  const [modelUrls, setModelUrls] = useState(null)

  // Selection state management
  const { selectedId, handleSelect, deselect } = useSelection()
  
  // Visibility control
  const { setScene, isolate, showAll } = useVisibility()

  /**
   * Handle model ready after upload
   */
  const handleModelReady = useCallback((urls) => {
    console.log('Model ready:', urls)
    setModelUrls(urls)
  }, [])

  /**
   * Handle scene ready - register with visibility controller
   */
  const handleSceneReady = useCallback((scene) => {
    setScene(scene)
    console.log('Scene registered with visibility controller')
  }, [setScene])

  /**
   * Handle isolation from tree view
   */
  const handleIsolate = useCallback((globalIds) => {
    if (globalIds === null) {
      showAll()
    } else {
      isolate(globalIds)
    }
  }, [isolate, showAll])

  /**
   * Handle selection from tree view
   */
  const handleTreeSelect = useCallback((globalId) => {
    console.log('Selected from tree:', globalId)
  }, [])

  // Show upload panel if no model loaded
  if (!modelUrls) {
    return <UploadPanel onModelReady={handleModelReady} hasModel={false} />
  }

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {/* 3D Viewer */}
      <Viewer onMissed={deselect}>
        <SelectableModel 
          url={modelUrls.glbUrl}
          onSelect={handleSelect}
          onSceneReady={handleSceneReady}
          position={[0, 0, 0]}
          scale={1}
        />
      </Viewer>
      
      {/* Structure Tree - Left Panel */}
      <StructureTree 
        hierarchyUrl={modelUrls.hierarchyUrl}
        onIsolate={handleIsolate}
        onSelect={handleTreeSelect}
        selectedId={selectedId}
      />
      
      {/* Property Panel - Right Panel */}
      <PropertyPanel 
        selectedId={selectedId}
        metadataUrl={modelUrls.metadataUrl}
      />
      
      {/* Upload new model button */}
      <UploadPanel onModelReady={handleModelReady} hasModel={true} />
    </div>
  )
}

export default App
