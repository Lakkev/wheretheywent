<script lang="ts">
  /** Share / Cite / Download / Keys / Stale dialogs for the map page. */
  import { ui, data, session, raw, staleSources, toast } from '../../lib/state.svelte';
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
  import {
    displayName,
    metricCaveats as metricCaveatsFor,
    sourceCaveats,
    zhData,
  } from '../../lib/data';
  import { useT, type Locale, type MessageKey } from '../../i18n/ui';
  import { fmtDateIso, fmtInt } from '../../lib/format';
  import { localizePath } from '../../i18n/ui';
  import type { DisputedNotes } from '../../lib/types';

  let disputed = $state<DisputedNotes | null>(null);
  $effect(() => {
    if (session.dialog === 'boundaries' && !disputed)
      void raw.client.disputed().then((n) => (disputed = n));
  });

  let {
    locale,
    view,
    permalink,
    onlocate,
  }: {
    locale: Locale;
    view: ViewResult;
    permalink: string;
    onlocate?: (lon: number, lat: number) => void;
  } = $props();
  const tr = $derived(useT(locale));
  const close = () => (session.dialog = null);

  // IDU event timeline (dialog 'events') — the chronology behind the dots
  let evType = $state<'all' | 'conflict' | 'disaster'>('all');
  let evShown = $state(120);
  $effect(() => {
    if (session.dialog === 'events') evShown = 120;
  });
  const evList = $derived.by(() => {
    const list = data.idu?.events ?? [];
    return [...list]
      .filter((e) => evType === 'all' || (e.type ?? '').toLowerCase() === evType)
      .sort((a, b) => (a.displacement_date < b.displacement_date ? 1 : -1));
  });
  const evTypeLabel = (t: string) => {
    const label = tr(('idu.type.' + (t ?? '').toLowerCase()) as MessageKey);
    return label.startsWith('idu.type.') ? t : label;
  };
  function locate(e: { lon: number | null; lat: number | null }) {
    if (e.lon === null || e.lat === null) return;
    close();
    onlocate?.(e.lon, e.lat);
  }

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
  /** metric-level caveats travel with every export (#audit-2) */
  const metricCaveats = $derived.by(() => {
    const def = data.metrics?.metrics?.[ui.m];
    return def ? metricCaveatsFor(def, locale) : [];
  });
  const citations = $derived(
    buildCitations({ locale, title, url: permalink, sources, version: snapshotId }),
  );
  const snapshotId = $derived(data.manifest?.snapshot_id ?? 'local');

  // #12: provenance comments ship by default — the stored flag records the OPT-OUT
  let withComments = $state(
    typeof localStorage === 'undefined' || localStorage.getItem('wtw.csvStrict') !== '1',
  );
  $effect(() => {
    if (typeof localStorage !== 'undefined')
      localStorage.setItem('wtw.csvStrict', withComments ? '0' : '1');
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
        yoy_delta: (() => {
          const prev = raw.stock.value(ui.v, r.iso3, ui.m, ui.y - 1);
          return r.abs !== null && prev !== null ? r.abs - prev : null;
        })(),
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
    try {
      const csv = viewRowsToCsv(exportRows(), prov(), {
        comments: withComments
          ? provenanceComments(prov(), permalink, title, [
              ...(ui.r.length ? [`region_filter: ${ui.r.join(',')}`] : []),
              ...(ui.min ? [`min_filter: ${ui.min}`] : []),
              ...metricCaveats.map((c) => `note: ${c}`),
            ])
          : undefined,
      });
      saveFile(`wtw-${safeFilename(title)}.csv`, csv, 'text/csv');
    } catch {
      toast(tr('toast.downloadError'));
    }
  }
  function downloadJson() {
    try {
      const j = buildJsonExport({
        title,
        permalink,
        snapshotId,
        sources: Object.fromEntries(
          sources.map((s, i) => [i === 0 ? sourceId : 'wpp_population', s]),
        ),
        citations,
        notes: [...metricCaveats, ...sources.flatMap((s) => sourceCaveats(s, locale))],
        data: exportRows(),
      });
      saveFile(`wtw-${safeFilename(title)}.json`, JSON.stringify(j, null, 2), 'application/json');
    } catch {
      toast(tr('toast.downloadError'));
    }
  }
  const stale = $derived(staleSources());
</script>

{#if session.dialog === 'share'}
  <Modal title={tr('share.title')} onclose={close} closeLabel={tr('common.close')}>
    <p class="small muted">{tr('share.help')}</p>
    <CopyField {locale} label="URL" value={permalink} rows={2} />
  </Modal>
{:else if session.dialog === 'cite'}
  <Modal title={tr('cite.title')} onclose={close} closeLabel={tr('common.close')}>
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
    <p class="small"><a href={localizePath('/cite', locale)}>{tr('cite.responsibly')} →</a></p>
  </Modal>
{:else if session.dialog === 'download'}
  <Modal title={tr('download.title')} onclose={close} closeLabel={tr('common.close')}>
    <p class="small muted">
      {tr('download.thisView')}: {title} — {tr('download.rowCount', {
        n: view.rows.filter((r) => r.abs !== null && r.visible).length,
      })}
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
  <Modal title={tr('keys.title')} onclose={close} closeLabel={tr('common.close')}>
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
  <Modal title={tr('page.boundaries.title')} onclose={close} closeLabel={tr('common.close')} wide>
    {#if disputed}
      <blockquote class="callout small">
        {zhData(locale) ? disputed.disclaimer_zh : disputed.disclaimer_en}
      </blockquote>
      <p class="small muted">
        {tr('map.attribution.boundaries')} · {tr('detail.nameNote', { source: 'UNHCR' })}
      </p>
      <div class="notes">
        {#each disputed.notes as n (n.id)}
          <details class="small">
            <summary
              ><strong>{zhData(locale) ? n.name_zh : n.name}</strong>{#if n.iso3}&nbsp;<code
                  class="muted">{n.iso3}</code
                >{/if}</summary
            >
            <p>{zhData(locale) ? n.how_shown_zh : n.how_shown}</p>
            <p class="muted">{zhData(locale) ? n.source_naming_zh : n.source_naming}</p>
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
{:else if session.dialog === 'events'}
  <Modal title={tr('idu.timeline')} onclose={close} closeLabel={tr('common.close')} wide>
    <p class="small muted">
      {tr('map.idu.body')}
      {#if data.idu}<span class="num">{data.idu.since} – {data.idu.until}</span>{/if}
    </p>
    <label class="small ev-filter">
      {tr('idu.col.type')}
      <select bind:value={evType}>
        <option value="all">{tr('idu.all')}</option>
        <option value="conflict">{tr('idu.type.conflict')}</option>
        <option value="disaster">{tr('idu.type.disaster')}</option>
      </select>
    </label>
    <div class="events-scroll">
      <table class="small">
        <thead>
          <tr>
            <th>{tr('idu.col.date')}</th>
            <th>{tr('idu.col.country')}</th>
            <th>{tr('idu.col.type')}</th>
            <th class="num">{tr('idu.col.figure')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each evList.slice(0, evShown) as e (e.id)}
            <tr>
              <td class="num">{e.displacement_date}</td>
              <td
                >{raw.countryIndex.get(e.iso3)
                  ? displayName(raw.countryIndex.get(e.iso3), locale, e.iso3)
                  : e.country}</td
              >
              <td>{evTypeLabel(e.type)}</td>
              <td class="num">{fmtInt(e.figure, locale)}</td>
              <td class="ev-actions">
                {#if e.lat !== null && e.lon !== null}
                  <button class="btn ghost" type="button" onclick={() => locate(e)}
                    >{tr('insight.see')}</button
                  >
                {/if}
                {#if e.url}
                  <a href={e.url} target="_blank" rel="noopener noreferrer" title={tr('idu.readReport')}
                    >↗</a
                  >
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if evList.length > evShown}
      <button class="btn" type="button" onclick={() => (evShown += 200)}
        >{tr('idu.showMore')} ({fmtInt(evList.length - evShown, locale)})</button
      >
    {/if}
    <p class="small muted">{tr('idu.definitionNote')}</p>
  </Modal>
{:else if session.dialog === 'stale'}
  <Modal
    title={tr('source.stale', { since: fmtDateIso(stale[0]?.[1].stale_since ?? '') })}
    onclose={close}
    closeLabel={tr('common.close')}
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
  .events-scroll {
    max-height: 55vh;
    overflow: auto;
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    margin: var(--sp-2) 0;
  }
  .ev-filter {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .ev-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
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
