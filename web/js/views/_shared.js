// =====================================================================
// Controles compartilhados: resposta de presença (+ instrumentos)
// e gerenciador de licenças
// =====================================================================
import {
  saveMyAttendance, saveMyAbsence, deleteAbsence,
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