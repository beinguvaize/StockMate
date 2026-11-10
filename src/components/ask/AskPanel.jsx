import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useOffline } from '../../context/OfflineContext';
import { callAsk, setAskEnabled } from '../../lib/askClient';
import { dayMonth, fill, formatValue, screenPath, splitNumbers, usageVars } from '../../lib/askFormat';
import bundled from '../../../shared/ai_chat/strings.json';
import { ASK_HINDI } from '../../lib/askLanguages';
import './ask.css';

const CATEGORIES = ['sales', 'stock', 'dues', 'cash', 'gst'];
const RETRY_REASONS = new Set(['model_error', 'rate_limited', 'provider_busy']);
const PHONE = '(max-width: 640px)';

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

function useIsPhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE).matches);
  useEffect(() => {
    const m = window.matchMedia(PHONE);
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

const Numbered = ({ text }) => splitNumbers(text).map(({ part, number }, i) =>
  (number ? <span key={i} className="m">{part}</span> : <React.Fragment key={i}>{part}</React.Fragment>));

function Rows({ rows, strings }) {
  if (!rows?.length) return null;
  return (
    <div className="kv">
      {rows.map((r, i) => (
        <div key={i} className={`r${r.tone === 'total' ? ' tot' : ''}`}>
          <span className="l">{r.label}</span>
          <span className="x">{formatValue(r.value, r.kind, strings)}</span>
        </div>
      ))}
    </div>
  );
}

function FigureTable({ table, strings }) {
  if (!table?.rows?.length) return null;
  return (
    <table className="t">
      <thead>
        <tr>{table.columns.map((c, i) => <th key={i} className={c.align === 'right' ? 'n' : ''}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {table.rows.map((row, ri) => (
          <tr key={ri} className={table.tones?.[ri] ?? ''}>
            {row.map((v, ci) => {
              const c = table.columns[ci];
              return (
                <td key={ci} className={c.align === 'right' ? `n${c.kind === 'text' ? ' word' : ''}` : ''}>
                  {formatValue(v, c.kind, strings)}
                  {ci === 0 && table.bars && <span className="bar"><i style={{ width: `${table.bars[ri]}%` }} /></span>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function asOfText(iso, strings) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return `${dayMonth(local, strings)}, ${time}`;
}

function AiSlot({ answer, usage, strings, onRetry, onPlans }) {
  const ui = strings.ui;
  if (answer.reason === 'no_data') return null;
  if (answer.text) {
    return (
      <div className="ai" data-testid="ask-ai-text">
        <p className="lb">{ui.ai_label}</p>
        <p className="prose"><Numbered text={answer.text} /></p>
      </div>
    );
  }
  const quota = answer.reason === 'quota_reached';
  return (
    <div className="ai" data-testid="ask-reason" data-reason={answer.reason}>
      <p className="lb">{quota ? ui.quota_title : ui.figures_only}</p>
      <p className="note">{fill(ui[`reason_${answer.reason}`] ?? answer.reason_message, usageVars(usage, strings))}</p>
      {(RETRY_REASONS.has(answer.reason) || quota) && (
        <div className="acts">
          {quota
            ? <button type="button" className="pill sec sm" onClick={onPlans}>{ui.see_plans}</button>
            : <button type="button" className="pill sec sm" onClick={onRetry}>{ui.retry}</button>}
        </div>
      )}
    </div>
  );
}

function Answer({ answer, question, usage, strings, phone, onRetry, onPlans, onGo, also, onAsk, headRef }) {
  const { card, screen } = answer;
  const { hero } = card;
  const link = screen?.key && screenPath(screen.key) ? strings.links[screen.key] : null;
  return (
    <div className="ans" aria-live="polite" data-testid="ask-answer">
      <h3 className="ans-q" tabIndex={-1} ref={headRef}>{question.label}</h3>
      <div className="hero">
        <span className="v" data-testid="ask-hero">
          {formatValue(hero.value, hero.kind, strings)}{hero.unit && <small>{hero.unit}</small>}
        </span>
        {hero.caption && <span className="c">{hero.caption}</span>}
        {hero.detail && <span className="d"><Numbered text={hero.detail} /></span>}
      </div>
      <AiSlot answer={answer} usage={usage} strings={strings} onRetry={onRetry} onPlans={onPlans} />
      <section className="fig">
        <div className="fig-h"><b>{strings.ui.from_books}</b><span className="m">{asOfText(answer.as_of, strings)}</span></div>
        <Rows rows={card.rows} strings={strings} />
        <FigureTable table={card.table} strings={strings} />
        <Rows rows={card.rows_after} strings={strings} />
        {card.note && <p className="fn req">{card.note}</p>}
        {card.footnote && <p className="fn"><Numbered text={card.footnote} /></p>}
      </section>
      {phone
        ? also.length > 0 && (
          <div className="also">
            <div className="hd">{strings.ui.also_ask}</div>
            {also.map((q) => (
              <button key={q.id} type="button" className="qrow" onClick={() => onAsk(q)}>{q.label}<ChevronRight size={14} /></button>
            ))}
          </div>
        )
        : link && <button type="button" className="pill sec golink" onClick={onGo}>{link}<ArrowRight size={16} /></button>}
    </div>
  );
}

// The books are read and the answer written in one call, so the second line is
// timed, not reported: it appears once the read has usually finished.
function Loading({ question, strings, lang }) {
  const [writing, setWriting] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWriting(true), 1200);
    return () => clearTimeout(t);
  }, []);
  const writingLine = strings.ui.writing ?? bundled[lang]?.ui.writing ?? bundled.en.ui.writing;
  return (
    <div className="ans" aria-busy="true" data-testid="ask-loading">
      <h3 className="ans-q">{question.label}</h3>
      <div className="think" role="status">
        <span className="orb" aria-hidden="true"><Sparkles size={14} strokeWidth={2} /></span>
        <span key={writing ? 'w' : 'r'} className="think-line">{writing ? writingLine : strings.ui.reading}</span>
      </div>
      <span className="sk" style={{ height: 36, width: '62%' }} />
      <div className="ai quiet"><div className="sk-rows">{[100, 92, 54].map((w) => <span key={w} className="sk" style={{ width: `${w}%` }} />)}</div></div>
      <div className="sk-rows">{[1, 2, 3, 4, 5].map((i) => <span key={i} className="sk" style={{ width: '100%' }} />)}</div>
    </div>
  );
}

function Message({ title, children }) {
  return <div className="msg"><h3>{title}</h3>{children}</div>;
}

function TurnOn({ strings, onTurnOn, onClose, busy, error }) {
  const ui = strings.ui;
  return (
    <div className="ask-b">
      <Message title={ui.on_title}>
        <p>{ui.on_body}</p>
        <div className="two">
          <div><h4>{ui.sent_title}</h4><ul><li>{ui.sent_1}</li><li>{ui.sent_2}</li></ul></div>
          <div><h4>{ui.never_title}</h4><ul>{[1, 2, 3, 4, 5].map((i) => <li key={i}>{ui[`never_${i}`]}</li>)}</ul></div>
        </div>
        <div className="fine" data-testid="ask-consent">
          {ui.on_fine_review && <p className="review">{ui.on_fine_review}</p>}
          {(ui.on_fine_paragraphs ?? String(ui.on_fine ?? '').split('\n')).map((para, i) => <p key={i}>{para}</p>)}
        </div>
        {error && <p className="fail" role="alert">{error}</p>}
        <div className="acts">
          <button type="button" className="pill pri" disabled={busy} onClick={onTurnOn}>{ui.turn_on}</button>
          <button type="button" className="pill sec" onClick={onClose}>{ui.not_now}</button>
        </div>
      </Message>
    </div>
  );
}

/**
 * Ask: 12 set questions about the shop's own books. A register of questions,
 * not a conversation. Every number comes from the server; offline it shows
 * "Needs internet" and never works an answer out from the local copy, which can
 * be partial and would be a second set of money rules.
 */
export default function AskPanel({ onClose }) {
  const { currentUser } = useAuth();
  const { currentTenantId } = useTenant();
  const offlineCtx = useOffline();
  const online = offlineCtx?.online ?? true;
  const navigate = useNavigate();
  const phone = useIsPhone();

  const uid = currentUser?.id;
  const langKey = `ask.lang.${uid}`;
  const [lang, setLang] = useState(() => (!ASK_HINDI ? 'en' : store.get(langKey)
    || (String(navigator.language).toLowerCase().startsWith('hi') ? 'hi' : 'en')));
  const listKey = `ask.list.${uid}.${currentTenantId}.${lang}`;

  const [list, setList] = useState(() => store.get(listKey));
  const [listState, setListState] = useState('loading'); // loading | ready | staff | error
  const [listError, setListError] = useState(null);
  const [usage, setUsage] = useState(null);
  const [current, setCurrent] = useState(null);          // { question, status, answer, error }
  const [turning, setTurning] = useState(false);
  const [turnError, setTurnError] = useState(null);

  const scrollRef = useRef(null);
  const listTop = useRef(0);
  const headRef = useRef(null);
  const seq = useRef(0);

  const strings = list?.strings ?? bundled[lang];
  const ui = strings.ui;

  const loadList = useCallback(async () => {
    if (!online) { setListState(store.get(listKey) ? 'ready' : 'error'); return; }
    setListState('loading');
    try {
      const data = await callAsk({ action: 'list', lang });
      setList(data);
      setUsage(data.usage);
      store.set(listKey, { ...data, state: undefined, usage: undefined });
      setListState('ready');
    } catch (e) {
      if (e.reason === 'not_owner') { setListState('staff'); return; }
      console.error('[ask] list failed', e);
      setListError(e);
      setListState(store.get(listKey) ? 'ready' : 'error');
    }
  }, [lang, listKey, online]);

  // A language switch keeps the question selected, so one tap asks it again in
  // the new language. Asking costs an explanation, so it is never automatic.
  useEffect(() => {
    setList(store.get(listKey));
    setCurrent((c) => (c ? { question: c.question, status: 'stale' } : null));
    loadList();
  }, [listKey, loadList]);
  useEffect(() => {
    const fresh = list?.questions?.find((q) => q.id === current?.question?.id);
    if (fresh && fresh.label !== current.question.label) setCurrent((c) => ({ ...c, question: fresh }));
  }, [list, current]);

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !phone) onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose, phone]);

  // Back on a phone returns to the list where the owner left it.
  useLayoutEffect(() => {
    if (phone && !current && scrollRef.current) scrollRef.current.scrollTop = listTop.current;
  }, [phone, current]);

  const ask = useCallback(async (question) => {
    if (phone && !current && scrollRef.current) listTop.current = scrollRef.current.scrollTop;
    const mine = ++seq.current;
    setCurrent({ question, status: 'loading' });
    try {
      const answer = await callAsk({ action: 'ask', question_id: question.id, lang });
      if (mine !== seq.current) return;
      if (answer.usage) setUsage((u) => ({ ...u, ...answer.usage }));
      setCurrent({ question, status: 'done', answer });
    } catch (e) {
      if (mine !== seq.current) return;
      console.error('[ask] answer failed', question.id, e);
      setCurrent({ question, status: 'error', error: e });
    }
  }, [current, lang, phone]);

  useEffect(() => {
    if (current?.status === 'done') headRef.current?.focus({ preventScroll: true });
  }, [current?.status]);

  const changeLang = (next) => { store.set(langKey, next); setLang(next); };
  const go = () => {
    const s = current?.answer?.screen;
    const p = screenPath(s?.key, s?.params);
    if (p) { onClose(); navigate(p); }
  };

  const turnOn = async () => {
    setTurning(true); setTurnError(null);
    try { await setAskEnabled(true); window.dispatchEvent(new Event('ask:changed')); await loadList(); }
    catch (e) { console.error('[ask] turn on failed', e); setTurnError(e.message); }
    finally { setTurning(false); }
  };

  const questions = list?.questions ?? [];
  const state = list?.state;
  const showOff = online && listState === 'ready' && state === 'off';
  const staff = listState === 'staff';
  const offlineNoList = !online && !questions.length;
  const failedNoList = online && listState === 'error';
  const fullMessage = showOff || staff || offlineNoList;

  const quotaFull = usage && usage.used >= usage.limit;
  const usageLine = usage ? fill(quotaFull ? ui.usage_full : ui.usage_line, usageVars(usage, strings)) : null;

  const qRows = () => CATEGORIES.map((cat) => {
    const rows = questions.filter((q) => q.category === cat);
    if (!rows.length) return null;
    return (
      <React.Fragment key={cat}>
        <div className="qcat">{ui[`category_${cat}`]}</div>
        {rows.map((q) => (
          <button key={q.id} type="button" className="qrow" disabled={!online} data-q={q.id}
            aria-current={current?.question?.id === q.id ? 'true' : 'false'} onClick={() => ask(q)}>
            {q.label}{phone && <ChevronRight size={14} />}
          </button>
        ))}
      </React.Fragment>
    );
  });

  const errorWhy = (e) => (e?.kind === 'slow' ? ui.error_slow : e?.kind === 'connection' ? ui.error_connection : ui.error_read);

  const right = () => {
    if (!online) return <Message title={ui.offline_title}><p>{ui.offline_body}</p></Message>;
    if (!current) {
      return (
        <div className="intro">
          <h3>{ui.intro_title}</h3>
          <ul><li>{ui.intro_1}</li><li>{ui.intro_2}</li><li>{ui.intro_3}</li></ul>
        </div>
      );
    }
    if (current.status === 'loading') return <Loading question={current.question} strings={strings} lang={lang} />;
    if (current.status === 'stale') {
      return (
        <div className="ans" data-testid="ask-stale">
          <h3 className="ans-q">{current.question.label}</h3>
          <p className="loadline">{ui.stale_note}</p>
          <div className="acts"><button type="button" className="pill sec" onClick={() => ask(current.question)}>{ui.ask_again}</button></div>
        </div>
      );
    }
    if (current.status === 'error') {
      const e = current.error;
      if (e.reason && e.reason !== 'read_failed' && ui[`reason_${e.reason}`]) {
        return <Message title={ui.error_title}><p>{ui[`reason_${e.reason}`]}</p></Message>;
      }
      return (
        <Message title={ui.error_title}>
          <p data-testid="ask-error">{errorWhy(e)} {ui.error_nothing}</p>
          <div className="acts"><button type="button" className="pill sec" onClick={() => ask(current.question)}>{ui.retry}</button></div>
        </Message>
      );
    }
    const same = questions.filter((q) => q.category === current.question.category && q.id !== current.question.id);
    return (
      <Answer answer={current.answer} question={current.question} usage={usage} strings={strings} phone={phone} headRef={headRef}
        onRetry={() => ask(current.question)} onPlans={() => { onClose(); navigate('/settings'); }} onGo={go}
        also={(same.length ? same : questions.filter((q) => q.id !== current.question.id)).slice(0, 2)} onAsk={ask} />
    );
  };

  const body = () => {
    if (staff) {
      return <div className="ask-b"><Message title={ui.staff_title}><p>{ui.staff_body}</p><div className="acts"><button type="button" className="pill sec" onClick={onClose}>{ui.staff_back}</button></div></Message></div>;
    }
    if (showOff) return <TurnOn strings={strings} onTurnOn={turnOn} onClose={onClose} busy={turning} error={turnError} />;
    if (offlineNoList) return <div className="ask-b"><Message title={ui.offline_title}><p>{ui.offline_body}</p></Message></div>;
    if (failedNoList) {
      return (
        <div className="ask-b">
          <Message title={ui.error_title}>
            <p>{listError?.reason && ui[`reason_${listError.reason}`] ? ui[`reason_${listError.reason}`] : `${errorWhy(listError)} ${ui.error_nothing}`}</p>
            <div className="acts"><button type="button" className="pill sec" onClick={loadList}>{ui.retry}</button></div>
          </Message>
        </div>
      );
    }
    if (listState === 'loading' && !questions.length) return <div className="ask-b"><div className="pane-r"><p className="intro loadline">{ui.reading}</p></div></div>;

    const listPane = (
      <div className="pane-l" data-testid="ask-list">
        <div className="qlist-pad">{qRows()}</div>
        {online && usageLine && <div className="usage" data-testid="ask-usage">{usageLine}</div>}
      </div>
    );
    if (phone) {
      if (!online) {
        return (<>
          <div className="banner"><b>{ui.offline_title}.</b> {ui.offline_body}</div>
          <div className="ask-b" ref={scrollRef}>{listPane}</div>
        </>);
      }
      if (!current) return <div className="ask-b" ref={scrollRef}>{listPane}</div>;
      const link = current.answer?.screen?.key && screenPath(current.answer.screen.key) ? strings.links[current.answer.screen.key] : null;
      return (<>
        <div className="ask-b"><div className="pane-r">{right()}</div></div>
        {link && <div className="dock"><button type="button" className="pill sec" onClick={go}>{link}<ArrowRight size={16} /></button></div>}
      </>);
    }
    return <div className="ask-b">{listPane}<div className="pane-r">{right()}</div></div>;
  };

  const onAnswer = phone && current && online;
  return (
    <section className={`ask-root ask ${phone ? 'phone' : 'web panel'}${fullMessage ? ' narrow' : ''}`} role="dialog" aria-label={ui.title}
      lang={lang} data-testid="ask-panel">
      <header className="ask-h">
        {phone && (
          <button type="button" className="iconbtn" aria-label="Back" onClick={() => (onAnswer ? setCurrent(null) : onClose())}><ChevronLeft size={18} /></button>
        )}
        <h2>{ui.title}</h2>
        <span className="tag">{ui.tagline}</span>
        <span className="sp" />
        {!staff && ASK_HINDI && (
          <div className="seg" role="group" aria-label="Language">
            <button type="button" lang="en" aria-pressed={lang === 'en'} onClick={() => changeLang('en')}>English</button>
            <button type="button" lang="hi" aria-pressed={lang === 'hi'} onClick={() => changeLang('hi')}>हिन्दी</button>
          </div>
        )}
        {!phone && <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}><X size={16} /></button>}
      </header>
      {body()}
    </section>
  );
}

