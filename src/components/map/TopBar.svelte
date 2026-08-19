<script lang="ts">
  import { ui, data, session, staleSources } from '../../lib/state.svelte';
  import { URL_METRICS } from '../../lib/url';
  import { useT, localizePath, LOCALES, type Locale, type MessageKey } from '../../i18n/ui';
  import { fmtDateIso } from '../../lib/format';

  let {
    locale,
    onshare,
    oncite,
    ondownload,
    onkeys,
  }: {
    locale: Locale;
    onshare: () => void;
    oncite: () => void;
    ondownload: () => void;
    onkeys: () => void;
  } = $props();
  const tr = $derived(useT(locale));
  const stale = $derived(staleSources());
  const metricLabel = (m: string) => tr(`metric.${m}` as MessageKey);
  const pathWithQuery = () => (typeof location !== 'undefined' ? location.search : '');
</script>

<header class="topbar" aria-label="Controls">
  <a class="brand" href={localizePath('/', locale)}>{tr('site.name')}</a>
  <span class="seg" role="group" aria-label="View">
    <button
      class="btn"
      type="button"
      aria-pressed={ui.v === 'asylum'}
      title={tr('view.asylum.help')}
      onclick={() => (ui.v = 'asylum')}>{tr('view.asylum')}</button
    >
    <button
      class="btn"
      type="button"
      aria-pressed={ui.v === 'origin'}
      title={tr('view.origin.help')}
      onclick={() => (ui.v = 'origin')}>{tr('view.origin')}</button
    >
  </span>
  <label class="visually-hidden" for="metric-select">Metric</label>
  <select id="metric-select" bind:value={ui.m}>
    {#each URL_METRICS as m (m)}
      {#if m !== 'hst' || ui.v === 'asylum'}
        <option value={m}>{metricLabel(m)}</option>
      {/if}
    {/each}
  </select>
  <span class="seg" role="group" aria-label="Normalisation">
    <button class="btn" type="button" aria-pressed={ui.n === 'abs'} onclick={() => (ui.n = 'abs')}
      >{tr('scale.abs')}</button
    >
    <button
      class="btn"
      type="button"
      aria-pressed={ui.n === 'per1k'}
      onclick={() => (ui.n = 'per1k')}>{tr('scale.per1k')}</button
    >
  </span>
  <label class="visually-hidden" for="scale-select">Scale</label>
  <select id="scale-select" bind:value={ui.sc} title="Colour scale">
    <option value="quant">{tr('scale.quant')}</option>
    <option value="log">{tr('scale.log')}</option>
    <option value="lin">{tr('scale.lin')}</option>
  </select>
  {#if stale.length}
    <button
      class="chip stale stale-chip"
      type="button"
      onclick={() => (session.dialog = 'stale')}
      title={stale.map(([id]) => id).join(', ')}
    >
      ⚠ {tr('source.stale', { since: fmtDateIso(stale[0]![1].stale_since ?? '') })}
    </button>
  {/if}
  <span class="spacer"></span>
  <button class="btn ghost" type="button" onclick={onshare} title={tr('share.title')}
    >🔗 {tr('share.copy')}</button
  >
  <button class="btn ghost" type="button" onclick={oncite} title={tr('cite.title')}
    >❝ {tr('source.cite')}</button
  >
  <button class="btn ghost" type="button" onclick={ondownload} title={tr('download.title')}
    >⬇ {tr('download.title')}</button
  >
  <button
    class="btn ghost icon"
    type="button"
    onclick={onkeys}
    title={tr('keys.title')}
    aria-label={tr('keys.title')}>?</button
  >
  <nav class="site-nav" aria-label="Primary">
    <a href={localizePath('/compare', locale) + (ui.cmp.length ? `?cmp=${ui.cmp.join(',')}` : '')}
      >{tr('nav.compare')}</a
    >
    <a href={localizePath('/data', locale)}>{tr('nav.data')}</a>
    <a href={localizePath('/methodology', locale)}>{tr('nav.methodology')}</a>
    <a href={localizePath('/about', locale)}>{tr('nav.about')}</a>
  </nav>
  <nav class="lang-switch" aria-label={tr('nav.language')}>
    {#each LOCALES as l (l)}
      <a
        href={localizePath('/', l) + pathWithQuery()}
        hreflang={l}
        lang={l}
        aria-current={l === locale ? 'true' : undefined}
        >{tr(l === 'en' ? 'nav.language.en' : 'nav.language.zh-Hant')}</a
      >
    {/each}
  </nav>
</header>
