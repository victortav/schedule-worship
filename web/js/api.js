// =====================================================================
// Camada de dados (PostgREST via supabase-js) — multi-igreja
// Estratégia: buscas paralelas simples + join no JS (evita hints de FK)
// =====================================================================
import { supabase } from './client.js';
import { toast } from './ui.js';

const nowIso = () => new Date().toISOString();

function fail(err, ctx) {
  console.error(ctx, err);
  const msg = /row-level security/i.test(err.message)
    ? 'Sem permissão para essa ação.'
    : err.message;
  toast(msg, 'erro');
  throw err;
}

// ------------------------------------------------------------------
// Igrejas / vínculos (multi-tenant)
// ------------------------------------------------------------------
// Igrejas em que o usuário é membro (+ papel dele na igreja)
export async function fetchMyChurches(userId) {
  const { data: cm, error } = await supabase
    .from('church_members')
    .select('church_id, role')
    .eq('profile_id', userId);
  if (error) return fail(error, 'church_members');
  if (!cm.length) return [];
  const ids = cm.map((r) => r.church_id);
  const { data: churches, error: e2 } = await supabase
    .from('churches').select('id, name').in('id', ids).order('name');
  if (e2) return fail(e2, 'churches');
  const byId = Object.fromEntries(cm.map((r) => [r.church_id, r.role]));
  return churches.map((c) => ({ ...c, role: byId[c.id] || 'membro' }));
}

// Todas as igrejas (visível só p/ system_admin pela RLS)
export async function fetchAllChurches() {
  const { data, error } = await supabase.from('churches').select('id, name').order('name');
  if (error) return fail(error, 'churches');
  return data;
}

export async function adminCreateChurch(name) {
  const { data, error } = await supabase
    .from('churches').insert({ name }).select().single();
  if (error) return fail(error, 'church insert');
  return data;
}

export async function adminAddChurchMember(churchId, profileId, role = 'membro') {
  const { error } = await supabase
    .from('church_members')
    .insert({ church_id: churchId, profile_id: profileId, role });
  if (error) return fail(error, 'church member insert');
}

export async function adminSetChurchMemberRole(churchId, profileId, role) {
  const { error } = await supabase
    .from('church_members').update({ role })
    .eq('church_id', churchId).eq('profile_id', profileId);
  if (error) return fail(error, 'church member role');
}

export async function adminRemoveChurchMember(churchId, profileId) {
  const { error } = await supabase
    .from('church_members').delete()
    .eq('church_id', churchId).eq('profile_id', profileId);
  if (error) return fail(error, 'church member delete');
}

// ------------------------------------------------------------------
// Catálogo global: instrumentos, perfis, licenças
// ------------------------------------------------------------------
export async function fetchInstruments() {
  const { data, error } = await supabase.from('instruments').select().order('id');
  if (error) return fail(error, 'instruments');
  return data;
}

export async function fetchProfiles() {
  const { data, error } = await supabase.from('profiles').select().order('full_name');
  if (error) return fail(error, 'profiles');
  return data;
}

// { [profileId]: [ instrumentId, ... ] }
export async function fetchMemberInstruments() {
  const { data, error } = await supabase.from('member_instruments').select();
  if (error) return fail(error, 'member_instruments');
  const map = {};
  for (const r of data) (map[r.profile_id] ??= []).push(r.instrument_id);
  return map;
}

// { [profileId]: [ {id, start_date, end_date, reason}, ... ] }
export async function fetchAbsences() {
  const { data, error } = await supabase
    .from('absences').select().order('start_date', { ascending: false });
  if (error) return fail(error, 'absences');
  const map = {};
  for (const r of data) (map[r.profile_id] ??= []).push(r);
  return map;
}

export function isOnLeave(absences, dateIso) {
  const d = new Date(dateIso);
  return (absences || []).some(
    (a) => new Date(a.start_date) <= d && d <= new Date(a.end_date)
  );
}

// Membros ATIVOS de uma igreja: [{...profile, church_role, instruments, absences}]
export async function fetchMembers(churchId) {
  const { data: cm, error } = await supabase
    .from('church_members').select('profile_id, role').eq('church_id', churchId);
  if (error) return fail(error, 'church_members');
  if (!cm.length) return [];
  const ids = cm.map((r) => r.profile_id);
  const roleBy = Object.fromEntries(cm.map((r) => [r.profile_id, r.role]));

  const [{ data: profs, error: e1 }, mi, instruments, absences] = await Promise.all([
    supabase.from('profiles').select().in('id', ids).order('full_name'),
    fetchMemberInstruments(),
    fetchInstruments(),
    fetchAbsences(),
  ]);
  if (e1) return fail(e1, 'profiles');
  const instById = Object.fromEntries(instruments.map((i) => [i.id, i]));
  return profs
    .filter((p) => p.active)
    .map((p) => ({
      ...p,
      church_role: roleBy[p.id] || 'membro',
      instruments: (mi[p.id] || []).map((id) => instById[id]).filter(Boolean),
      absences: absences[p.id] || [],
    }));
}

