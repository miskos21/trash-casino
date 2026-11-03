import type { GameConnection } from '../services/useGameConnection';

export function LeaveRoomButton({ connection: c }: { connection: GameConnection }) {
  return <button className="leave-button" disabled={c.socket !== 'online' || c.leaving} onClick={c.leave}>
    {c.leaving ? 'Leaving…' : c.room?.phase === 'IN_PROGRESS' ? 'Leave match' : 'Leave room'}
  </button>;
}
