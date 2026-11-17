import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUp, RotateCcw } from 'lucide-react';
import { callAsk, setChatConsent } from '../../lib/askClient';
import { screenPath } from '../../lib/askFormat';
import bundled from '../../../shared/ai_chat/strings.json';

// "Ask your own question": the free-text chat at the bottom of the Ask panel.
// The server picks which set questions' figures answer it and checks every
// number; this only sends the text and draws what comes back. Nothing typed is
// kept beyond this panel's session, and earlier answers are never sent back.

const CHAT_MAX_CHARS = 500;
const HISTORY_TURNS = 4;

const chatStrings = (strings, lang) => strings.chat ?? bundled[lang]?.chat ?? bundled.en.chat;

/** The thread and its sending. Lives in the panel, so closing the panel ends the chat. */
export function useAskChat(lang) {
  const [turns, setTurns] = useState([]);   // { id, message, status: loading|done|error, response, error }
  const seq = useRef(0);
  const live = useRef(true);
  // Set in the effect, not only at first render: StrictMode mounts twice.
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const send = useCallback(async (message, earlier) => {
    const id = ++seq.current;
    setTurns((t) => [...t, { id, message, status: 'loading' }]);
    // History: the owner's own words and the reads' ids and dates. Never an answer.
    const history = earlier.filter((t) => t.status === 'done' && t.response?.turn)
      .slice(-HISTORY_TURNS).map((t) => ({ message: t.message, reads: t.response.turn.reads }));
    try {
      const response = await callAsk({ action: 'chat', lang, message, history });
      if (!live.current) return null;
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, status: 'done', response } : x)));
      return response;
    } catch (error) {
      if (!live.current) return null;
      console.error('[ask] chat failed', error);
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, status: 'error', error } : x)));
      return null;
    }
  }, [lang]);

  const reset = useCallback(() => { seq.current += 1; setTurns([]); }, []);
  // A failed turn is asked again in its place: the earlier turns stay as context.
  const retry = useCallback((turn) => {
    const before = turns.filter((x) => x.id !== turn.id);
    setTurns(before);
    send(turn.message, before);
  }, [send, turns]);
  return { turns, send: (m) => send(m, turns), reset, retry };
}

