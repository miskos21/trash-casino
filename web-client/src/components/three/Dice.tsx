const pips: Record<number, [number, number][]> = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
/** Presentation only: values arrive from the recipient's server snapshot or a public reveal. */
export function Dice({ value, position }: { value: number; position: [number, number, number] }) {
  return <group position={position}>
    <mesh castShadow><boxGeometry args={[0.18, 0.18, 0.18]} /><meshStandardMaterial color="#f0e5c9" roughness={0.5} /></mesh>
    {(pips[value] ?? []).map(([x, z], i) => <mesh key={i} position={[x * 0.052, 0.092, z * 0.052]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.018, 8]} /><meshStandardMaterial color="#20291f" /></mesh>)}
  </group>;
}
