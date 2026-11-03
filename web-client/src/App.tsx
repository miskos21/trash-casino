import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { TableScene, type CameraView } from './scenes/TableScene';
import { useAvatarStore } from './stores/avatarStore';
import { useBackendStatus } from './services/useBackendStatus';
import { avatars, type AvatarOption } from './avatars';
import { GameIcon } from './components/GameIcon';

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p className="scene-fallback">The table could not start. Enable WebGL and reload.</p> : this.props.children;
  }
}

function Portrait({ animal, className = '' }: { animal: AvatarOption; className?: string }) {
  return <img className={'portrait ' + className} src={animal.portrait} alt={animal.name + ' face'} draggable={false} />;
}

export function App() {
  const { avatar, select } = useAvatarStore();
  const status = useBackendStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const [camera, setCamera] = useState<{ view: CameraView; revision: number }>({ view: 'table', revision: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState('');
  const menu = useRef<HTMLDialogElement>(null);
  const selected = avatars.find((option) => option.id === avatar)!;
  const connection = status.health === 'online' && status.socket === 'online' ? 'online'
    : status.health === 'checking' || status.socket === 'checking' ? 'checking' : 'offline';

  useEffect(() => {
    const dialog = menu.current;
    if (menuOpen && dialog && !dialog.open) dialog.showModal();
    if (!menuOpen && dialog?.open) dialog.close();
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !menu.current?.open) {
        event.preventDefault();
        setMenuOpen(true);
      }
    };
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, []);

  function focus(view: CameraView) {
    setCamera((previous) => ({ view, revision: previous.revision + 1 }));
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setNotice('Use your browser’s fullscreen control.');
    } catch { setNotice('Fullscreen is unavailable. Use your browser’s fullscreen control.'); }
  }

  return <main className="game-shell" aria-label="Raccoon Royale game">
    <div className="game-scene" aria-label="3D casino table">
      <SceneBoundary><TableScene avatar={avatar} cameraView={camera.view} cameraRevision={camera.revision} /></SceneBoundary>
    </div>
    <div className="game-vignette" aria-hidden="true" />

    <header className="game-header">
      <div className="game-brand"><span className="brand-monogram">RR</span><span>RACCOON<br />ROYALE</span></div>
      <div className="header-actions">
        <span className="preview-tag">TABLE PREVIEW</span>
        <button className="connection-indicator" data-connection={connection}
          aria-label={'Connection ' + connection + '. Open menu'} onClick={() => setMenuOpen(true)} title={'Connection ' + connection}>
          <span className="status-dot" /><span className="sr-only">{connection}</span>
        </button>
        <button className="hud-button menu-trigger" aria-label="Open menu" aria-haspopup="dialog" aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}><GameIcon name="menu" /><span>Menu</span></button>
      </div>
    </header>

    <div className="camera-hint" aria-hidden="true"><span className="desktop-hint">Drag to look · Scroll to zoom</span><span className="touch-hint">Drag to look · Pinch to zoom</span></div>

    <nav className="game-toolbar" aria-label="Character and camera controls">
      <button className="character-trigger" onClick={() => setMenuOpen(true)} aria-label={'Choose character. Current: ' + selected.name}>
        <Portrait animal={selected} /><span><small>YOUR CHARACTER</small><strong>{selected.name}</strong></span><GameIcon name="chevron" />
      </button>
      <span className="toolbar-divider" />
      <button className="hud-button camera-button" onClick={() => focus('character')} aria-label="Look at my character" title="Look at my character">
        <GameIcon name="person" /><span>My character</span>
      </button>
      <button className="hud-button camera-button" onClick={() => focus('table')} aria-label="Reset table camera" title="Reset table camera">
        <GameIcon name="orbit" /><span>Table</span>
      </button>
      <button className="hud-button fullscreen-button" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title="Fullscreen">
        <GameIcon name="fullscreen" />
      </button>
    </nav>

    <p className="testnet-notice">NEAR TESTNET <span>·</span> TRASH has no real-world value.</p>
    {notice && <button className="game-notice" role="status" onClick={() => setNotice('')}>{notice}</button>}

    <dialog ref={menu} className="game-menu" aria-labelledby="menu-heading" onClose={() => setMenuOpen(false)}
      onClick={(event) => { if (event.target === menu.current) setMenuOpen(false); }}>
      <div className="menu-card">
        <div className="menu-heading"><div><p className="menu-kicker">RACCOON ROYALE</p><h1 id="menu-heading">Menu</h1></div>
          <button className="hud-button" aria-label="Close menu" onClick={() => setMenuOpen(false)}><GameIcon name="close" /></button>
        </div>
        <h2>Choose your character</h2>
        <div className="avatar-grid" role="group" aria-label="Animal avatar">
          {avatars.map((option) => <button key={option.id} className={'avatar-button ' + (avatar === option.id ? 'selected' : '')}
            aria-label={option.name} aria-pressed={avatar === option.id} onClick={() => { select(option.id); focus('character'); }}>
            <Portrait animal={option} /><span>{option.name}</span><span className="selection-mark" aria-hidden="true">✓</span>
          </button>)}
        </div>
        <button className="resume-button" onClick={() => setMenuOpen(false)}>Back to table <GameIcon name="chevron" /></button>
        <button className="coming-soon" disabled>Play Liar’s Dice <span>Coming soon</span></button>
        <details className="menu-details"><summary>Controls</summary><p>Drag to orbit all the way around the table. Scroll or pinch to zoom. Use My character to see your animal’s face. Esc opens or closes this menu.</p></details>
        <details className="menu-details"><summary>Connection</summary>
          <div className="connection-status" aria-live="polite">
            <div><span>Java API</span><strong data-status={status.health}>{status.health}</strong></div>
            <div><span>WebSocket round trip</span><strong data-status={status.socket}>{status.socket}</strong></div>
            <button className="retry" onClick={status.retry}>Check connection again</button>
          </div>
        </details>
        <p className="menu-fine-print">Testnet only. No real-money purchases or cashouts. Server-controlled dice and outcomes; no provably fair randomness claim.</p>
      </div>
    </dialog>
  </main>;
}
