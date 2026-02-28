import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../utils/api'

/**
 * useWorkOrderMarkers
 *
 * When active (Work Orders panel is open), fetches the list of elements
 * that have active work orders and exposes marker data for the 3D overlay.
 *
 * @param {string|null} jobId
 * @param {boolean} isActive - true when the Work Orders panel is open
 * @returns {{ markerData: Array<{ globalId: string, count: number, maxPriority: string }>, refresh: () => void }}
 */
export default function useWorkOrderMarkers(jobId, isActive) {
  const [markerData, setMarkerData] = useState([])
  const versionRef = useRef(0)

  const fetchActiveElements = useCallback(async () => {
    if (!jobId) { setMarkerData([]); return }
    const version = ++versionRef.current
    try {
      const res = await apiFetch(`/api/work-orders/${jobId}/active-elements`)
      if (!res.ok) { setMarkerData([]); return }
      const data = await res.json()
      // Only apply if this is still the latest request
      if (version === versionRef.current) {
        setMarkerData(
          (data || []).map((d) => ({
            globalId: d.global_id,
            count: d.count,
            maxPriority: d.max_priority,
          }))
        )
      }
    } catch {
      if (version === versionRef.current) setMarkerData([])
    }
  }, [jobId])

  // Fetch when activated, clear when deactivated
  useEffect(() => {
    if (isActive) {
      fetchActiveElements()
    } else {
      setMarkerData([])
    }
  }, [isActive, fetchActiveElements])

  return { markerData, refresh: fetchActiveElements }
}
