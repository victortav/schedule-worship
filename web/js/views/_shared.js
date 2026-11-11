// =====================================================================
// Controles compartilhados: resposta de presença (+ instrumentos)
// e gerenciador de licenças
// =====================================================================
import {
  saveMyAttendance, saveMyAbsence, deleteAbsence,
  fetchEvent, fetchEventStatusById, fetchEventConfirmations, fetchMembers, fetchEventSongs,
} from '../api.js';
import { $, $$, esc, toast } from '../ui.js';

// ---------------------------------------------------------------------
// Controle de presença
// el: container onde o controle vive
// myInstruments: [{id,name,category}] que o USUÁRIO Toca (membro)
// current: { status:'pendente'|'confirmado'|'ausente', picks:[instrumentId] }
// ---------------------------------------------------------------------
export function mountAnswer(el, user, eventId, myInstruments, current, onSaved) {
  let picks = new Set(current.picks || []);
  let busy = false;

  async function save(status, ids) {
    if (busy) return;
    busy = true;
    try {
      await saveMyAttendance(user, eventId, status, ids);
      current = { status, picks: status === 'confirmado' ? ids : [] };
      picks = new Set(ids);
      toast('Resposta salva');
      render();
      onSaved?.();
    } catch {
      /* erro já virou toast amigável no api.js (fail) — nada mais a fazer */
    } finally {
      busy = false;
    }
  }

  function showPicks() {
    el.innerHTML = `
      <div class="inst-picks">
        ${myInstruments.length
          ? myInstruments.map((i) =>
              `<label><input type="checkbox" value="${i.id}" ${picks.has(i.id) ? 'checked' : ''}> ${esc(i.name)}</label>`
            ).join('')
          : '<span class="muted">Nenhum instrumento cadastrado — peça ao admin.</span>'}
      </div>
      <div class="form-actions">
        <button class="btn primary" id="a-save">Confirmar presença</button>
        <button class="btn ghost" id="a-cancel">Cancelar</button>
      </div>`;
    $('#a-cancel', el).onclick = render;
    $('#a-save', el).onclick = () => {
      picks = new Set($$('input:checked', el).map((c) => Number(c.value)));
      save('confirmado', [...picks]);
    };
  }

  function render() {
    const s = current.status || 'pendente';
    if (s === 'confirmado') {
      const tocando = current.picks
        .map((id) => myInstruments.find((i) => i.id === id)?.name)
        .filter(Boolean)
        .join(', ');
      el.innerHTML = `
        <div class="row" style="flex-wrap:wrap;gap:8px;align-items:center">
          <span class="badge b-ok">✅ Vou</span>
          ${tocando ? `<span class="chip">${esc(tocando)}</span>` : '<span class="muted small">sem instrumento</span>'}
          <button class="btn small ghost" id="a-edit">Alterar</button>
          <button class="btn small ghost" id="a-clear">Desfazer</button>
        </div>`;
      $('#a-edit', el).onclick = showPicks;
      $('#a-clear', el).onclick = () => save('pendente', []);
    } else if (s === 'ausente') {
      el.innerHTML = `
        <div class="row" style="gap:8px;align-items:center">
          <span class="badge b-pend">❌ Não vou</span>
          <button class="btn small ghost" id="a-edit">Alterar</button>
        </div>`;
      $('#a-edit', el).onclick = showPicks;
    } else {
      el.innerHTML = `
        <div class="form-actions">
          <button class="btn primary" id="a-vou">🎶 Vou</button>
          <button class="btn ghost" id="a-nao">❌ Não vou</button>
        </div>`;
      $('#a-vou', el).onclick = showPicks;
      $('#a-nao', el).onclick = () => save('ausente', []);
    }
  }
  render();
}

