import { supabase } from '../../../lib/supabase';
import { fieldsMatch } from './settingsLib';

/**
 * After a save the connection dropped on, go and look: read the same fields
 * back and say whether the server holds what was sent. Read only.
 *
 * Returns true (it saved), false (it did not), or throws when the read
 * itself fails, so the screen keeps saying "could not confirm".
 */
export async function rereadSaved({ table, idCol, id, sent }) {
  const cols = Object.keys(sent || {}).join(',');
  if (!cols || !id) return false;
  const { data, error } = await supabase.from(table).select(cols).eq(idCol, id).maybeSingle();
  if (error) throw error;
  return fieldsMatch(sent, data);
}
