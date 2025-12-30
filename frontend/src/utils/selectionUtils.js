export const normalizeIds = (globalIdOrIds) => {
  if (globalIdOrIds == null) return []
  const ids = Array.isArray(globalIdOrIds) ? globalIdOrIds : [globalIdOrIds]
  return ids.filter(id => id != null)
}
