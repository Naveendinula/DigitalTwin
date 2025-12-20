import * as THREE from 'three'

/**
 * Calculate color based on EC value relative to min/max
 * @param {number} value - The EC value
 * @param {number} min - The minimum EC value in the set
 * @param {number} max - The maximum EC value in the set
 * @returns {string} - Hex color string (e.g., "#ff0000")
 */
export const getEcColor = (value, min, max) => {
  if (value === undefined || value === null) return '#d1d1d6'
  
  const range = max - min
  const t = range === 0 ? 0 : Math.max(0, Math.min(1, (value - min) / range))
  
  const c1 = new THREE.Color('#5be7a9') // Low
  const c2 = new THREE.Color('#f7d35f') // Mid
  const c3 = new THREE.Color('#ef5a5a') // High
  
  if (t < 0.5) {
    return '#' + c1.lerp(c2, t * 2).getHexString()
  } else {
    return '#' + c2.lerp(c3, (t - 0.5) * 2).getHexString()
  }
}
