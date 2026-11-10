// =====================================================================
// Camada de dados (PostgREST via supabase-js)
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
// Catálogo: instrumentos + membros + licenças
// ------------------------------------------------------------------
export async function fetchInstruments() {
  const { data, error } = await supabase
    .from('instruments')
    .select()
    .order('id');
  if (error) return fail(error, 'instruments');
  return data;
}

export async function fetchProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select()
    .order('full_name');
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
    .from('absences')
    .select()
    .order('start_date', { ascending: false });
  if (error) return fail(error, 'absences');
  const map = {};
  for (const r of data) (map[r.profile_id] ??= []).push(r);
  return map;
}

// Licença ativa na data?
export function isOnLeave(absences, dateIso) {
  const d = new Date(dateIso);
  return (absences || []).some(
    (a) => new Date(a.start_date) <= d && d <= new Date(a.end_date)
  );
}

// Membros prontos p/ UI: [{...profile, instruments:[{id,name,category}], absences:[]}]
export async function fetchMembers() {
  const [profiles, mi, instruments, absences] = await Promise.all([
    fetchProfiles(),
    fetchMemberInstruments(),
    fetchInstruments(),
    fetchAbsences(),
  ]);
  const instById = Object.fromEntries(instruments.map((i) => [i.id, i]));
  return profiles
    .filter((p) => p.active)
    .map((p) => ({
      ...p,
      instruments: (mi[p.id] || [])
        .map((id) => instById[id])
        .filter(Boolean),
      absences: absences[p.id] || [],
    }));
}

// ------------------------------------------------------------------
// Eventos
// ------------------------------------------------------------------
export async function fetchUpcomingEvents() {
  const { data, error } = await supabase
    .from('events')
    .select()
    .gte('starts_at', nowIso())
    .order('starts_at');
  if (error) return fail(error, 'events');
  return data;
}

export async function fetchEvent(id) {
  const { data, error } = await supabase
    .from('events')
    .select()
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(error, 'event');
  return data;
}

// Status calculado (view event_status) dos eventos futuros
export async function fetchEventStatus() {
  const { data, error } = await supabase
    .from('event_status')
    .select()
    .gte('starts_at', nowIso())
    .order('starts_at');
  if (error) return fail(error, 'event_status');
  return data;
}

// Status de todos os eventos num período (para o calendário)
export async function fetchEventStatusBetween(startIso, endIso) {
  const { data, error } = await supabase
    .from('event_status')
    .select()
    .gte('starts_at', startIso)
    .lte('starts_at', endIso)
    .order('starts_at');
  if (error) return fail(error, 'event_status between');
  return data;
}

// Status de um evento específico (para a tela de detalhe)
export async function fetchEventStatusById(eventId) {
  const { data, error } = await supabase
    .from('event_status')
    .select()
    .eq('id', eventId)
    .maybeSingle();
  if (error) return fail(error, 'event_status by id');
  return data;
}

// Confirmações de um evento: [{profile_id, status, instruments:[{id,name,category}]}]
export async function fetchEventConfirmations(eventId) {
  const [ems, emis, instruments] = await Promise.all([
    supabase.from('event_members').select().eq('event_id', eventId),
    supabase.from('event_member_instruments').select().eq('event_id', eventId),
    fetchInstruments(),
  ]);
  if (ems.error) return fail(ems.error, 'event_members');
  if (emis.error) return fail(emis.error, 'event_member_instruments');
  const instById = Object.fromEntries(instruments.map((i) => [i.id, i]));
  const map = {};
  for (const r of emis.data)
    (map[r.profile_id] ??= []).push(instById[r.instrument_id]);
  return ems.data.map((r) => ({
    profile_id: r.profile_id,
    status: r.status,
    instruments: (map[r.profile_id] || []).filter(Boolean),
  }));
}

// Confirmações do usuário em vários eventos: { [eventId]: {event_id, status} }
export async function fetchMyConfirmations(user, eventIds) {
  if (!eventIds.length) return {};
  const { data, error } = await supabase
    .from('event_members')
    .select('event_id, status')
    .eq('profile_id', user.id)
    .in('event_id', eventIds);
  if (error) return fail(error, 'my event_members');
  return Object.fromEntries((data || []).map((r) => [r.event_id, r]));
}

