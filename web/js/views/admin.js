// =====================================================================
// Admin: eventos (+repertório), membros (papéis/instrumentos) e igrejas
// =====================================================================
import {
  fetchUpcomingEvents, fetchEventStatus, fetchMembers, fetchInstruments, fetchProfiles,
  adminCreateEvent, adminDeleteEvent, adminToggleActive, adminSetInstruments,
  adminSetChurchMemberRole, adminRemoveChurchMember, adminAddChurchMember,
  fetchSongs, adminCreateSong, adminUpdateSong, adminDeleteSong, adminSetEventSongs,
  fetchEventSongs, fetchAllChurches, adminCreateChurch,
} from '../api.js';
import { $, $$, esc, fmtWhen, relDay, statusBadge, avatar, toast } from '../ui.js';

export const Admin = {
  async render(el) {
    const ME = window.ME;
    if (!window.isAdmin()) {
      el.innerHTML =
        '<div class="empty big"><div class="big">🔒</div><p>Apenas administradores.</p></div>';
      return;
    }
    const churchId = window.ACTIVE_CHURCH_ID;
    const isSys = ME.role === 'system_admin';
    const [events, status, members, instruments, songs, profiles, allChurches] = await Promise.all([
      fetchUpcomingEvents(churchId),
      fetchEventStatus(churchId),
      fetchMembers(churchId),
      fetchInstruments(),
      fetchSongs(churchId),
      fetchProfiles(),
      isSys ? fetchAllChurches() : Promise.resolve([]),
    ]);
    const stMap = Object.fromEntries(status.map((r) => [r.id, r]));
    const memberIds = new Set(members.map((m) => m.id));
    const candidates = profiles.filter((p) => p.active && !memberIds.has(p.id));

    el.innerHTML = `
      <h1>Administração <span class="muted small">⛪ ${esc(window.ACTIVE_CHURCH?.name || '')}</span></h1>

      <h2>📅 Novo evento</h2>
      <div class="card">
        <div class="form-grid">
          <label class="field"><span>Título</span><input id="ev-title" placeholder="Ensaio da semana"></label>
          <label class="field"><span>Tipo</span>
            <select id="ev-type"><option value="ensaio">Ensaio</option><option value="evento">Evento</option></select>
          </label>
          <label class="field"><span>Data</span><input id="ev-date" placeholder="Selecione a data"></label>
          <label class="field"><span>Início</span><input id="ev-ini" placeholder="19:30"></label>
          <label class="field"><span>Fim</span><input id="ev-fim" placeholder="22:00"></label>
          <label class="field"><span>Local</span><input id="ev-loc" placeholder="Sala de ensaios"></label>
          <label class="field full"><span>Notas</span><input id="ev-notes"></label>
        </div>
        <div class="form-actions"><button class="btn primary" id="ev-add">Criar evento</button></div>
      </div>
      <div id="ad-events" style="margin-top:12px"></div>

      <h2 style="margin-top:24px">🎵 Repertório da igreja</h2>
      <div class="card">
        <div class="form-grid">
          <label class="field"><span>Música</span><input id="sg-title" placeholder="Nome da música"></label>
          <label class="field"><span>Artista</span><input id="sg-artist" placeholder="Nome do artista"></label>
          <label class="field"><span>Tom</span><input id="sg-key" placeholder="Ex.: G, Dm"></label>
          <label class="field full"><span>Link (letra/cifra)</span><input id="sg-link" placeholder="https://..."></label>
        </div>
        <div class="form-actions"><button class="btn primary" id="sg-add">Adicionar música</button></div>
      </div>
      <div id="ad-songs" style="margin-top:12px"></div>

      <h2 style="margin-top:24px">👥 Membros</h2>
      ${
        candidates.length
          ? `<div class="card">
             <div class="form-grid">
               <label class="field"><span>Adicionar integrante</span>
                 <select id="add-mem">${candidates
                   .map((p) => `<option value="${p.id}">${esc(p.full_name)}</option>`)
                   .join('')}</select>
               </label>
               <label class="field"><span>Papel</span>
                 <select id="add-role"><option value="membro">membro</option><option value="admin">admin</option></select>
               </label>
             </div>
             <div class="form-actions"><button class="btn primary" id="add-mem-btn">Adicionar à igreja</button></div>
           </div>`
          : ''
      }
      <div id="ad-members"></div>

      ${
        isSys
          ? `<h2 style="margin-top:24px">🛡 Igrejas (admin de sistema)</h2>
        <div class="card">
          <div class="row" style="gap:8px">
            <input id="ch-name" placeholder="Nome da nova igreja" style="flex:1">
            <button class="btn primary" id="ch-add">Criar igreja</button>
          </div>
          <div class="muted small" style="margin-top:8px">Existentes: ${allChurches.map((c) => esc(c.name)).join(' · ')}</div>
        </div>`
          : ''
      }
    `;

    // ---------------- pickers (flatpickr) ----------------
    const fp = window.flatpickr;
    if (fp) {
      fp('#ev-date', { locale: 'pt', dateFormat: 'Y-m-d', minDate: 'today', defaultDate: new Date() });
      fp('#ev-ini', { enableTime: true, noCalendar: true, dateFormat: 'H:i', time_24hr: true, defaultDate: '19:30' });
      fp('#ev-fim', { enableTime: true, noCalendar: true, dateFormat: 'H:i', time_24hr: true, defaultDate: '22:00' });
    }

    // ---------------- Evento: criar ----------------
    const readForm = () => {
      const date = $('#ev-date', el).value;
      const ini = $('#ev-ini', el).value || '19:30';
      const fim = $('#ev-fim', el).value;
      return {
        title: $('#ev-title', el).value.trim(),
        type: $('#ev-type', el).value,
        starts_at: date ? new Date(date + 'T' + ini).toISOString() : null,
        ends_at: date && fim ? new Date(date + 'T' + fim).toISOString() : null,
        location: $('#ev-loc', el).value.trim() || null,
        notes: $('#ev-notes', el).value.trim() || null,
      };
    };
    $('#ev-add', el).onclick = async () => {
      const f = readForm();
      if (!f.title || !f.starts_at) return toast('Preencha título e data.', 'erro');
      try {
        await adminCreateEvent(ME, churchId, f);
        toast('Evento criado');
        this.render(el);
      } catch {
        /* toast na api */
      }
    };

    // ---------------- Evento: lista + excluir + repertório ----------------
    const evList = $('#ad-events', el);
    if (!events.length) evList.innerHTML = '<p class="muted small">Nenhum evento futuro.</p>';
    for (const ev of events) {
      const cur = await fetchEventSongs(ev.id);
      const curIds = new Set(cur.map((s) => s.id));
      const row = document.createElement('div');
      row.className = 'card';
      row.innerHTML = `
        <div class="row" style="align-items:center">
          <div class="grow">
            <strong>${ev.type === 'ensaio' ? '🎼' : '🎤'} ${esc(ev.title)}</strong>
            <div class="muted small">${fmtWhen(ev.starts_at, ev.ends_at)} · ${relDay(ev.starts_at)}${ev.location ? ' · ' + esc(ev.location) : ''}</div>
          </div>
          ${stMap[ev.id] ? statusBadge(stMap[ev.id]) : ''}
          <a class="btn small ghost" href="#/evento/${ev.id}">ver</a>
          <button class="btn small danger" data-del="${ev.id}">excluir</button>
        </div>
        <details style="margin-top:8px">
          <summary class="muted small">🎵 Repertório (${cur.length} selecionada${cur.length === 1 ? '' : 's'})</summary>
          <div class="inst-picks" style="margin-top:8px">
            ${songs
              .map(
                (s) =>
                  `<label><input type="checkbox" value="${s.id}" data-ev="${ev.id}" ${curIds.has(s.id) ? 'checked' : ''}> ${esc(s.title)}${s.music_key ? ' (' + esc(s.music_key) + ')' : ''}</label>`
              )
              .join('') || '<span class="muted small">Cadastre músicas em “Repertório da igreja”.</span>'}
          </div>
          <div class="form-actions"><button class="btn small primary" data-save-rep="${ev.id}">Salvar repertório</button></div>
        </details>`;
      evList.appendChild(row);

      $(`[data-del="${ev.id}"]`, row).onclick = async () => {
        if (!confirm(`Excluir "${ev.title}"?`)) return;
        try {
          await adminDeleteEvent(ev.id);
          toast('Evento excluído');
          this.render(el);
        } catch {
          /* toast na api */
        }
      };
      $(`[data-save-rep="${ev.id}"]`, row).onclick = async () => {
        const ids = $$(`[data-ev="${ev.id}"]:checked`, row).map((c) => c.value);
        try {
          await adminSetEventSongs(ev.id, ids);
          toast('Repertório salvo');
        } catch {
          /* toast na api */
        }
      };
    }

    // ---------------- Músicas: lista + editar/excluir + criar ----------------
    const sgList = $('#ad-songs', el);
    if (!songs.length) sgList.innerHTML = '<p class="muted small">Nenhuma música cadastrada.</p>';
    for (const s of songs) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <div class="grow">
          <strong>${esc(s.title)}</strong>
          <div class="muted small">${esc(s.artist || '—')}${s.music_key ? ' · Tom: ' + esc(s.music_key) : ''}${
            s.link ? ` · <a href="${esc(s.link)}" target="_blank" rel="noopener">link</a>` : ''
          }</div>
        </div>
        <button class="btn small ghost" data-edit-song="${s.id}">editar</button>
        <button class="btn small danger" data-del-song="${s.id}">excluir</button>`;
      sgList.appendChild(row);
      $(`[data-del-song="${s.id}"]`, row).onclick = async () => {
        if (!confirm(`Excluir "${s.title}"?`)) return;
        try {
          await adminDeleteSong(s.id);
          toast('Música excluída');
          this.render(el);
        } catch {
          /* toast na api */
        }
      };
      $(`[data-edit-song="${s.id}"]`, row).onclick = async () => {
        const title = prompt('Nome da música:', s.title || '');
        if (title === null || !title.trim()) return;
        const artist = prompt('Artista:', s.artist || '');
        if (artist === null) return;
        const key = prompt('Tom:', s.music_key || '');
        if (key === null) return;
        const link = prompt('Link (letra/cifra):', s.link || '');
        if (link === null) return;
        try {
          await adminUpdateSong(s.id, {
            title: title.trim(),
            artist: artist.trim() || null,
            music_key: key.trim() || null,
            link: link.trim() || null,
          });
          toast('Música atualizada');
          this.render(el);
        } catch {
          /* toast na api */
        }
      };
    }
    $('#sg-add', el).onclick = async () => {
      const title = $('#sg-title', el).value.trim();
      if (!title) return toast('Informe o nome da música.', 'erro');
      try {
        await adminCreateSong(churchId, {
          title,
          artist: $('#sg-artist', el).value.trim() || null,
          music_key: $('#sg-key', el).value.trim() || null,
          link: $('#sg-link', el).value.trim() || null,
        });
        toast('Música adicionada');
        this.render(el);
      } catch {
        /* toast na api */
      }
    };

    // ---------------- Membros ----------------
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
            <div class="muted small">${m.instruments.length ? m.instruments.map((i) => i.name).join(', ') : 'sem instrumento'}${m.id === ME.id ? ' · você' : ''}</div>
          </div>
          <select data-role="${m.id}" class="btn small">
            <option value="membro" ${m.church_role === 'membro' ? 'selected' : ''}>membro</option>
            <option value="admin" ${m.church_role === 'admin' ? 'selected' : ''}>admin</option>
          </select>
        </div>
        <div class="inst-picks" style="margin-top:8px">
          ${instruments.map((i) => `<label><input type="checkbox" value="${i.id}" data-mi="${m.id}" ${myIds.includes(i.id) ? 'checked' : ''}> ${esc(i.name)}</label>`).join('')}
        </div>
        <div class="form-actions">
          <button class="btn small primary" data-save-mi="${m.id}">Salvar instrumentos</button>
          <button class="btn small ghost" data-toggle-active="${m.id}">${m.active ? 'Desativar' : 'Reativar'}</button>
          ${m.id !== ME.id ? `<button class="btn small danger" data-remove="${m.id}">Remover da igreja</button>` : ''}
        </div>`;
      memList.appendChild(row);

      $(`[data-role="${m.id}"]`, row).onchange = async (e) => {
        try {
          await adminSetChurchMemberRole(churchId, m.id, e.target.value);
          toast('Papel atualizado');
        } catch {
          /* toast na api */
        }
      };
      $(`[data-save-mi="${m.id}"]`, row).onclick = async () => {
        const ids = $$(`[data-mi="${m.id}"]:checked`, row).map((c) => Number(c.value));
        try {
          await adminSetInstruments(m.id, ids);
          toast('Instrumentos salvos');
          this.render(el);
        } catch {
          /* toast na api */
        }
      };
      $(`[data-toggle-active="${m.id}"]`, row).onclick = async () => {
        try {
          await adminToggleActive(m.id, !m.active);
          toast(m.active ? 'Membro desativado' : 'Membro reativado');
          this.render(el);
        } catch {
          /* toast na api */
        }
      };
      const rm = $(`[data-remove="${m.id}"]`, row);
      if (rm)
        rm.onclick = async () => {
          if (!confirm(`Remover ${m.full_name} da igreja?`)) return;
          try {
            await adminRemoveChurchMember(churchId, m.id);
            toast('Membro removido');
            this.render(el);
          } catch {
            /* toast na api */
          }
        };
    }

    // ---------------- Adicionar integrante ----------------
    const addBtn = $('#add-mem-btn', el);
    if (addBtn)
      addBtn.onclick = async () => {
        try {
          await adminAddChurchMember(churchId, $('#add-mem', el).value, $('#add-role', el).value);
          toast('Integrante adicionado');
          this.render(el);
        } catch {
          /* toast na api */
        }
      };

    // ---------------- Igrejas (system_admin) ----------------
    const chAdd = $('#ch-add', el);
    if (chAdd)
      chAdd.onclick = async () => {
        const name = $('#ch-name', el).value.trim();
        if (!name) return toast('Informe o nome da igreja.', 'erro');
        try {
          await adminCreateChurch(name);
          toast('Igreja criada');
          this.render(el);
        } catch {
          /* toast na api */
        }
      };
  },
};
