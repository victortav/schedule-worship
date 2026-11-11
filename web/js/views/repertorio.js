// =====================================================================
// Repertório: biblioteca de músicas da igreja + associação por evento
// Aberto a QUALQUER membro. Biblioteca paginada (10) + ordenação por nome.
// Associação por evento: busca dinâmica + lista (remover/reordenar).
// =====================================================================
import {
  fetchSongs, adminCreateSong, adminUpdateSong, adminDeleteSong,
  fetchUpcomingEvents, fetchEventSongs, adminSetEventSongs,
} from '../api.js';
import { $, esc, fmtWhen, relDay, toast } from '../ui.js';
import { mountSongPicker } from './_shared.js';

const PAGE_SIZE = 10;
let sortMode = 'title_asc';
let page = 1;

const CMP = {
  title_asc: (a, b) => a.title.localeCompare(b.title, 'pt-BR'),
  title_desc: (a, b) => b.title.localeCompare(a.title, 'pt-BR'),
  artist_asc: (a, b) =>
    (a.artist || '').localeCompare(b.artist || '', 'pt-BR') || a.title.localeCompare(b.title, 'pt-BR'),
};

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

      <div class="row" style="justify-content:space-between;align-items:center;margin:14px 0 6px">
        <span class="muted small" id="rp-count"></span>
        <select id="rp-sort" class="btn small">
          <option value="title_asc">Nome (A–Z)</option>
          <option value="title_desc">Nome (Z–A)</option>
          <option value="artist_asc">Artista (A–Z)</option>
        </select>
      </div>
      <div id="rp-songlist"></div>
      <div class="pager" id="rp-pager"></div>

      <h2 style="margin-top:24px">📅 Repertório por evento</h2>
      <div id="rp-events"></div>`;

    const songList = $('#rp-songlist', el);
    const pager = $('#rp-pager', el);
    const count = $('#rp-count', el);
    const sortSel = $('#rp-sort', el);
    sortSel.value = sortMode;

    // ------------------- Biblioteca (paginada) -------------------
    function renderSongs() {
      const sorted = [...songs].sort(CMP[sortMode] || CMP.title_asc);
      const total = sorted.length;
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (page > pages) page = pages;
      if (page < 1) page = 1;
      const slice = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

      songList.innerHTML = '';
      if (!slice.length) songList.innerHTML = '<p class="muted small">Nenhuma música cadastrada.</p>';
      for (const s of slice) {
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
        songList.appendChild(row);

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

      count.textContent = `${total} música${total === 1 ? '' : 's'}`;
      pager.innerHTML = `
        <button class="btn small ghost" id="rp-prev" ${page <= 1 ? 'disabled' : ''}>‹</button>
        <span class="muted small">página ${page} de ${pages}</span>
        <button class="btn small ghost" id="rp-next" ${page >= pages ? 'disabled' : ''}>›</button>`;
      $('#rp-prev', el).onclick = () => {
        if (page > 1) {
          page--;
          renderSongs();
        }
      };
      $('#rp-next', el).onclick = () => {
        if (page < pages) {
          page++;
          renderSongs();
        }
      };
    }

    sortSel.onchange = () => {
      sortMode = sortSel.value;
      page = 1;
      renderSongs();
    };

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

    renderSongs();

    // ------------------- Repertório por evento (picker) -------------------
    const evBox = $('#rp-events', el);
    if (!events.length) evBox.innerHTML = '<p class="muted small">Nenhum evento futuro.</p>';
    for (const ev of events) {
      const cur = await fetchEventSongs(ev.id);
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
        <div data-pick="${ev.id}" style="margin-top:10px"></div>
        <div class="form-actions"><button class="btn small primary" data-save="${ev.id}">Salvar repertório</button></div>`;
      evBox.appendChild(card);

      const picker = mountSongPicker($(`[data-pick="${ev.id}"]`, card), songs, cur.map((x) => x.id));
      $(`[data-save="${ev.id}"]`, card).onclick = async () => {
        try {
          await adminSetEventSongs(ev.id, picker.getIds());
          toast('Repertório salvo');
        } catch {
          /* toast na api */
        }
      };
    }
  },
};
