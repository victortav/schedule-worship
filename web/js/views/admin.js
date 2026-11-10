// =====================================================================
// Admin: criar eventos + gerenciar membros (papéis, ativos, instrumentos)
// =====================================================================
import {
  fetchUpcomingEvents, fetchEventStatus, fetchMembers, fetchInstruments,
  adminCreateEvent, adminDeleteEvent, adminSetRole, adminSetInstruments, adminToggleActive,
} from '../api.js';
import { $, $$, esc, fmtWhen, relDay, statusBadge, avatar, toast } from '../ui.js';

export const Admin = {
  async render(el) {
    const ME = window.ME;
    if (ME.role !== 'admin') {
      el.innerHTML =
        '<div class="empty big"><div class="big">🔒</div><p>Apenas administradores.</p></div>';
      return;
    }
    const [events, status, members, instruments] = await Promise.all([
      fetchUpcomingEvents(), fetchEventStatus(), fetchMembers(), fetchInstruments(),
    ]);
    const stMap = Object.fromEntries(status.map((r) => [r.id, r]));

    el.innerHTML = `
      <h1>Administração</h1>

      <h2>📅 Novo evento</h2>
      <div class="card">
        <div class="form-grid">
          <label class="field"><span>Título</span><input id="ev-title" placeholder="Ensaio da semana"></label>
          <label class="field"><span>Tipo</span>
            <select id="ev-type">
              <option value="ensaio">Ensaio</option>
              <option value="evento">Evento</option>
            </select>
          </label>
          <label class="field"><span>Data</span><input type="date" id="ev-date" required></label>
          <label class="field"><span>Início</span><input type="time" id="ev-ini" value="19:30"></label>
          <label class="field"><span>Fim</span><input type="time" id="ev-fim" value="22:00"></label>
          <label class="field full"><span>Local</span><input id="ev-loc" placeholder="Sala de ensaios"></label>
          <label class="field full"><span>Notas</span><input id="ev-notes"></label>
        </div>
        <div class="form-actions"><button class="btn primary" id="ev-add">Criar evento</button></div>
      </div>
      <div id="ad-events" style="margin-top:12px"></div>

      <h2 style="margin-top:24px">👥 Membros</h2>
      <div id="ad-members"></div>`;
    // ------------------------- Evento: criar -------------------------
    const readForm = () => ({
      title: $('#ev-title', el).value.trim(),
      type: $('#ev-type', el).value,
      starts_at: new Date($('#ev-date', el).value + 'T' + ($('#ev-ini', el).value || '19:30')).toISOString(),
      ends_at: $('#ev-fim', el).value
        ? new Date($('#ev-date', el).value + 'T' + $('#ev-fim', el).value).toISOString()
        : null,
      location: $('#ev-loc', el).value.trim() || null,
      notes: $('#ev-notes', el).value.trim() || null,
    });

    $('#ev-add', el).addEventListener('click', async () => {
      const f = readForm();
      if (!f.title || !$('#ev-date', el).value) {
        const { toast } = await import('../ui.js');
        return toast('Preencha título e data.', 'erro');
      }
      try {
        await adminCreateEvent(ME, f);
        const { toast } = await import('../ui.js');
        toast('Evento criado');
        this.render(el);
      } catch { /* toast na api */ }
    });

    // ------------------- Evento: lista + excluir ---------------------
    const evList = $('#ad-events', el);
    if (!events.length) {
      evList.innerHTML = '<p class="muted small">Nenhum evento futuro.</p>';
    }
    for (const ev of events) {
      const row = document.createElement('div');
      row.className = 'card row';
      row.style.alignItems = 'center';
      row.innerHTML = `
        <div class="grow">
          <strong>${ev.type === 'ensaio' ? '🎼' : '🎤'} ${esc(ev.title)}</strong>
          <div class="muted small">${fmtWhen(ev.starts_at, ev.ends_at)} · ${relDay(ev.starts_at)}${ev.location ? ' · ' + esc(ev.location) : ''}</div>
        </div>
        ${stMap[ev.id] ? statusBadge(stMap[ev.id]) : ''}
        <a class="btn small ghost" href="#/evento/${ev.id}">ver</a>
        <button class="btn small danger" data-del="${ev.id}">excluir</button>`;
      evList.appendChild(row);
      $(`[data-del="${ev.id}"]`, row).addEventListener('click', async () => {
        if (!confirm(`Excluir "${ev.title}"?`)) return;
        try {
          await adminDeleteEvent(ev.id);
          const { toast } = await import('../ui.js');
          toast('Evento excluído');
          this.render(el);
        } catch { /* toast na api */ }
      });
    }

    // ------------------------- Membros -------------------------------
    const memList = $('#ad-members', el);
    for (const m of members) {
      const myIds = m.instruments.map((i) => i.id);
      const row = document.createElement('div');
      row.className = 'card';
      row.innerHTML = `
        <div class="row" style="align-items:center">
          ${avatar(m.full_name)}
          <div class="grow">
            <strong>${esc(m.full_name)}</strong>
            <div class="muted small">${m.instruments.length ? m.instruments.map((i) => i.name).join(', ') : 'sem instrumento'}</div>
          </div>
          <select data-role="${m.id}" class="btn small">
            <option value="membro" ${m.role === 'membro' ? 'selected' : ''}>membro</option>
            <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>admin</option>
          </select>
        </div>
        <div class="inst-picks" style="margin-top:8px">
          ${instruments
            .map(
              (i) =>
                `<label><input type="checkbox" value="${i.id}" data-mi="${m.id}" ${myIds.includes(i.id) ? 'checked' : ''}> ${esc(i.name)}</label>`
            )
            .join('')}
        </div>
        <div class="form-actions">
          <button class="btn small primary" data-save-mi="${m.id}">Salvar instrumentos</button>
          <button class="btn small ghost" data-toggle-active="${m.id}">${m.active ? 'Desativar' : 'Reativar'}</button>
        </div>`;
      memList.appendChild(row);

      $(`[data-role="${m.id}"]`, row).addEventListener('change', async (e) => {
        try {
          await adminSetRole(m.id, e.target.value);
          const { toast } = await import('../ui.js');
          toast('Papel atualizado');
        } catch { /* toast na api */ }
      });

      $(`[data-save-mi="${m.id}"]`, row).addEventListener('click', async () => {
        const ids = $$(`[data-mi="${m.id}"]:checked`, row).map((c) => Number(c.value));
        try {
          await adminSetInstruments(m.id, ids);
          const { toast } = await import('../ui.js');
          toast('Instrumentos salvos');
          this.render(el);
        } catch { /* toast na api */ }
      });

      $(`[data-toggle-active="${m.id}"]`, row).addEventListener('click', async () => {
        try {
          await adminToggleActive(m.id, !m.active);
          const { toast } = await import('../ui.js');
          toast(m.active ? 'Membro desativado' : 'Membro reativado');
          this.render(el);
        } catch { /* toast na api */ }
      });
    }
  },
};