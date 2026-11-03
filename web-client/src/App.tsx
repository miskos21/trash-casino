import { Component, type ReactNode } from 'react';
import type { Avatar } from '@raccoon-royale/shared-schemas/types';
import { TableScene } from './scenes/TableScene';
import { useAvatarStore } from './stores/avatarStore';
import { useBackendStatus } from './services/useBackendStatus';

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p className="scene-fallback">The 3D preview could not start. Check that WebGL is available and reload.</p> : this.props.children;
  }
}

const avatars: { id: Avatar; name: string; note: string }[] = [
  { id: 'RACCOON', name: 'Raccoon', note: 'A familiar face in unfamiliar bins.' },
  { id: 'FOX', name: 'Fox', note: 'A little charm. A little trouble.' },
  { id: 'BEAR', name: 'Bear', note: 'Big paws. Unreadable expression.' },
  { id: 'OWL', name: 'Owl', note: 'Sees everything. Says very little.' },
];

export function App() {
  const { avatar, select } = useAvatarStore();
  const status = useBackendStatus();
  return <main className="shell">
    <header className="masthead flex items-center justify-between gap-4">
      <a className="wordmark" href="/">RR<span>RACCOON ROYALE</span></a>
      <span className="testnet-label">NEAR TESTNET · EARLY BUILD</span>
    </header>
    <section className="intro">
      <p className="eyebrow">WELCOME TO THE BACK ROOM</p>
      <h1>A good bluff.<br /><em>A better poker face.</em></h1>
      <p>Liar’s Dice, questionable company, and a raccoon with an angle.</p>
    </section>
    <div className="table-layout">
      <section className="table-preview" aria-label="Interactive 3D casino table preview">
        <div className="scene"><SceneBoundary><TableScene avatar={avatar} /></SceneBoundary></div>
        <div className="scene-caption"><span className="live-dot" /> TABLE PREVIEW <span>Drag to look around</span></div>
        <div className="opponent-label">DON RACCOONE <span>Your future opponent</span></div>
      </section>
      <section className="seat-panel" aria-labelledby="seat-heading">
        <p className="eyebrow">01 / TAKE A SEAT</p>
        <h2 id="seat-heading">Pick your face.</h2>
        <p className="muted">Choose a placeholder animal for the table preview.</p>
        <div className="avatar-grid" role="group" aria-label="Animal avatar">
          {avatars.map((option) => <button key={option.id} className={`avatar-button ${avatar === option.id ? 'selected' : ''}`}
            aria-pressed={avatar === option.id} onClick={() => select(option.id)}>
            <span aria-hidden="true">{option.id === 'RACCOON' ? '◈' : option.id === 'FOX' ? '△' : option.id === 'BEAR' ? '●' : '◎'}</span>{option.name}
          </button>)}
        </div>
        <p className="animal-note" aria-live="polite">{avatars.find((option) => option.id === avatar)?.note}</p>
        <button className="play-button" disabled>Rooms coming next <span aria-hidden="true">↗</span></button>
        <p className="small muted">Milestone 1 · Scene and server foundation. Gameplay, chat, and wallets are not connected yet.</p>
        <div className="connection-status" aria-live="polite">
          <div><span>Java API</span><strong data-status={status.health}>{status.health}</strong></div>
          <div><span>WebSocket round trip</span><strong data-status={status.socket}>{status.socket}</strong></div>
          <button className="retry" onClick={status.retry}>Check connection again</button>
        </div>
      </section>
    </div>
    <footer><p><strong>TRASH has no real-world value.</strong> Testnet only. No real-money purchases or cashouts.</p>
      <p>Trusted server for dice and outcomes. No provably fair randomness claim.</p></footer>
  </main>;
}