/** Owners who turned Ask on before the chat sentence was added read it once here. */
function ChatConsent({ C, version, onAccepted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const accept = async () => {
    setBusy(true); setError(null);
    try { await setChatConsent(version); onAccepted(); }
    catch (e) { console.error('[ask] chat consent failed', e); setError(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="chat-consent" data-testid="ask-chat-consent" role="note">
      <b>{C.consent_title}</b>
      <p>{C.consent_body}</p>
      <p className="more">{C.consent_more}</p>
      {error && <p className="fail" role="alert">{error}</p>}
      <button type="button" className="pill pri sm" disabled={busy} onClick={accept} data-testid="ask-chat-accept">{C.consent_accept}</button>
    </div>
  );
}

/** The input at the bottom of the panel. Disabled until the chat notice is accepted. */
export function ChatBar({ strings, lang, consentNeeded, consentVersion, onAccepted, onSend, onFocus, busy }) {
  const C = chatStrings(strings, lang);
  const [text, setText] = useState('');
  const ready = !consentNeeded;
  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || !ready || busy) return;
    setText('');
    onSend(t);
  };
  return (
    <div className="chatbar" data-testid="ask-chat-bar">
      {consentNeeded && <ChatConsent C={C} version={consentVersion} onAccepted={onAccepted} />}
      <form className="chat-form" onSubmit={submit}>
        <label className="sr" htmlFor="ask-chat-input">{C.title}</label>
        <input id="ask-chat-input" data-testid="ask-chat-input" type="text" autoComplete="off" enterKeyHint="send"
          maxLength={CHAT_MAX_CHARS} placeholder={ready ? C.placeholder : C.title} disabled={!ready}
          value={text} onChange={(e) => setText(e.target.value)} onFocus={onFocus} />
        <button type="submit" className="send" aria-label={C.send} data-testid="ask-chat-send" disabled={!ready || busy || !text.trim()}>
          <ArrowUp size={16} />
        </button>
      </form>
      {ready && <p className="chat-hint">{C.hint}</p>}
    </div>
  );
}

function ReadCard({ read, strings, ui, onGo }) {
  const { Rows, FigureTable, Numbered } = ui;
  const { card, screen } = read;
  const link = screen?.key && screenPath(screen.key) ? strings.links[screen.key] : null;
  return (
    <section className="chat-read" data-testid="ask-chat-read" data-read={read.id}>
      <h4 className="chat-read-t">{read.title}</h4>
      <div className="hero">
        <span className="v" data-testid="ask-chat-hero">
          {ui.formatValue(card.hero.value, card.hero.kind, strings)}{card.hero.unit && <small>{card.hero.unit}</small>}
        </span>
        {card.hero.caption && <span className="c">{card.hero.caption}</span>}
        {card.hero.detail && <span className="d"><Numbered text={card.hero.detail} /></span>}
      </div>
      <div className="fig">
        <Rows rows={card.rows} strings={strings} />
        <FigureTable table={card.table} strings={strings} />
        <Rows rows={card.rows_after} strings={strings} />
        {card.note && <p className="fn req">{card.note}</p>}
        {card.footnote && <p className="fn"><Numbered text={card.footnote} /></p>}
      </div>
      {link && <button type="button" className="pill sec sm golink" onClick={() => onGo(screen)}>{link}<ArrowRight size={14} /></button>}
    </section>
  );
}

function Reply({ turn, strings, lang, questions, ui, usage, onAsk, onGo, onRetry, onPlans }) {
  const C = chatStrings(strings, lang);
  const U = strings.ui;
  if (turn.status === 'loading') {
    return (
      <div className="chat-a" aria-busy="true" data-testid="ask-chat-loading">
        <div className="think" role="status">
          <span className="orb" aria-hidden="true"><ui.BotFace /></span>
          <span className="think-line">{C.finding}</span>
        </div>
      </div>
    );
  }
  if (turn.status === 'error') {
    const e = turn.error;
    const why = e?.reason && e.reason !== 'read_failed' && U[`reason_${e.reason}`]
      ? U[`reason_${e.reason}`]
      : `${e?.kind === 'slow' ? U.error_slow : e?.kind === 'connection' ? U.error_connection : U.error_read} ${U.error_nothing}`;
    return (
      <div className="chat-a" data-testid="ask-chat-error">
        <p className="note">{why}</p>
        <div className="acts"><button type="button" className="pill sec sm" onClick={onRetry}>{U.retry}</button></div>
      </div>
    );
  }
  const r = turn.response;
  const chips = (r.suggestions ?? []).map((s) => questions.find((q) => q.id === s.id) ?? s);
  return (
    <div className="chat-a" data-testid="ask-chat-answer" data-kind={r.kind}>
      {r.removed && <p className="chat-removed">{C.removed}</p>}
      {r.kind === 'answer' && r.reason !== 'no_data' && <ui.AiSlot answer={r} usage={r.usage ?? usage} strings={strings} onRetry={onRetry} onPlans={onPlans} />}
      {r.kind === 'answer' && r.reason === 'no_data' && <p className="note">{r.text}</p>}
      {r.kind === 'no_match' && <p className="note" data-testid="ask-chat-nomatch">{r.text}</p>}
      {r.kind === 'unavailable' && (
        <p className="note" data-testid="ask-chat-unavailable" data-reason={r.reason}>
          {U[`reason_${r.reason}`] ? ui.fillUsage(U[`reason_${r.reason}`], r.usage ?? usage) : r.reason_message} {C.try_these}
        </p>
      )}
      {(r.reads ?? []).map((read, i) => <ReadCard key={`${read.id}-${i}`} read={read} strings={strings} ui={ui} onGo={onGo} />)}
      {chips.length > 0 && (
        <div className="chips">
          {chips.map((q) => (
            <button key={q.id} type="button" className="chip" data-testid="ask-chat-chip" data-q={q.id} onClick={() => onAsk(q)}>{q.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The thread, in the answer pane. */
export function ChatThread({ chat, strings, lang, questions, usage, ui, onAsk, onGo, onPlans }) {
  const C = chatStrings(strings, lang);
  // The newest turn's question at the top, so its answer reads from the start.
  const latest = useRef(null);
  const last = chat.turns[chat.turns.length - 1];
  useEffect(() => { latest.current?.scrollIntoView?.({ block: 'start' }); }, [chat.turns.length, last?.status]);
  return (
    <div className="chat" data-testid="ask-chat-thread" aria-live="polite">
      <div className="chat-h">
        <h3>{C.title}</h3>
        <button type="button" className="pill sec sm" onClick={chat.reset} data-testid="ask-chat-new">
          <RotateCcw size={13} />{C.new_chat}
        </button>
      </div>
      {chat.turns.map((t) => (
        <div key={t.id} className="chat-turn" data-testid="ask-chat-turn" ref={t === last ? latest : null}>
          <p className="chat-u" data-testid="ask-chat-user"><span className="sr">{C.you}: </span>{t.message}</p>
          <Reply turn={t} strings={strings} lang={lang} questions={questions} ui={ui} usage={usage}
            onAsk={onAsk} onGo={onGo} onPlans={onPlans} onRetry={() => chat.retry(t)} />
        </div>
      ))}
    </div>
  );
}
