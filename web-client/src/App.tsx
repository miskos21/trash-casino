import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { TableScene, type CameraView } from './scenes/TableScene';
import { useAvatarStore } from './stores/avatarStore';
import { MAX_NAME, usePlayerStore } from './stores/playerStore';
import { useGameConnection } from './services/useGameConnection';
import { RoomLobby } from './components/RoomLobby';
import { MatchHud } from './components/MatchHud';
import { BlackjackHud } from './components/BlackjackHud';
import { ChatPanel } from './components/ChatPanel';
import { avatars, type AvatarOption } from './avatars';
import { GameIcon } from './components/GameIcon';
import { MatchClockProvider } from './game/MatchClock';
import { LeaveRoomButton } from './components/LeaveRoomButton';
import { TablePresence } from './components/SeatPresence';
import { ShoeDetails } from './components/ShoeDetails';
import { GameRules } from './components/GameRules';
import { WalletPanel } from './components/WalletPanel';
import { FundingPanel } from './components/FundingPanel';
import { useWallet } from './wallet/useWallet';
import { formatTrash } from './wallet/trash';

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
  const { name: playerName, setName: setPlayerName } = usePlayerStore();
  const status = useGameConnection();
  const wallet = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  // Character and game selection are separate screens of the same dialog.
  type MenuView = 'game' | 'character' | 'wallet';
  const [menuView, setMenuView] = useState<MenuView>('game');
  // The character cannot change inside a room; the wallet can always be opened.
  const openMenu = (view: MenuView) => { setMenuView(status.room && view === 'character' ? 'game' : view); setMenuOpen(true); };
  const [camera, setCamera] = useState<{ view: CameraView; revision: number }>({ view: 'table', revision: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState('');
  const menu = useRef<HTMLDialogElement>(null);
  const previousRoom = useRef<string | undefined>(undefined);
  const myAvatar = status.room?.participants.find((p) => p.playerId === status.room?.youId)?.avatar ?? avatar;
  const selected = avatars.find((option) => option.id === myAvatar)!;
  const connection = status.health === 'online' && status.socket === 'online' ? 'online'
    : status.health === 'checking' || status.socket === 'checking' ? 'checking' : 'offline';
  // During a match: players panel (left) and chat (right) are always shown; room, wallet, and leave sit in Settings.
  const matchId = status.game?.publicState.matchId ?? status.blackjack?.matchId;
  const inMatch = !!status.room && !!matchId;
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Paid rooms show your casino TRASH balance in the control strip.
  const stripTrash = wallet.session && wallet.balances ? formatTrash(wallet.balances.casino) : null;
  const cameraButtons = <>
    <button className="hud-button camera-button" onClick={() => focus('character')} aria-label="Look at my character" title="Look at my character">
      <GameIcon name="person" /><span>My character</span>
    </button>
    <button className="hud-button camera-button" onClick={() => focus('table')} aria-label="Reset table camera" title="Reset table camera">
      <GameIcon name="orbit" /><span>Table</span>
    </button>
    <button className="hud-button fullscreen-button" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title="Fullscreen">
      <GameIcon name="fullscreen" />
    </button>
  </>;

  useEffect(() => {
    if (previousRoom.current && !status.room) setMenuOpen(false);
    previousRoom.current = status.room?.roomId;
  }, [status.room?.roomId]);

  useEffect(() => {
    if (status.game?.publicState.matchId || status.blackjack?.matchId) setCamera((previous) => ({ view: 'table', revision: previous.revision + 1 }));
  }, [status.game?.publicState.matchId, status.blackjack?.matchId]);

  useEffect(() => {
    const dialog = menu.current;
    if (menuOpen && dialog && !dialog.open) dialog.showModal();
    if (!menuOpen && dialog?.open) dialog.close();
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        event.preventDefault();
        setMenuView('game');
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

  return <MatchClockProvider active={status.game?.publicState.phase === 'IN_PROGRESS' || status.blackjack?.phase === 'IN_PROGRESS'}><main className="game-shell" data-connection={connection} data-in-match={inMatch} aria-label="Trashnino game">
    <div className="game-scene" aria-label="3D casino table">
      <SceneBoundary><TableScene avatar={myAvatar} room={status.room} game={status.game} blackjack={status.blackjack} reveal={status.reveal} cameraView={camera.view} cameraRevision={camera.revision} /></SceneBoundary>
    </div>
    <div className="game-vignette" aria-hidden="true" />

    <header className="game-header">
      <div className="game-brand"><span className="brand-monogram">T</span><span>TRASHNINO</span></div>
      <div className="header-actions">
        {/* Home: your name is editable right here, and your animal opens character selection. In a room: the room menu. */}
        {inMatch ? <div className="play-bar" role="toolbar" aria-label="Match controls">
          <span className="play-bar-camera">{cameraButtons}</span>
          <div className="settings">
            <button className="hud-button settings-button" aria-label="Settings" aria-haspopup="menu" aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen(!settingsOpen)}><GameIcon name="menu" /></button>
            {settingsOpen && <>
              <div className="settings-scrim" onClick={() => setSettingsOpen(false)} />
              <div className="settings-menu" role="menu" aria-label="Settings">
                <button role="menuitem" onClick={() => { setSettingsOpen(false); openMenu('game'); }}>Room &amp; players</button>
                <button role="menuitem" onClick={() => { setSettingsOpen(false); openMenu('wallet'); }}>
                  {wallet.session && wallet.balances ? 'Wallet · ' + formatTrash(wallet.balances.casino) + ' TRASH' : 'Wallet & TRASH'}</button>
                {/* Host only, Liar's Dice: chips become the final standings. */}
                {status.room?.game === 'LIARS_DICE' && status.room.hostId === status.room.youId && status.game?.publicState.phase === 'IN_PROGRESS'
                  && <button role="menuitem" disabled={status.socket !== 'online' || status.pending} onClick={() => {
                    setSettingsOpen(false);
                    if (window.confirm('End the match now? Current chips become the final standings.')) status.send({ protocolVersion: 1,
                      type: 'MATCH_END', requestId: null, payload: { roomId: status.room!.roomId, matchId: matchId! } });
                  }}>End match</button>}
                <LeaveRoomButton connection={status} />
              </div>
            </>}
          </div>
        </div> : !status.room ? <div className="identity-stack">
          <label className="home-name"><span>Name</span>
            <input aria-label="Your name" value={playerName} maxLength={MAX_NAME} autoComplete="nickname" spellCheck={false}
              onChange={(event) => setPlayerName(event.target.value)} /></label>
          <button className="character-chip" aria-label={'Choose character. Current: ' + selected.name} aria-haspopup="dialog"
            onClick={() => openMenu('character')}><Portrait animal={selected} /><strong>{selected.name}</strong><GameIcon name="chevron" /></button>
        </div>
          : <button className="hud-button menu-trigger" aria-label="Open menu" aria-haspopup="dialog" aria-expanded={menuOpen}
            onClick={() => openMenu('game')}><GameIcon name="menu" /><span>Room &amp; players</span></button>}
        {status.room && !inMatch && <LeaveRoomButton connection={status} />}
      </div>
    </header>
    <TablePresence room={status.room} />
    {/* Before a match the paid-game status floats on its own; during one it sits inside the match heading. */}
    {!inMatch && <FundingPanel connection={status} wallet={wallet} />}
    {status.room?.game === 'BLACKJACK'
      ? <BlackjackHud connection={status} onMenu={() => openMenu('game')} trash={stripTrash} casino={wallet.balances?.casino ?? null} status={<FundingPanel connection={status} wallet={wallet} inline />} />
      : <MatchHud connection={status} onMenu={() => openMenu('game')} trash={stripTrash} status={<FundingPanel connection={status} wallet={wallet} inline />} />}
    {inMatch && <ChatPanel connection={status} matchId={matchId!} />}
    <div className="camera-hint" aria-hidden="true"><span className="desktop-hint">Drag to look · Scroll to zoom</span><span className="touch-hint">Drag to look · Pinch to zoom</span></div>

    {!status.room && <button className="play-button" aria-haspopup="dialog" onClick={() => openMenu('game')}>Play</button>}

    {/* Wallet and TRASH balance: bottom-left corner, opens the Wallet & TRASH window. */}
    {!inMatch && <div className="wallet-corner">
      {wallet.session ? <button className="balance-chip" onClick={() => openMenu('wallet')} title="Casino balance · wallet balance"
        aria-label={"Casino balance " + (wallet.balances ? formatTrash(wallet.balances.casino) : "unknown") + " TRASH. Open wallet"}>
        <span className="trash-coin" aria-hidden="true" />
        <span className="balance-text">
          <span className="balance-main"><strong>{wallet.balances ? formatTrash(wallet.balances.casino) : "…"}</strong><span>TRASH in casino</span></span>
          <small>Wallet {wallet.balances ? formatTrash(wallet.balances.wallet) : "…"} TRASH</small>
        </span></button>
        : <button className="hud-button wallet-trigger" aria-haspopup="dialog" onClick={() => openMenu('wallet')}>
          <span className="trash-coin" aria-hidden="true" /><span>Wallet</span></button>}
    </div>}

    {!inMatch && <nav className="game-toolbar" aria-label="Camera controls">{cameraButtons}</nav>}

    {!status.room && <p className="testnet-notice">NEAR TESTNET <span>·</span> TRASH has no real-world value.</p>}
    {notice && <button className="game-notice" role="status" onClick={() => setNotice('')}>{notice}</button>}

    <dialog ref={menu} className={'game-menu ' + menuView + '-view'} aria-labelledby="menu-heading" onClose={() => setMenuOpen(false)}
      onClick={(event) => { if (event.target === menu.current) setMenuOpen(false); }}>
      <div className="menu-card">
        <div className="menu-heading"><div><p className="menu-kicker">TRASHNINO</p><h1 id="menu-heading">{menuView === 'character' ? 'Choose your character' : menuView === 'wallet' ? 'Wallet & TRASH'
          : status.room ? 'Your room' : 'Play Trashnino'}</h1></div>
          <button className="hud-button" aria-label="Close menu" onClick={() => setMenuOpen(false)}><GameIcon name="close" /></button>
        </div>
        {menuView === 'wallet' ? <>
          {/* The wallet picker is not in the browser's top layer, so a modal dialog would cover it: close the menu
              while connecting and bring the wallet view back once the wallet is verified (or the attempt failed). */}
          <WalletPanel wallet={wallet} onConnect={async () => { setMenuOpen(false); await wallet.connect(); openMenu('wallet'); }} />
          <button className="resume-button done-button" onClick={() => setMenuOpen(false)}>Done</button>
        </> : menuView === 'character' ? <>
          <div className="avatar-grid" role="group" aria-label="Animal avatar">
            {avatars.map((option) => <button key={option.id} className={'avatar-button ' + (avatar === option.id ? 'selected' : '')}
              disabled={!!status.room} aria-label={option.name} aria-pressed={myAvatar === option.id} onClick={() => { select(option.id); focus('character'); }}>
              <Portrait animal={option} /><span>{option.name}</span><span className="selection-mark" aria-hidden="true">✓</span>
            </button>)}
          </div>
          <button className="resume-button done-button" onClick={() => setMenuOpen(false)}>Done</button>
        </> : <>
          <RoomLobby connection={status} wallet={wallet} avatar={avatar} onStarted={() => setMenuOpen(false)} onOpenWallet={() => setMenuView('wallet')} />
          {status.room && <div className="menu-help"><GameRules game={status.room.game} /></div>}
          {status.blackjack && <ShoeDetails connection={status} />}
          <button className="secondary-button back-to-table" onClick={() => setMenuOpen(false)}>Back to table <GameIcon name="chevron" /></button>
        {/* Help and connection details belong to the Play window only. */}
        <details className="menu-details"><summary>Controls</summary><p>Drag to orbit all the way around the table. Scroll or pinch to zoom. Use My character to see your animal’s face. Esc opens or closes this menu.</p></details>
        <details className="menu-details"><summary>Connection</summary>
          <div className="connection-status" aria-live="polite">
            <div><span>Java API</span><strong data-status={status.health}>{status.health}</strong></div>
            <div><span>WebSocket round trip</span><strong data-status={status.socket}>{status.socket}</strong></div>
            <button className="retry" onClick={status.retry}>Check connection again</button>
          </div>
        </details>
        <p className="menu-fine-print">NEAR Testnet. TRASH has no real-world value. No real-money purchases or cashouts. Server-controlled dice, cards, and outcomes; no provably fair randomness claim.</p>
        </>}
      </div>
    </dialog>
  </main></MatchClockProvider>;
}
