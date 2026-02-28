import { useCallback, useRef } from 'react'
import { buildMeshIndex, getMeshesForIds, isLikelyGlobalId } from '../utils/sceneIndex'
import { debugLog } from '../utils/logger'

/**
 * useSceneIndex Hook
 *
 * Maintains a SINGLE shared mesh index (GlobalId → Set<Mesh>) for the loaded
 * scene. All hooks that need to look up meshes by ID (selection, X-ray,
 * camera-focus) should consume this index instead of building their own.
 *
 * The index is built once when setScene() is called and can be manually
 * rebuilt via rebuild().
 */
export default function useSceneIndex() {
  const sceneRef = useRef(null)
  /** @type {React.MutableRefObject<Map<string, Set<import('three').Mesh>>>} */
  const indexRef = useRef(new Map())
  /** All IFC meshes captured during the last index build */
  const allMeshesRef = useRef([])

  /**
   * (Re-)build the index from the current scene.
   */
  const rebuild = useCallback((scene) => {
    const target = scene || sceneRef.current
    if (!target) return

    const { index, meshes } = buildMeshIndex(target, {
      ancestorDepth: 5,
      includeName: true,
      includeUserData: true,
      filterAncestorNames: isLikelyGlobalId,
    })

    indexRef.current = index

    // Deduplicate meshes captured by the index to get the canonical list
    const indexedMeshes = new Set()
    index.forEach((meshSet) => {
      meshSet.forEach((mesh) => indexedMeshes.add(mesh))
    })
    allMeshesRef.current =
      indexedMeshes.size > 0 ? Array.from(indexedMeshes) : meshes

    debugLog(
      `[useSceneIndex] Built: ${index.size} keys, ${allMeshesRef.current.length} meshes`
    )
  }, [])

  /**
   * Set (or update) the scene reference and build the index.
   */
  const setScene = useCallback(
    (scene) => {
      sceneRef.current = scene
      rebuild(scene)
    },
    [rebuild]
  )

  /**
   * Fast O(k) lookup – returns a Set of meshes matching the given IDs.
   */
  const getMeshes = useCallback((ids) => {
    if (!indexRef.current.size && sceneRef.current) {
      rebuild(sceneRef.current)
    }
    return getMeshesForIds(ids instanceof Set ? ids : new Set(ids), indexRef.current)
  }, [rebuild])

  return {
    /** Call once when the Three.js scene is ready */
    setScene,
    /** Force a re-index (e.g. after dynamic geometry changes) */
    rebuild,
    /** The raw Map – read-only access for hooks that iterate all entries */
    indexRef,
    /** Flat array of every IFC mesh in the scene */
    allMeshesRef,
    /** Convenience: getMeshes(ids) → Set<Mesh> */
    getMeshes,
  }
}
