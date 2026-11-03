export function CasinoTable() {
  return <group>
    <mesh position={[0, 1.1, 0]} scale={[1.45, 1, 1]} castShadow receiveShadow>
      <cylinderGeometry args={[2, 1.9, 0.25, 48]} /><meshStandardMaterial color="#785039" roughness={0.8} />
    </mesh>
    <mesh position={[0, 1.235, 0]} scale={[1.45, 1, 1]} receiveShadow>
      <cylinderGeometry args={[1.83, 1.83, 0.025, 48]} /><meshStandardMaterial color="#3f6152" roughness={1} />
    </mesh>
    <mesh position={[0, 1.255, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.45, 1, 1]}>
      <torusGeometry args={[1.63, 0.012, 6, 64]} /><meshStandardMaterial color="#b9ae77" />
    </mesh>
    {[-1.8, 1.8].flatMap((x) => [-0.9, 0.9].map((z) => <mesh key={`${x}-${z}`} position={[x, 0.5, z]} castShadow>
      <cylinderGeometry args={[0.12, 0.19, 1, 6]} /><meshStandardMaterial color="#543d2e" />
    </mesh>))}
  </group>;
}
