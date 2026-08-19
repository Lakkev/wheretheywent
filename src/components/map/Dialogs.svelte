<script lang="ts">
  /** Share / Cite / Download / Keys / Stale dialogs for the map page. */
  import { ui, data, session, raw, staleSources } from '../../lib/state.svelte';
  import Modal from '../ui/Modal.svelte';
  import CopyField from '../ui/CopyField.svelte';
  import type { ViewResult } from '../../lib/view';
  import { buildCitations, viewTitle } from '../../lib/citation';
  import {
    viewRowsToCsv,
    provenanceComments,
    buildJsonExport,
    saveFile,
    safeFilename,
    type ViewExportRow,
  } from '../../lib/csv-client';
  import { displayName } from '../../lib/data';
  import { useT, type Locale, type MessageKey } from '../../i18n/ui';
  import { fmtDateIso } from '../../lib/format';
  import { localizePath } from '../../i18n/ui';
  import type { DisputedNotes } from '../../lib/types';

  let disputed = $state<DisputedNotes | null>(null);
  $effect(() => {
    if (session.dialog === 'boundaries' && !disputed)
      void raw.client.disputed().then((n) => (disputed = n));
  });

  let { locale, view, permalink }: { locale: Locale; view: ViewResult; permalink: string } =
    $props();
  const tr = $derived(useT(locale));
  const close = () => (session.dialog = null);

  const metricLabel = $derived(tr(`metric.${ui.m}` as MessageKey));
  const viewLabel = $derived(ui.v === 'asylum' ? tr('view.asylum') : tr('view.origin'));
  const selectedName = $derived(
    ui.c ? displayName(raw.countryIndex.get(ui.c), locale, ui.c) : null,
  );
  const title = $derived(
    viewTitle({
      metricLabel,
      viewLabel,
      year: ui.y,
      country: selectedName,
      norm: ui.n,
      normLabel: tr('scale.per1k'),
    }),
  );
  const sourceId = $derived(ui.m === 'idps' ? 'unhcr_idmc' : 'unhcr_population');
  const sources = $derived.by(() => {
    const s = data.sources ?? {};
    const list = [s[sourceId], ui.n === 'per1k' ? s['wpp_population'] : undefined].filter(
      (x): x is NonNullable<typeof x> => !!x,
    );
    return list;
  });
  const citations = $derived(buildCitations({ locale, title, url: permalink, sources }));
  const snapshotId = $derived(data.manifest?.snapshot_id ?? 'local');

  let withComments = $state(
    typeof localStorage !== 'undefined' && localStorage.getItem('wtw.csvComments') === '1',
  );
  $effect(() => {
    if (typeof localStorage !== 'undefined')
      localStorage.setItem('wtw.csvComments', withComments ? '1' : '0');
  });

  function exportRows(): ViewExportRow[] {
    return view.rows
      .filter((r) => r.abs !== null && r.visible)
      .sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9) || a.iso3.localeCompare(b.iso3))
      .map((r) => ({
        iso3: r.iso3,
        country_name: r.meta.name,
        year: ui.y,
        metric: ui.m,
        view: ui.v,
        value: r.abs,
        per_1000: r.per1k,
        population: raw.stock.pop(r.iso3, ui.y),
        rank: r.rank || null,
      }));
  }
  function prov() {
    const s = sources[0]!;
    return {
      source_id: sourceId,
      source_attribution: s.attribution,
      data_as_of: s.data_as_of,
      retrieved_at: s.retrieved_at,
      snapshot_id: snapshotId,
    };
  }
  function downloadCsv() {
    const csv = viewRowsToCsv(exportRows(), prov(), {
      comments: withComments ? provenanceComments(prov(), permalink, title) : undefined,
    });
    saveFile(`wtw-${safeFilename(title)}.csv`, csv, 'text/csv');
  }
  function downloadJson() {
    const j = buildJsonExport({
      title,
      permalink,
      snapshotId,
      sources: Object.fromEntries(
        sources.map((s, i) => [i === 0 ? sourceId : 'wpp_population', s]),
      ),
      citations,
      notes: sources.flatMap((s) => s.caveats),
      data: exportRows(),
    });
    saveFile(`wtw-${safeFilename(title)}.json`, JSON.stringify(j, null, 2), 'application/json');
  }
  const stale = $derived(staleSources());
</script>

