import { useEffect, useRef, useState } from 'react';
import type { GameConnection } from '../services/useGameConnection';

const MAX_LENGTH = 280;

/**
 * Public table chat, always shown during a match. Agents read it as untrusted data: it can sway what they say or
 * bid, never what they may do.
 */
export function ChatPanel({ connection: c, matchId }: { connection: GameConnection; matchId: string }) {
  const [draft, setDraft] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const lines = c.chat.filter((line) => line.matchId === matchId);
  const hasAgents = !!c.room?.participants.some((p) => p.npc);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [lines.length]);
  const submit = () => {
    const text = draft.trim();
    if (text && c.sendChat(matchId, text)) setDraft('');
  };
  return <aside className="table-chat" aria-label="Table chat" data-expanded="true">
    <header>
      <h3>Table chat</h3>
      {hasAgents && <span className={'agent-mode ' + (c.room?.agentMode === 'LLM' ? 'live' : 'mock')}
        title={c.room?.agentMode === 'LLM' ? 'Agents answer with a live language model' : 'No LLM key configured: offline rule-based stand-in'}>
        {c.room?.agentMode === 'LLM' ? 'Agents: LLM' : 'Agents: TEMPORARY MOCK'}</span>}
    </header>
    <>
      <ol ref={list} className="chat-lines" aria-live="polite" aria-label="Chat history">
        {lines.map((line) => <li key={line.messageId} className={line.agent ? 'agent-line' : line.senderId === c.room?.youId ? 'own-line' : ''}>
          <strong>{line.senderName}{line.agent ? ' · agent' : ''}</strong><span>{line.text}</span>
        </li>)}
        {!lines.length && <li className="chat-empty">{hasAgents ? 'Talk to the agents. Bribe, bluff, or sweet-talk them. They may lie, but they cannot break the rules.' : 'Chat with the table.'}</li>}
      </ol>
      <form className="chat-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <input aria-label="Chat message" placeholder={hasAgents ? 'Say something to Don…' : 'Message'} maxLength={MAX_LENGTH}
          value={draft} onChange={(event) => setDraft(event.target.value)} disabled={c.socket !== 'online'} />
        <button className="secondary-button" disabled={!draft.trim() || c.socket !== 'online'}>Send</button>
      </form>
      <small className="chat-note">Public to everyone at this table. Max {MAX_LENGTH} characters.</small>
    </>
  </aside>;
}
