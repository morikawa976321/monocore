import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.types'
import type { WeatherLocation } from '../../weather/forecast'

/**
 * 予報の地点のうち先頭の1件(sort_order が最小、同点は作った順、それも同じなら id 順)。行が無ければ null
 * (読む側が既定の地点に倒す)。切り替えの画面は無く、今は先頭だけを使う。RLS により本人の行だけが見える。
 * 最後の id は、同じ文で入れた行(created_at が同じ)でも、どれが先頭かを毎回同じにするため。
 */
export async function getDefaultWeatherLocation(
    supabase: SupabaseClient<Database>,
): Promise<{ data: WeatherLocation | null; error: Error | null }> {
    const { data, error } = await supabase
        .from('weather_locations')
        .select('name, latitude, longitude')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle()

    return { data, error }
}
