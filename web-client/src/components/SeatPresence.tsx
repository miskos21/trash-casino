import type { RoomSeat, RoomState } from '@raccoon-royale/shared-schemas/types';

export function SeatPresence({ seat }: { seat?: RoomSeat }) {
  if (!seat || seat.presence === 'ONLINE') return null;
  return <small className="seat-presence" data-presence={seat.presence}>
    {seat.presence === 'LEFT' ? 'Left match' : 'Disconnected · seat reserved for 2 min'}
  </small>;
}

export function TablePresence({ room }: { room: RoomState | null }) {
  const absent = room?.participants.filter((p) => p.presence !== 'ONLINE') ?? [];
  return <div className="table-presence" role="status" aria-label="Player connection updates">
    {absent.map((p) => <p key={p.playerId}><strong>{p.displayName}</strong>{' '}
      {p.presence === 'LEFT' ? 'left the match.' : 'disconnected. Their seat is reserved for 2 minutes.'}</p>)}
  </div>;
}
