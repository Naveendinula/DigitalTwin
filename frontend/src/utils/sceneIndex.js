export const DEFAULT_MATCH_DEPTH = 10
export const DEFAULT_INDEX_DEPTH = 5

export const isLikelyGlobalId = (value) => {
  if (!value || typeof value !== 'string') return false
  if (value.includes('-') || value.includes('openings')) return false
  if (value === 'Scene' || value === 'RootNode') return false
  return value.length >= 20 && value.length <= 24
}

export const collectMeshIdKeys = (mesh, options = {}) => {
  if (!mesh) return new Set()
  const {
    ancestorDepth = DEFAULT_INDEX_DEPTH,
    includeName = true,
    includeUserData = true,
    filterAncestorNames
  } = options
  const keys = new Set()

  if (includeName && mesh.name) {
    keys.add(mesh.name)
  }
  if (includeUserData && mesh.userData?.GlobalId) {
    keys.add(mesh.userData.GlobalId)
  }

  let ancestor = mesh.parent
  let depth = 0
  while (ancestor && depth < ancestorDepth) {
    if (includeName && ancestor.name) {
      if (!filterAncestorNames || filterAncestorNames(ancestor.name)) {
        keys.add(ancestor.name)
      }
    }
    if (includeUserData && ancestor.userData?.GlobalId) {
      keys.add(ancestor.userData.GlobalId)
    }
    ancestor = ancestor.parent
    depth++
  }

  return keys
}

export const buildMeshIndex = (scene, options = {}) => {
  const index = new Map()
  const meshes = []

  if (!scene) return { index, meshes }

  scene.traverse((object) => {
    if (!object.isMesh) return
    meshes.push(object)
    const keys = collectMeshIdKeys(object, options)
    keys.forEach((key) => {
      if (!index.has(key)) {
        index.set(key, new Set())
      }
      index.get(key).add(object)
    })
  })

  return { index, meshes }
}

export const getMeshesForIds = (idsSet, index) => {
  const selectedMeshes = new Set()
  if (!idsSet || idsSet.size === 0) return selectedMeshes

  idsSet.forEach((id) => {
    const meshes = index.get(id)
    if (meshes) {
      meshes.forEach((mesh) => selectedMeshes.add(mesh))
    }
  })

  return selectedMeshes
}

export const isMeshMatchingIds = (mesh, idsSet, options = {}) => {
  if (!mesh || !idsSet || idsSet.size === 0) return false
  const { ancestorDepth = DEFAULT_MATCH_DEPTH } = options

  if (mesh.name && idsSet.has(mesh.name)) return true
  if (mesh.userData?.GlobalId && idsSet.has(mesh.userData.GlobalId)) return true

  let ancestor = mesh.parent
  let depth = 0
  while (ancestor && depth < ancestorDepth) {
    if (ancestor.name && idsSet.has(ancestor.name)) return true
    if (ancestor.userData?.GlobalId && idsSet.has(ancestor.userData.GlobalId)) return true
    ancestor = ancestor.parent
    depth++
  }

  return false
}

export const findMeshGlobalId = (mesh, options = {}) => {
  if (!mesh) return null

  const {
    ancestorDepth = DEFAULT_MATCH_DEPTH,
    allowNameFallback = false,
    preferUserData = false,
    preferAncestorName = true
  } = options

  const nameId = isLikelyGlobalId(mesh.name) ? mesh.name : null
  const userId = mesh.userData?.GlobalId || null

  if (preferUserData) {
    if (userId) return userId
    if (nameId) return nameId
  } else {
    if (nameId) return nameId
    if (userId) return userId
  }

  let ancestor = mesh.parent
  let depth = 0
  while (ancestor && depth < ancestorDepth) {
    const ancestorNameId = isLikelyGlobalId(ancestor.name) ? ancestor.name : null
    const ancestorUserId = ancestor.userData?.GlobalId || null

    if (preferAncestorName) {
      if (ancestorNameId) return ancestorNameId
      if (ancestorUserId) return ancestorUserId
    } else {
      if (ancestorUserId) return ancestorUserId
      if (ancestorNameId) return ancestorNameId
    }

    ancestor = ancestor.parent
    depth++
  }

  if (allowNameFallback && mesh.name) {
    return mesh.name
  }

  return null
}

export const findMeshesByIds = (scene, idsSet, options = {}) => {
  const matches = []
  if (!scene || !idsSet || idsSet.size === 0) return matches

  scene.traverse((object) => {
    if (object.isMesh && isMeshMatchingIds(object, idsSet, options)) {
      matches.push(object)
    }
  })

  return matches
}
