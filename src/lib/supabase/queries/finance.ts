import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../types/database.types';

type Client = SupabaseClient<Database>;
export type FinanceEventRow = Database['public']['Tables']['finance_events']['Row'];
export type FinanceEventInput = Pick<FinanceEventRow, 'name' | 'start_month' | 'end_month' | 'cash_delta' | 'nisa_delta' | 'memo'>;
export type FinanceMeasurementRow = Database['public']['Tables']['finance_measurements']['Row'];
export type FinanceMeasurementInput = Pick<FinanceMeasurementRow, 'month' | 'cash' | 'nisa'>;

export async function getFinanceEvents(client: Client) {
    return client.from('finance_events').select('*').order('start_month').order('created_at');
}

export async function insertFinanceEvent(client: Client, input: FinanceEventInput) {
    return client.from('finance_events').insert(input).select('*').single();
}

/**
 * 読み込み時の updated_at を条件に含める楽観ロック。別タブや CLI が先に書いていれば 0 行更新になり
 * data が null で返る(呼び出し側は下書きを残して知らせる)。全項目を書き戻す更新なので、条件が無いと
 * 他所の変更を黙って消す。
 */
export async function updateFinanceEvent(client: Client, id: string, loadedUpdatedAt: string, input: FinanceEventInput) {
    return client.from('finance_events').update(input).eq('id', id).eq('updated_at', loadedUpdatedAt).select('*').maybeSingle();
}

export async function deleteFinanceEvent(client: Client, id: string) {
    return client.from('finance_events').delete().eq('id', id).select('id').single();
}

export async function getFinanceMeasurements(client: Client) {
    return client.from('finance_measurements').select('*').order('month');
}

/** 実測を1か月ぶん消す(早まって記録した月を予測に戻す)。month は YYYY-MM-01。 */
export async function deleteFinanceMeasurement(client: Client, month: string) {
    return client.from('finance_measurements').delete().eq('month', month).select('month').maybeSingle();
}

/**
 * 次の月の実測を記録する。user_id は DEFAULT auth.uid()。別タブや CLI が同じ月を先に記録していれば
 * 主キー(user_id, month)の重複で失敗する(上書きしない)。
 */
export async function insertFinanceMeasurement(client: Client, input: FinanceMeasurementInput) {
    return client.from('finance_measurements').insert(input).select('*').single();
}

/**
 * 記録済みの月の訂正。updateFinanceEvent と同じく、読み込み時の updated_at を条件に含める楽観ロック。
 * Cash と NISA を両方書き戻すので、条件が無いと他所で直した片方を古い値に戻してしまう。
 */
export async function updateFinanceMeasurement(client: Client, input: FinanceMeasurementInput, loadedUpdatedAt: string) {
    return client
        .from('finance_measurements')
        .update({ cash: input.cash, nisa: input.nisa })
        .eq('month', input.month)
        .eq('updated_at', loadedUpdatedAt)
        .select('*')
        .maybeSingle();
}
