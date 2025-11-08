// src/services/persistence.js
import { supabase } from '../components/supabaseClient';

/**
 * Persist trading journal to `trading_journals`.
 * Upserts by (user_id, account_id).
 */
export async function persistJournal(
  userId,
  accountId,
  openTrades = [],
  historyTrades = [],
  accountType = null
) {
  if (!userId || !accountId) return null;

  const timestamp = new Date().toISOString();
  const payload = {
    user_id: userId,
    account_id: accountId,
    trades_open: openTrades || [],
    trades_history: historyTrades || [],
    account_type: accountType ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  try {
    const { data, error } = await supabase.from('trading_journals').upsert(payload).select();
    if (error) throw error;
    return data?.[0] ?? null;
  } catch (err) {
    console.error('persistJournal error:', err);
    throw err;
  }
}

/**
 * Load journal row for a user & account.
 * Returns the row or null.
 */
export async function loadJournalFromSupabase(userId, accountId) {
  if (!userId || !accountId) return null;
  try {
    const { data, error } = await supabase
      .from('trading_journals')
      .select('*')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  } catch (err) {
    console.error('loadJournalFromSupabase error:', err);
    throw err;
  }
}

/**
 * Persist account metadata, including deposits/withdrawals.
 */
export async function persistAccountState(accountId, accountData = {}) {
  if (!accountId) return null;
  try {
    const { data, error } = await supabase
      .from('accounts')
      .update(accountData)
      .eq('id', accountId)
      .select();
    if (error) throw error;
    return data?.[0] ?? null;
  } catch (err) {
    console.error('persistAccountState error:', err);
    throw err;
  }
}
