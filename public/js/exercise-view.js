'use strict';
// Detaliile unui exercițiu, așa cum apar în aplicație. Aceeași funcție e folosită de aplicație (dialogul din plan)
// și de previzualizarea din editorul de exerciții al panoului de administrare.
// `e`: { name, mode, sets, reps, seconds, restSec, steps[], instructions, mistakes[], imageUrl, video: { url, file, source } }

function exerciseDetailHtml(e) {
  const dose = e.sets
    ? `${e.sets} × ${e.mode === 'time' ? `${e.seconds ?? '—'} s` : `${e.reps ?? '—'} repetări`}${e.restSec !== null && e.restSec !== undefined ? ` · pauză ${e.restSec} s` : ''}`
    : '';
  const steps = e.steps?.length ? e.steps : e.instructions ? [e.instructions] : [];
  const video = e.video?.url ? e.video : null;
  const media = video?.file
    ? `<video class="ex-media" src="${esc(video.url)}" controls preload="metadata" playsinline${e.imageUrl ? ` poster="${esc(e.imageUrl)}"` : ''}></video>`
    : e.imageUrl ? `<img class="ex-media" src="${esc(e.imageUrl)}" alt="">` : '';
  return `
    <div class="ex-view">
      ${media}
      <h2>${esc(e.name || 'Exercițiu fără nume')}</h2>
      ${dose ? `<span class="tag green">${dose}</span>` : ''}
      ${steps.length ? `<h3 class="ex-sub">Cum se execută</h3><ol class="ex-steps">${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
      ${e.mistakes?.length ? `<h3 class="ex-sub">Greșeli frecvente</h3><ul class="ex-mistakes">${e.mistakes.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${video && !video.file && /^https:\/\//.test(video.url) ? `<a class="btn outline small ex-video-link" href="${esc(video.url)}" target="_blank" rel="noopener noreferrer">${icon('play')}Vezi demonstrația video</a>` : ''}
      ${video?.source ? `<p class="ex-credit">Video: ${esc(video.source)}</p>` : ''}
      <p class="small-note">Mișcă-te controlat și oprește-te dacă apare durere.</p>
    </div>`;
}
