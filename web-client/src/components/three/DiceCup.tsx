export function DiceCup({ position }: { position: [number, number, number] }) {
  return <group position={position}>
    <mesh castShadow><cylinderGeometry args={[0.14, 0.23, 0.36, 10]} /><meshStandardMaterial color="#9c6846" roughness={0.9} /></mesh>
    <mesh position={[0, -0.17, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.23, 0.025, 6, 10]} /><meshStandardMaterial color="#d4af6a" />
    </mesh>
  </group>;
}