// A própria pessoa define os instrumentos que toca
export async function saveMyInstruments(user, instrumentIds) {
  const { error: e1 } = await supabase
    .from('member_instruments').delete().eq('profile_id', user.id);
  if (e1) return fail(e1, 'mi delete');
  if (instrumentIds.length) {
    const rows = instrumentIds.map((instrument_id, i) => ({
      profile_id: user.id, instrument_id, is_primary: i === 0,
    }));
    const { error: e2 } = await supabase.from('member_instruments').insert(rows);
    if (e2) return fail(e2, 'mi insert');
  }
}

// Admin define os instrumentos de um membro
export async function adminSetInstruments(profileId, instrumentIds) {
  const { error: e1 } = await supabase
    .from('member_instruments').delete().eq('profile_id', profileId);
  if (e1) return fail(e1, 'mi delete');
  if (instrumentIds.length) {
    const rows = instrumentIds.map((instrument_id, i) => ({
      profile_id: profileId, instrument_id, is_primary: i === 0,
    }));
    const { error: e2 } = await supabase.from('member_instruments').insert(rows);
    if (e2) return fail(e2, 'mi insert');
  }
}

// ------------------------------------------------------------------
// Eventos
// ------------------------------------------------------------------
export async function fetchUpcomingEvents(churchId) {
  const { data, error } = await supabase
    .from('events').select()
    .eq('church_id', churchId)
    .gte('starts_at', nowIso())
    .order('starts_at');
  if (error) return fail(error, 'events');
  return data;
}

export async function fetchEvent(id) {
  const { data, error } = await supabase
    .from('events').select().eq('id', id).maybeSingle();
  if (error) return fail(error, 'event');
  return data;
}

export async function fetchEventStatus(churchId) {
  const { data, error } = await supabase
    .from('event_status').select()
    .eq('church_id', churchId)
    .gte('starts_at', nowIso())
    .order('starts_at');
  if (error) return fail(error, 'event_status');
  return data;
}

export async function fetchEventStatusBetween(churchId, a, b) {
  const { data, error } = await supabase
    .from('event_status').select()
    .eq('church_id', churchId)
    .gte('starts_at', a).lte('starts_at', b)
    .order('starts_at');
  if (error) return fail(error, 'event_status');
  return data;
}

export async function fetchEventStatusById(id) {
  const { data, error } = await supabase
    .from('event_status').select().eq('id', id).maybeSingle();
  if (error) return fail(error, 'event_status');
  return data;
}

export async function fetchEventConfirmations(eventId) {
  const { data: em, error } = await supabase
    .from('event_members').select('profile_id, status').eq('event_id', eventId);
  if (error) return fail(error, 'event_members');
  if (!em.length) return [];
  const { data: emi, error: e2 } = await supabase
    .from('event_member_instruments').select('profile_id, instrument_id').eq('event_id', eventId);
  if (e2) return fail(e2, 'emi');
  const instruments = await fetchInstruments();
  const instById = Object.fromEntries(instruments.map((i) => [i.id, i]));
  const pickBy = {};
  for (const r of emi) (pickBy[r.profile_id] ??= []).push(instById[r.instrument_id]);
  return em.map((r) => ({
    profile_id: r.profile_id, status: r.status,
    instruments: (pickBy[r.profile_id] || []).filter(Boolean),
  }));
}

export async function fetchMyConfirmations(user, eventIds) {
  if (!eventIds.length) return {};
  const { data, error } = await supabase
    .from('event_members').select('event_id, status')
    .eq('profile_id', user.id).in('event_id', eventIds);
  if (error) return fail(error, 'my confirmations');
  return Object.fromEntries(data.map((r) => [r.event_id, r]));
}

export async function fetchMyEventInstruments(user, eventId) {
  const { data, error } = await supabase
    .from('event_member_instruments').select('instrument_id')
    .eq('event_id', eventId).eq('profile_id', user.id);
  if (error) return fail(error, 'my emi');
  return data.map((r) => r.instrument_id);
}

