const pipPositions: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
export function DieFace({ value, small = false, highlighted = false }: { value: number; small?: boolean; highlighted?: boolean }) {
  return <span className={(small ? 'die-symbol' : 'die-face') + (highlighted ? ' matching-die' : '')} role="img" aria-label={'Die ' + value}>
    <span className="sr-only">{value}</span>
    {Array.from({ length: 9 }, (_, i) => <i key={i} aria-hidden="true" className={pipPositions[value]?.includes(i) ? 'pip filled' : 'pip'} />)}
  </span>;
}
