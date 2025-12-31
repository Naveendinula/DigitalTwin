import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * useOccupancy Hook
 *
 * Manages live occupancy data polling and state for building spaces.
 * Polls the backend at configurable intervals and provides occupancy
 * data as a Map for efficient lookups.
 *
 * @param {Object} options
 * @param {string} options.jobId - Current job ID
 * @param {number} options.pollInterval - Polling interval in ms (default 2000)
 * @param {function} options.showToast - Toast notification function
 */
export default function useOccupancy({ jobId, pollInterval = 2000, showToast }) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null) // { spaces: [...], totals: {...}, timestamp }
  const [occupancyMap, setOccupancyMap] = useState(new Map())

  const pollRef = useRef(null)
  const enabledRef = useRef(enabled)

  // Keep ref in sync
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  /**
   * Fetch current occupancy from backend
   */
  const fetchOccupancy = useCallback(async () => {
    if (!jobId) return null

    try {
      const res = await fetch(`http://localhost:8000/api/occupancy/${jobId}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch occupancy: ${res.status}`)
      }
      return await res.json()
    } catch (err) {
      console.error('Occupancy fetch error:', err)
      throw err
    }
  }, [jobId])

  /**
   * Tick the simulation forward
   */
  const tickOccupancy = useCallback(async () => {
    if (!jobId) return null

    try {
      const res = await fetch(`http://localhost:8000/api/occupancy/tick/${jobId}`, {
        method: 'POST'
      })
      if (!res.ok) {
        throw new Error(`Failed to tick occupancy: ${res.status}`)
      }
      return await res.json()
    } catch (err) {
      console.error('Occupancy tick error:', err)
      throw err
    }
  }, [jobId])

  /**
   * Process raw data into Map for efficient lookups
   */
  const processData = useCallback((rawData) => {
    if (!rawData || !rawData.spaces) {
      setOccupancyMap(new Map())
      return
    }

    const map = new Map()
    for (const space of rawData.spaces) {
      const percent = space.capacity > 0
        ? Math.round((space.occupancy / space.capacity) * 100)
        : 0
      map.set(space.globalId, {
        ...space,
        percent
      })
    }
    setOccupancyMap(map)
  }, [])

  /**
   * Start polling
   */
  const startPolling = useCallback(() => {
    if (pollRef.current) return

    const poll = async () => {
      if (!enabledRef.current) return

      try {
        // Tick simulation and get updated data
        const newData = await tickOccupancy()
        if (newData && enabledRef.current) {
          setData(newData)
          processData(newData)
          setError(null)
        }
      } catch (err) {
        if (enabledRef.current) {
          setError(err.message)
        }
      }

      // Schedule next poll if still enabled
      if (enabledRef.current) {
        pollRef.current = setTimeout(poll, pollInterval)
      }
    }

    pollRef.current = setTimeout(poll, pollInterval)
  }, [tickOccupancy, processData, pollInterval])

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current)
      pollRef.current = null
    }
  }, [])

  /**
   * Toggle occupancy mode
   */
  const toggle = useCallback(() => {
    setEnabled(prev => !prev)
  }, [])

  /**
   * Enable occupancy mode
   */
  const enable = useCallback(() => {
    setEnabled(true)
  }, [])

  /**
   * Disable occupancy mode
   */
  const disable = useCallback(() => {
    setEnabled(false)
  }, [])

  /**
   * Reset simulation
   */
  const reset = useCallback(async () => {
    if (!jobId) return

    try {
      const res = await fetch(`http://localhost:8000/api/occupancy/reset/${jobId}`, {
        method: 'POST'
      })
      if (!res.ok) {
        throw new Error(`Failed to reset occupancy: ${res.status}`)
      }
      const newData = await res.json()
      setData(newData)
      processData(newData)
      showToast?.('Occupancy simulation reset', 'success')
    } catch (err) {
      setError(err.message)
      showToast?.('Failed to reset occupancy', 'error')
    }
  }, [jobId, processData, showToast])

  // Initial fetch when enabled
  useEffect(() => {
    if (!enabled || !jobId) {
      stopPolling()
      return
    }

    setLoading(true)
    setError(null)

    fetchOccupancy()
      .then(rawData => {
        if (rawData) {
          setData(rawData)
          processData(rawData)
        }
        setLoading(false)
        startPolling()
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })

    return () => {
      stopPolling()
    }
  }, [enabled, jobId, fetchOccupancy, processData, startPolling, stopPolling])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [stopPolling])

  // Clear data when disabled
  useEffect(() => {
    if (!enabled) {
      setData(null)
      setOccupancyMap(new Map())
      setError(null)
    }
  }, [enabled])

  return {
    // State
    enabled,
    loading,
    error,
    data,
    occupancyMap,

    // Computed values
    totals: data?.totals || { totalOccupancy: 0, totalCapacity: 0 },
    timestamp: data?.timestamp || null,

    // Actions
    toggle,
    enable,
    disable,
    reset,

    // For external control
    setEnabled
  }
}
