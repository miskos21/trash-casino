// Development-only asset entrypoint; not part of the application or production build.
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame } from '@react-three/fiber';
import { AnimalAvatar } from '../src/components/three/AnimalAvatar';
import { avatars } from '../src/avatars';

const animal = avatars.find(({ id }) => id === new URLSearchParams(location.search).get('avatar'))?.id ?? 'RACCOON';
let frames = 0;
function Ready() {
  useFrame(() => { if (++frames > 3) document.documentElement.dataset.portraitReady = 'true'; });
  return null;
}
createRoot(document.getElementById('portrait')!).render(
  <Canvas orthographic camera={{ position: [0, 1.27, 4], zoom: 225 }} dpr={2}
    onCreated={({ camera }) => camera.lookAt(0, 1.27, 0)}>
    <ambientLight intensity={0.8} /><hemisphereLight args={['#ffedcb', '#3c5040', 1.6]} />
    <directionalLight position={[-2, 4, 3]} color="#ffe3af" intensity={2.3} />
    <AnimalAvatar animal={animal} animated={false} /><Ready />
  </Canvas>,
);