// Meus instrumentos escolhidos num evento: [instrumentId]
export async function fetchMyEventInstruments(user, eventId) {
  const { data, error } = await supabase
    .from('event_member_instruments')
    .select('instrument_id')
    .eq('profile_id', user.id)
    .eq('event_id', eventId);
  if (error) return fail(error, 'my emi');
  return (data || []).map((r) => r.instrument_id);
}

// ------------------------------------------------------------------
// Escrever minha presença: resposta + 1 ou mais instrumentos
// ------------------------------------------------------------------
export async function saveMyAttendance(user, eventId, status, instrumentIds = []) {
  // 1) upsert da resposta
  const { error: e1 } = await supabase.from('event_members').upsert(
    { event_id: eventId, profile_id: user.id, status, updated_at: nowIso() },
    { onConflict: 'event_id,profile_id' }
  );
  if (e1) return fail(e1, 'save event_members');

  // 2) remove minhas escolhas antigas de instrumento
  const { error: e2 } = await supabase
    .from('event_member_instruments')
    .delete()
    .eq('event_id', eventId)
    .eq('profile_id', user.id);
  if (e2) return fail(e2, 'del emi');

  // 3) grava as escolhas novas (só quando confirmado)
  if (status === 'confirmado' && instrumentIds.length) {
    const rows = instrumentIds.map((instrument_id) => ({
      event_id: eventId,
      profile_id: user.id,
      instrument_id,
    }));
    const { error: e3 } = await supabase.from('event_member_instruments').insert(rows);
    if (e3) return fail(e3, 'ins emi');
  }
}

// ------------------------------------------------------------------
// Minhas licenças
// ------------------------------------------------------------------
export async function saveMyAbsence(user, start_date, end_date, reason) {
  const { error } = await supabase
    .from('absences')
    .insert({ profile_id: user.id, start_date, end_date, reason });
  if (error) return fail(error, 'absence insert');
}

export async function deleteAbsence(userId, absenceId, isAdmin) {
  let q = supabase.from('absences').delete().eq('id', absenceId);
  if (!isAdmin) q = q.eq('profile_id', userId);
  const { error } = await q;
  if (error) return fail(error, 'absence delete');
}

// ------------------------------------------------------------------
// Admin: eventos, membros, papéis
// ------------------------------------------------------------------
export async function adminCreateEvent(user, fields) {
  const { data, error } = await supabase
    .from('events')
    .insert({ ...fields, created_by: user.id })
    .select()
    .single();
  if (error) return fail(error, 'event insert');
  return data;
}

export async function adminUpdateEvent(id, fields) {
  const { data, error } = await supabase
    .from('events')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) return fail(error, 'event update');
  return data;
}

export async function adminDeleteEvent(id) {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) return fail(error, 'event delete');
}

export async function adminSetRole(profileId, role) {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', profileId);
  if (error) return fail(error, 'role update');
}

// Admin: define os instrumentos que um membro pode tocar
export async function adminSetInstruments(profileId, instrumentIds) {
  const { error: e1 } = await supabase
    .from('member_instruments')
    .delete()
    .eq('profile_id', profileId);
  if (e1) return fail(e1, 'mi delete');
  if (instrumentIds.length) {
    const rows = instrumentIds.map((instrument_id, i) => ({
      profile_id: profileId,
      instrument_id,
      is_primary: i === 0,
    }));
    const { error: e2 } = await supabase.from('member_instruments').insert(rows);
    if (e2) return fail(e2, 'mi insert');
  }
}

export async function adminToggleActive(profileId, active) {
  const { error } = await supabase
    .from('profiles')
    .update({ active })
    .eq('id', profileId);
  if (error) return fail(error, 'active update');
}

// Atualiza meu nome no perfil
export async function saveMyName(user, full_name) {
  const { error } = await supabase
    .from('profiles')
    .update({ full_name })
    .eq('id', user.id);
  if (error) return fail(error, 'profile update');
}