{#if session.dialog === 'share'}
  <Modal title={tr('share.title')} onclose={close}>
    <p class="small muted">{tr('share.help')}</p>
    <CopyField {locale} label="URL" value={permalink} rows={2} />
  </Modal>
{:else if session.dialog === 'cite'}
  <Modal title={tr('cite.title')} onclose={close}>
    <p class="small muted">{title}</p>
    <CopyField {locale} label={tr('cite.page')} value={citations.page} mono={false} />
    <CopyField {locale} label={tr('cite.apa')} value={citations.apa} mono={false} rows={2} />
    <CopyField
      {locale}
      label={tr('cite.chicago')}
      value={citations.chicago}
      mono={false}
      rows={2}
    />
    <CopyField {locale} label={tr('cite.bibtex')} value={citations.bibtex} rows={8} />
  </Modal>
{:else if session.dialog === 'download'}
  <Modal title={tr('download.title')} onclose={close}>
    <p class="small muted">
      {tr('download.thisView')}: {title} — {view.rows.filter((r) => r.abs !== null && r.visible)
        .length}
      {tr('common.country').toLowerCase()} rows
    </p>
    <div class="dl-actions">
      <button class="btn primary" type="button" onclick={downloadCsv}>⬇ {tr('download.csv')}</button
      >
      <button class="btn" type="button" onclick={downloadJson}>⬇ {tr('download.json')}</button>
    </div>
    <label class="small check"
      ><input type="checkbox" bind:checked={withComments} /> {tr('download.comments')}</label
    >
    <p class="small muted">
      {tr('download.license', {
        license: sources[0]?.license.id ?? 'CC BY 4.0',
        attribution: sources[0]?.attribution ?? 'UNHCR',
      })}
    </p>
    <p class="small"><a href="/data">{tr('download.allYears')} →</a></p>
  </Modal>
{:else if session.dialog === 'keys'}
  <Modal title={tr('keys.title')} onclose={close}>
    <table class="keys">
      <tbody>
        <tr><td><kbd>/</kbd></td><td>{tr('keys.search')}</td></tr>
        <tr><td><kbd>T</kbd></td><td>{tr('keys.table')}</td></tr>
        <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>{tr('keys.year')}</td></tr>
        <tr><td><kbd>Space</kbd></td><td>{tr('keys.play')}</td></tr>
        <tr><td><kbd>C</kbd></td><td>{tr('keys.compare')}</td></tr>
        <tr><td><kbd>D</kbd></td><td>{tr('keys.download')}</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>{tr('keys.escape')}</td></tr>
        <tr><td><kbd>?</kbd></td><td>{tr('keys.help')}</td></tr>
      </tbody>
    </table>
  </Modal>
{:else if session.dialog === 'boundaries'}
  <Modal title={tr('page.boundaries.title')} onclose={close} wide>
    {#if disputed}
      <blockquote class="callout small">
        {locale === 'zh-Hant' ? disputed.disclaimer_zh : disputed.disclaimer_en}
      </blockquote>
      <p class="small muted">
        {tr('map.attribution.boundaries')} · {tr('detail.nameNote', { source: 'UNHCR' })}
      </p>
      <div class="notes">
        {#each disputed.notes as n (n.id)}
          <details class="small">
            <summary
              ><strong>{locale === 'zh-Hant' ? n.name_zh : n.name}</strong>{#if n.iso3}&nbsp;<code
                  class="muted">{n.iso3}</code
                >{/if}</summary
            >
            <p>{locale === 'zh-Hant' ? n.how_shown_zh : n.how_shown}</p>
            <p class="muted">{locale === 'zh-Hant' ? n.source_naming_zh : n.source_naming}</p>
          </details>
        {/each}
      </div>
      <p class="small">
        <a href={localizePath('/about/boundaries', locale)}>{tr('common.more')} →</a>
      </p>
    {:else}
      <p class="muted">{tr('common.loading')}</p>
    {/if}
  </Modal>
{:else if session.dialog === 'stale'}
  <Modal
    title={tr('source.stale', { since: fmtDateIso(stale[0]?.[1].stale_since ?? '') })}
    onclose={close}
  >
    <ul class="small">
      {#each stale as [id, s] (id)}
        <li>
          <strong>{s.publisher} — {s.title}</strong><br /><span class="muted"
            >{tr('source.stale.detail', { source: id })}
            {s.stale_since ? `(${fmtDateIso(s.stale_since)})` : ''}</span
          >
        </li>
      {/each}
    </ul>
  </Modal>
{/if}

<style>
  .dl-actions {
    display: flex;
    gap: var(--sp-2);
    margin: var(--sp-3) 0;
  }
  .check {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: var(--sp-3);
  }
  .keys td {
    border: 0;
    padding: 4px 8px;
  }
</style>
