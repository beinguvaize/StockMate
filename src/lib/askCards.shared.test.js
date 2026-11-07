import { describe, it, expect } from 'vitest';
import { buildCard } from '../../supabase/functions/ai-ask/cards.ts';
import strings from '../../shared/ai_chat/strings.json';
import cards from '../../shared/fixtures/ai_chat/cards.json';
import responses from '../../shared/fixtures/ai_chat/responses.json';
import format from '../../shared/fixtures/ai_chat/format.json';
import registry from '../../shared/ai_chat/questions.json';
import { formatValue, splitNumbers, usageVars } from './askFormat';

// shared/fixtures/ai_chat is what the phone's suite draws and parses. These
// checks keep it equal to what the server and the web actually do.

describe('card fixtures match cards.ts', () => {
  it('cover every question in both languages', () => {
    for (const q of registry.questions) {
      for (const lang of registry.languages) {
        expect(cards.cases.some((c) => c.question_id === q.id && c.lang === lang && !c.empty)).toBe(true);
      }
    }
  });
  it.each(cards.cases.map((c) => [`${c.question_id} ${c.lang}${c.empty ? ' empty' : ''}`, c]))('%s', (_, c) => {
    expect(buildCard(c.question_id, c.figures, strings[c.lang], c.empty)).toEqual(c.card);
  });
});

describe('format fixtures match askFormat.js', () => {
  it.each(format.formatValue.map((c) => [`${c.kind} ${JSON.stringify(c.value)}`, c]))('%s', (_, c) => {
    expect(formatValue(c.value, c.kind, strings[c.lang])).toBe(c.expect);
  });
  it.each(format.usageVars.map((c) => [c.usage.resets_on, c]))('usage %s', (_, c) => {
    expect(usageVars(c.usage, strings[c.lang])).toMatchObject(c.expect);
  });
  it.each(format.splitNumbers.map((c) => [c.text, c]))('%s', (_, c) => {
    expect(splitNumbers(c.text).filter((p) => p.number).map((p) => p.part)).toEqual(c.numbers);
  });
});

describe('response fixtures', () => {
  it('speak the current contract, and every reason has words in both languages', () => {
    expect(responses.contract_version).toBe(registry.contract_version);
    for (const r of [...responses.ask_reasons.filter((x) => x !== 'no_data'), ...responses.refusals.map((x) => x.body?.reason).filter(Boolean)]) {
      for (const lang of registry.languages) expect(strings[lang].ui[`reason_${r}`]).toBeTruthy();
    }
  });
});
