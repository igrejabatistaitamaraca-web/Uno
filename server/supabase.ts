import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseReady = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.includes('supabase.co')
);

export const supabaseServer: SupabaseClient | null = isSupabaseReady
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Creates or retrieves room in public.rooms table
 */
export async function createOrSyncRoom(roomCode: string): Promise<string | null> {
  if (!supabaseServer) return null;
  try {
    const code = roomCode.toUpperCase().trim();

    // Check if room already exists
    const { data: existing, error: selectErr } = await supabaseServer
      .from('rooms')
      .select('id, code, status')
      .eq('code', code)
      .maybeSingle();

    if (existing?.id) {
      // Reset status to waiting for fresh match
      await supabaseServer
        .from('rooms')
        .update({ status: 'waiting' })
        .eq('id', existing.id);
      return existing.id;
    }

    // Insert new room
    const { data: newRoom, error: insertErr } = await supabaseServer
      .from('rooms')
      .insert({
        code,
        status: 'waiting',
        max_players: 5,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.warn('Aviso Supabase ao criar sala:', insertErr.message);
      return null;
    }

    return newRoom?.id || null;
  } catch (err) {
    console.warn('Erro ao conectar com Supabase (rooms):', err);
    return null;
  }
}

/**
 * Inserts or updates player in public.players table
 */
export async function syncPlayerJoin(
  roomId: string,
  playerName: string,
  avatar: string
): Promise<string | null> {
  if (!supabaseServer || !roomId) return null;
  try {
    const name = playerName.trim();
    const { data, error } = await supabaseServer
      .from('players')
      .insert({
        room_id: roomId,
        name,
        nickname: name,
        icon: avatar,
        connected: true,
        score: 0,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('Aviso Supabase ao registrar jogador:', error.message);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.warn('Erro ao conectar com Supabase (players):', err);
    return null;
  }
}

/**
 * Updates room status in public.rooms ('waiting' | 'playing' | 'finished')
 */
export async function updateRoomStatus(
  roomCode: string,
  status: 'waiting' | 'playing' | 'finished'
): Promise<void> {
  if (!supabaseServer) return;
  try {
    const code = roomCode.toUpperCase().trim();
    await supabaseServer
      .from('rooms')
      .update({ status })
      .eq('code', code);
  } catch (err) {
    console.warn('Aviso Supabase ao atualizar status da sala:', err);
  }
}

/**
 * Updates winner score in public.players
 */
export async function updateWinnerScore(
  roomId: string | null,
  winnerName: string
): Promise<void> {
  if (!supabaseServer || !roomId) return;
  try {
    // Increment winner's score
    const { data: player } = await supabaseServer
      .from('players')
      .select('id, score')
      .eq('room_id', roomId)
      .eq('name', winnerName)
      .maybeSingle();

    if (player?.id) {
      await supabaseServer
        .from('players')
        .update({ score: (player.score || 0) + 1 })
        .eq('id', player.id);
    }
  } catch (err) {
    console.warn('Aviso Supabase ao registrar pontuação:', err);
  }
}
