import { useCallback } from 'react'
import * as THREE from 'three'

export default function useSectionPick(createSectionPlane) {
  return useCallback((intersection, mesh) => {
    if (!intersection || !intersection.point) return
    
    const hitPointWorld = intersection.point.clone()
    let faceNormalWorld = new THREE.Vector3(0, 1, 0)
    
    if (intersection.face) {
      faceNormalWorld.copy(intersection.face.normal)
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
      faceNormalWorld.applyMatrix3(normalMatrix).normalize()
    }
    
    createSectionPlane({
      point: hitPointWorld,
      normal: faceNormalWorld,
      mesh: mesh
    })
    
    console.log('Section plane created from pick:', {
      point: `(${hitPointWorld.x.toFixed(2)}, ${hitPointWorld.y.toFixed(2)}, ${hitPointWorld.z.toFixed(2)})`,
      normal: `(${faceNormalWorld.x.toFixed(2)}, ${faceNormalWorld.y.toFixed(2)}, ${faceNormalWorld.z.toFixed(2)})`
    })
  }, [createSectionPlane])
}