// ---------------------------------------------------------------------
// Licenças: formulário + lista (do próprio usuário)
// absences: [ {id, start_date, end_date, reason} ]
// ---------------------------------------------------------------------
export function mountAbsences(el, user, absences, onSaved) {
  const fmt = (d) => new Date(d).toLocaleDateString('pt-BR');
  el.innerHTML = `
    <div class="card">
      <div class="form-grid">
        <label class="field"><span>Início</span><input type="date" id="ab-ini" required></label>
        <label class="field"><span>Fim</span><input type="date" id="ab-fim" required></label>
        <label class="field full"><span>Motivo (opcional)</span><input type="text" id="ab-motivo" placeholder="Viagem, trabalho..."></label>
      </div>
      <div class="form-actions"><button class="btn primary" id="ab-add">Marcar licença</button></div>
    </div>
    <div id="abs-rows"></div>`;

  const renderList = () => {
    const box = $('#abs-rows', el);
    const up = (absences || []).filter((a) => new Date(a.end_date) >= new Date());
    if (!up.length) {
      box.innerHTML = '<p class="muted small">Nenhuma licença futura.</p>';
      return;
    }
    box.innerHTML = up
      .map(
        (a) => `
      <div class="card row" style="align-items:center">
        <div class="grow"><strong>🏖 ${fmt(a.start_date)} – ${fmt(a.end_date)}</strong>
          ${a.reason ? `<div class="muted small">${esc(a.reason)}</div>` : ''}</div>
        <button class="btn small ghost" data-del="${a.id}">Excluir</button>
      </div>`
      )
      .join('');
    $$('[data-del]', box).forEach((b) =>
      (b.onclick = async () => {
        try {
          await deleteAbsence(user.id, b.dataset.del, user.role === 'admin');
          toast('Licença removida');
          onSaved?.();
        } catch { /* toast já veio da api */ }
      })
    );
  };

  $('#ab-add', el).onclick = async () => {
    const ini = $('#ab-ini', el).value;
    const fim = $('#ab-fim', el).value;
    if (!ini || !fim) return toast('Informe início e fim.', 'erro');
    if (fim < ini) return toast('Fim anterior ao início.', 'erro');
    try {
      await saveMyAbsence(user, ini, fim, $('#ab-motivo', el).value.trim() || null);
      toast('Licença marcada');
      $('#ab-ini', el).value = '';
      $('#ab-fim', el).value = '';
      $('#ab-motivo', el).value = '';
      onSaved?.();
    } catch { /* toast já veio da api */ }
  };

  renderList();
}

// ---------------------------------------------------------------------
// Picker genérico: busca dinâmica + lista de selecionados (remover/ordenar)
//   el: container · items: [{id,label,extra}] · initialIds: [id]
//   opts.ordered: mostra ↑/↓ (a ordem vira a "position" ao salvar)
//   retorna { getIds: () => [id...] (na ordem) }
// ---------------------------------------------------------------------
export function mountPicker(el, items, initialIds = [], opts = {}) {
  const { ordered = false, placeholder = 'Buscar…', empty = 'Nada adicionado.', limit = 8 } = opts;
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  let selected = (initialIds || []).filter((id) => byId[id]).map((id) => byId[id]);
  let query = '';

  function render() {
    const sel = new Set(selected.map((i) => i.id));
    const q = query.trim().toLowerCase();
    const matches = q
      ? items.filter((i) => !sel.has(i.id) && i.label.toLowerCase().includes(q)).slice(0, limit)
      : [];

    el.innerHTML = `
      <div class="picker">
        <input class="picker-search" type="text" placeholder="${esc(placeholder)}" value="${esc(query)}" autocomplete="off">
        ${
          q
            ? `<div class="picker-suggest">${
                matches.length
                  ? matches
                      .map(
                        (i) =>
                          `<button type="button" class="picker-opt" data-add="${esc(String(i.id))}"><span class="grow">${esc(i.label)}</span>${i.extra ? `<span class="muted small">${esc(i.extra)}</span>` : ''}</button>`
                      )
                      .join('')
                  : '<div class="picker-opt muted">nada encontrado</div>'
              }</div>`
            : ''
        }
        <div class="picker-selected">
          ${
            selected.length
              ? selected
                  .map(
                    (i, idx) => `
            <div class="picker-row">
              ${ordered ? `<span class="picker-pos">${idx + 1}</span>` : ''}
              <span class="grow">${esc(i.label)}${i.extra ? ` <span class="muted small">${esc(i.extra)}</span>` : ''}</span>
              ${i.link ? `<a class="btn small ghost" href="${esc(i.link)}" target="_blank" rel="noopener" title="letra/cifra">🔗</a>` : ''}
              ${
                ordered
                  ? `<button type="button" class="btn small ghost" data-up="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn small ghost" data-down="${idx}" ${idx === selected.length - 1 ? 'disabled' : ''}>↓</button>`
                  : ''
              }
              <button type="button" class="btn small danger" data-rm="${idx}">✕</button>
            </div>`
                  )
                  .join('')
              : `<p class="muted small">${esc(empty)}</p>`
          }
        </div>
      </div>`;

    const inp = $('.picker-search', el);
    inp.oninput = () => {
      query = inp.value;
      const pos = inp.selectionStart;
      render();
      const n = $('.picker-search', el);
      n.focus();
      n.setSelectionRange(pos, pos);
    };
    $$('[data-add]', el).forEach((b) => {
      b.onclick = () => {
        const it = byId[b.dataset.add];
        if (it) {
          selected.push(it);
          query = '';
          render();
        }
      };
    });
    $$('[data-rm]', el).forEach((b) => {
      b.onclick = () => {
        selected.splice(Number(b.dataset.rm), 1);
        render();
      };
    });
    $$('[data-up]', el).forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.up);
        [selected[i - 1], selected[i]] = [selected[i], selected[i - 1]];
        render();
      };
    });
    $$('[data-down]', el).forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.down);
        [selected[i + 1], selected[i]] = [selected[i], selected[i + 1]];
        render();
      };
    });
  }
  render();
  return { getIds: () => selected.map((i) => i.id) };
}

