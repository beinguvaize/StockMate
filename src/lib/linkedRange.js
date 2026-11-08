import { useSearchParams } from 'react-router-dom';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The period a link asked for, as ?from=YYYY-MM-DD&to=YYYY-MM-DD, or null.
 * Ask's answers link here with the question's own dates, so the report opens
 * on the same period and shows the same number.
 */
export function useLinkedRange() {
  const [params] = useSearchParams();
  const from = params.get('from');
  const to = params.get('to');
  return from && to && ISO.test(from) && ISO.test(to) && from <= to ? { from, to } : null;
}