export async function saveMyAttendance(user, eventId, status, instrumentIds = []) {
  const { error } = await supabase
    .from('event_members')
    .upsert(
      { event_id: eventId, profile_id: user.id, status, updated_at: new Date().toISOString() },
      { onConflict: 'event_id,profile_id' }
    );
  if (error) return fail(error, 'attendance');
  const { error: e2 } = await supabase
    .from('event_member_instruments').delete()
    .eq('event_id', eventId).eq('profile_id', user.id);
  if (e2) return fail(e2, 'del emi');
  if (status === 'confirmado' && instrumentIds.length) {
    const rows = instrumentIds.map((instrument_id) => ({ event_id: eventId, profile_id: user.id, instrument_id }));
    const { error: e3 } = await supabase.from('event_member_instruments').insert(rows);
    if (e3) return fail(e3, 'ins emi');
  }
}

export async function saveMyAbsence(user, start_date, end_date, reason) {
  const { error } = await supabase
    .from('absences').insert({ profile_id: user.id, start_date, end_date, reason });
  if (error) return fail(error, 'absence insert');
}
export async function deleteAbsence(userId, absenceId, isAdmin) {
  let q = supabase.from('absences').delete().eq('id', absenceId);
  if (!isAdmin) q = q.eq('profile_id', userId);
  const { error } = await q;
  if (error) return fail(error, 'absence delete');
}

// ------------------------------------------------------------------
// Repertório (músicas por igreja + associação a eventos)
// ------------------------------------------------------------------
export async function fetchSongs(churchId) {
  const { data, error } = await supabase
    .from('songs').select().eq('church_id', churchId).order('title');
  if (error) return fail(error, 'songs');
  return data;
}

export async function fetchEventSongs(eventId) {
  const { data: es, error } = await supabase
    .from('event_songs').select().eq('event_id', eventId).order('position');
  if (error) return fail(error, 'event_songs');
  if (!es.length) return [];
  const ids = es.map((r) => r.song_id);
  const { data: songs, error: e2 } = await supabase.from('songs').select().in('id', ids);
  if (e2) return fail(e2, 'songs');
  const byId = Object.fromEntries(songs.map((s) => [s.id, s]));
  return es.map((r) => ({ ...(byId[r.song_id] || {}), position: r.position })).filter((s) => s.id);
}

export async function adminCreateSong(churchId, fields) {
  const { data, error } = await supabase
    .from('songs').insert({ ...fields, church_id: churchId }).select().single();
  if (error) return fail(error, 'song insert');
  return data;
}
export async function adminUpdateSong(id, fields) {
  const { data, error } = await supabase
    .from('songs').update(fields).eq('id', id).select().single();
  if (error) return fail(error, 'song update');
  return data;
}
export async function adminDeleteSong(id) {
  const { error } = await supabase.from('songs').delete().eq('id', id);
  if (error) return fail(error, 'song delete');
}
export async function adminSetEventSongs(eventId, songIds) {
  const { error: e1 } = await supabase.from('event_songs').delete().eq('event_id', eventId);
  if (e1) return fail(e1, 'event_songs delete');
  if (songIds.length) {
    const rows = songIds.map((song_id, i) => ({ event_id: eventId, song_id, position: i + 1 }));
    const { error: e2 } = await supabase.from('event_songs').insert(rows);
    if (e2) return fail(e2, 'event_songs insert');
  }
}

// ------------------------------------------------------------------
// Admin: eventos e papéis
// ------------------------------------------------------------------
export async function adminCreateEvent(user, churchId, fields) {
  const { data, error } = await supabase
    .from('events').insert({ ...fields, church_id: churchId, created_by: user.id })
    .select().single();
  if (error) return fail(error, 'event insert');
  return data;
}
export async function adminUpdateEvent(id, fields) {
  const { data, error } = await supabase
    .from('events').update(fields).eq('id', id).select().single();
  if (error) return fail(error, 'event update');
  return data;
}
export async function adminDeleteEvent(id) {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) return fail(error, 'event delete');
}
export async function adminToggleActive(profileId, active) {
  const { error } = await supabase.from('profiles').update({ active }).eq('id', profileId);
  if (error) return fail(error, 'active update');
}
export async function adminSetSystemAdmin(profileId, isSystemAdmin) {
  const { error } = await supabase
    .from('profiles').update({ role: isSystemAdmin ? 'system_admin' : 'membro' })
    .eq('id', profileId);
  if (error) return fail(error, 'role update');
}

