import { useCallback, useRef } from 'react'

export default function useViewerScene({
  setScene,
  setSectionScene,
  setSelectionScene,
  setXRayScene,
  setFocusScene,
  setViewModeScene,
  setSectionCamera,
  setFocusCamera,
  setViewModeCamera,
  setSectionRenderer,
  setSectionControls,
  setFocusControls,
  setViewModeControls,
  fitToModel,
  getModelBounds
}) {
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const pendingFitRef = useRef(false)

  const requestFitToModel = useCallback(() => {
    pendingFitRef.current = true
  }, [])

  const maybeFitToModel = useCallback(() => {
    if (!pendingFitRef.current) return
    const bounds = getModelBounds(true)
    if (bounds && cameraRef.current && controlsRef.current) {
      fitToModel()
      pendingFitRef.current = false
    }
  }, [fitToModel, getModelBounds])

  const handleSceneReady = useCallback((scene, camera, gl) => {
    setScene(scene)
    setSectionScene(scene)
    setSelectionScene(scene)
    setXRayScene(scene)
    setFocusScene(scene)
    setViewModeScene(scene)
    if (camera) {
      setSectionCamera(camera)
      setFocusCamera(camera)
      setViewModeCamera(camera)
      cameraRef.current = camera
    }
    if (gl) {
      setSectionRenderer(gl)
    }
    maybeFitToModel()
    console.log('Scene registered with visibility, section, selection, X-ray, focus, and view mode controllers')
  }, [setScene, setSectionScene, setSelectionScene, setXRayScene, setFocusScene, setViewModeScene, setSectionCamera, setFocusCamera, setViewModeCamera, setSectionRenderer, maybeFitToModel])

  const handleRendererReady = useCallback((gl, camera) => {
    if (gl) {
      setSectionRenderer(gl)
    }
    if (camera) {
      setSectionCamera(camera)
      cameraRef.current = camera
    }
    console.log('Renderer ready, clipping enabled')
  }, [setSectionRenderer, setSectionCamera])

  const handleControlsReady = useCallback((controls) => {
    setSectionControls(controls)
    setFocusControls(controls)
    setViewModeControls(controls)
    controlsRef.current = controls
    maybeFitToModel()
    console.log('Orbit controls ready')
  }, [setSectionControls, setFocusControls, setViewModeControls, maybeFitToModel])

  return {
    cameraRef,
    controlsRef,
    requestFitToModel,
    handleSceneReady,
    handleRendererReady,
    handleControlsReady
  }
}