export function mountSongPicker(el, songs, initialIds) {
  return mountPicker(
    el,
    songs.map((s) => ({ id: s.id, label: s.title, extra: s.music_key ? `Tom: ${s.music_key}` : '', link: s.link })),
    initialIds,
    { ordered: true, placeholder: '🔎 Buscar música para adicionar…', empty: 'Nenhuma música no repertório.' }
  );
}
export function mountInstrumentPicker(el, instruments, initialIds) {
  return mountPicker(
    el,
    instruments.map((i) => ({ id: i.id, label: i.name, extra: i.category })),
    initialIds,
    { ordered: false, placeholder: '🔎 Buscar instrumento…', empty: 'Nenhum instrumento adicionado.' }
  );
}

// ---------------------------------------------------------------------
// Compartilhar evento (texto resumido p/ WhatsApp)
// ---------------------------------------------------------------------
export async function buildEventShareText(eventId) {
  const ev = await fetchEvent(eventId);
  if (!ev) return '';
  const [st, conf, members, songs] = await Promise.all([
    fetchEventStatusById(eventId),
    fetchEventConfirmations(eventId),
    fetchMembers(window.ACTIVE_CHURCH_ID),
    fetchEventSongs(eventId),
  ]);
  const confMap = Object.fromEntries(conf.map((c) => [c.profile_id, c]));
  const going = members.filter((m) => confMap[m.id]?.status === 'confirmado');

  const d = new Date(ev.starts_at);
  const data = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  let fim = '';
  if (ev.ends_at) {
    const e = new Date(ev.ends_at);
    fim = `–${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`;
  }

  const lines = [];
  lines.push(`${ev.type === 'ensaio' ? '🎼' : '🎤'} *${ev.title}*`);
  lines.push(`📅 ${data} às ${hh}${fim}`);
  if (ev.location) lines.push(`📍 ${ev.location}`);
  if (ev.notes) lines.push(`📝 ${ev.notes}`);
  lines.push('');
  lines.push(`✅ *Confirmados: ${going.length}*`);
  if (going.length) {
    for (const m of going) {
      const insts = (confMap[m.id]?.instruments || []).map((i) => i.name).join(', ');
      lines.push(`• ${m.full_name}${insts ? ` — ${insts}` : ''}`);
    }
  } else lines.push('• (ninguém confirmou ainda)');
  lines.push('');
  lines.push(`🎵 *Repertório: ${songs.length}*`);
  if (songs.length) {
    songs.forEach((s, i) => {
      lines.push(
        `${i + 1}. ${s.title}${s.artist ? ` — ${s.artist}` : ''}${s.music_key ? ` (Tom: ${s.music_key})` : ''}`
      );
    });
  } else lines.push('• (sem repertório definido)');
  return lines.join('\n');
}

export function shareToWhatsApp(text) {
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}

// Modal de compartilhamento (copiar + abrir WhatsApp)
export async function shareEvent(eventId) {
  const text = await buildEventShareText(eventId);
  if (!text) return;
  let m = document.getElementById('share-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'share-modal';
    m.className = 'modal';
    document.body.appendChild(m);
  }
  m.innerHTML = `
    <div class="modal-box">
      <div class="row" style="align-items:center">
        <strong class="grow">📤 Compartilhar no WhatsApp</strong>
        <button class="btn small ghost" id="sh-close">✕</button>
      </div>
      <textarea class="share-text" readonly>${esc(text)}</textarea>
      <div class="form-actions">
        <button class="btn primary" id="sh-wa">Abrir WhatsApp</button>
        <button class="btn ghost" id="sh-copy">Copiar texto</button>
      </div>
    </div>`;
  m.style.display = 'flex';
  const close = () => (m.style.display = 'none');
  m.querySelector('#sh-close').onclick = close;
  m.querySelector('#sh-wa').onclick = () => shareToWhatsApp(text);
  m.querySelector('#sh-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Texto copiado');
    } catch {
      m.querySelector('.share-text').select();
      document.execCommand('copy');
      toast('Texto copiado');
    }
  };
  m.onclick = (e) => {
    if (e.target === m) close();
  };
}