import { useEffect, useRef, type ComponentRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

export type CameraView = 'table' | 'character';

export function CameraController({ view, revision, tableSize = 1 }: { view: CameraView; revision: number; tableSize?: number }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, size } = useThree();

  useEffect(() => {
    if (!controls.current) return;
    const narrow = Math.min(1.7, Math.max(1, 0.9 / (size.width / size.height)));
    if (view === 'character') {
      // Look toward the face from the table side of the near seat.
      const seatZ = 2 * tableSize + 0.6;
      controls.current.target.set(0, 1.25, seatZ);
      camera.position.set(2.5 * narrow, 2.25, seatZ - 2.35 - (narrow - 1));
    } else {
      controls.current.target.set(0, 1.05, 0);
      const distance = tableSize > 1 ? 1.6 : 1;
      camera.position.set(5.4 * narrow * distance, 4.7 * narrow * distance, 6.4 * narrow * distance);
    }
    controls.current.update();
  }, [camera, view, revision, size.width, size.height, tableSize]);

  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={0.09}
    target={[0, 1.05, 0]} minDistance={2.2} maxDistance={tableSize > 1 ? 30 : 17}
    minPolarAngle={0.18} maxPolarAngle={1.43} />;
}
