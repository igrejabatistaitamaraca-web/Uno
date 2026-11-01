import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.includes('supabase.co')
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export async function fetchLeaderboard(roomCode: string) {
  if (!supabase) return [];
  try {
    const { data: room } = await supabase
      .from('rooms')
      .select('id')
      .eq('code', roomCode.toUpperCase())
      .maybeSingle();

    if (!room?.id) return [];

    const { data: players } = await supabase
      .from('players')
      .select('name, nickname, icon, score')
      .eq('room_id', room.id)
      .order('score', { ascending: false });

    return players || [];
  } catch {
    return [];
  }
}
