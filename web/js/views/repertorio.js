// =====================================================================
// Repertório: biblioteca de músicas da igreja + associação por evento
// Aberto a QUALQUER membro da igreja (não é mais restrito ao admin).
// =====================================================================
import {
  fetchSongs, adminCreateSong, adminUpdateSong, adminDeleteSong,
  fetchUpcomingEvents, fetchEventSongs, adminSetEventSongs,
} from '../api.js';
import { $, $$, esc, fmtWhen, relDay, toast } from '../ui.js';

export const Repertorio = {
  async render(el) {
    const churchId = window.ACTIVE_CHURCH_ID;
    const [songs, events] = await Promise.all([
      fetchSongs(churchId),
      fetchUpcomingEvents(churchId),
    ]);

    el.innerHTML = `
      <h1>Repertório <span class="muted small">⛪ ${esc(window.ACTIVE_CHURCH?.name || '')}</span></h1>
      <p class="muted">Biblioteca de músicas da igreja e o que vai ser tocado em cada evento.</p>

      <h2>🎵 Músicas</h2>
      <div class="card">
        <div class="form-grid">
          <label class="field"><span>Música</span><input id="sg-title" placeholder="Nome da música"></label>
          <label class="field"><span>Artista</span><input id="sg-artist" placeholder="Nome do artista"></label>
          <label class="field"><span>Tom</span><input id="sg-key" placeholder="Ex.: G, Dm"></label>
          <label class="field full"><span>Link (letra/cifra)</span><input id="sg-link" placeholder="https://..."></label>
        </div>
        <div class="form-actions"><button class="btn primary" id="sg-add">Adicionar música</button></div>
      </div>
      <div id="rp-songs" style="margin-top:12px"></div>

      <h2 style="margin-top:24px">📅 Repertório por evento</h2>
      <div id="rp-events"></div>`;

    // ------------------- Músicas: lista -------------------
    const sgList = $('#rp-songs', el);
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
        <button class="btn small ghost" data-edit="${s.id}">editar</button>
        <button class="btn small danger" data-del="${s.id}">excluir</button>`;
      sgList.appendChild(row);

      $(`[data-del="${s.id}"]`, row).onclick = async () => {
        if (!confirm(`Excluir "${s.title}"?`)) return;
        try {
          await adminDeleteSong(s.id);
          toast('Música excluída');
          this.render(el);
        } catch {
          /* toast na api */
        }
      };
      $(`[data-edit="${s.id}"]`, row).onclick = async () => {
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

    // ------------------- Repertório por evento -------------------
    const evBox = $('#rp-events', el);
    if (!events.length) evBox.innerHTML = '<p class="muted small">Nenhum evento futuro.</p>';
    for (const ev of events) {
      const cur = await fetchEventSongs(ev.id);
      const curIds = new Set(cur.map((x) => x.id));
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="row">
          <div class="grow">
            <strong>${ev.type === 'ensaio' ? '🎼' : '🎤'} ${esc(ev.title)}</strong>
            <div class="muted small">${fmtWhen(ev.starts_at, ev.ends_at)} · ${relDay(ev.starts_at)}</div>
          </div>
          <a class="btn small ghost" href="#/evento/${ev.id}">ver</a>
        </div>
        <div class="inst-picks" style="margin-top:8px">
          ${
            songs
              .map(
                (s) =>
                  `<label><input type="checkbox" value="${s.id}" data-ev="${ev.id}" ${curIds.has(s.id) ? 'checked' : ''}> ${esc(s.title)}${s.music_key ? ' (' + esc(s.music_key) + ')' : ''}</label>`
              )
              .join('') || '<span class="muted small">Cadastre músicas acima.</span>'
          }
        </div>
        <div class="form-actions"><button class="btn small primary" data-save="${ev.id}">Salvar repertório</button></div>`;
      evBox.appendChild(card);

      $(`[data-save="${ev.id}"]`, card).onclick = async () => {
        const ids = $$(`[data-ev="${ev.id}"]:checked`, card).map((c) => c.value);
        try {
          await adminSetEventSongs(ev.id, ids);
          toast('Repertório salvo');
        } catch {
          /* toast na api */
        }
      };
    }
  },
};
