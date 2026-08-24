<script lang="ts">
  import { ui, session, staleSources } from '../../lib/state.svelte';
  import { URL_METRICS } from '../../lib/url';
  import { useT, localizePath, LOCALES, type Locale, type MessageKey } from '../../i18n/ui';
  import { fmtDateIso } from '../../lib/format';
  import { CONTACT_EMAIL } from '../../lib/site';

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
  let menuOpen = $state(false);
  /** D17: contextual problem report — the mailto body carries the exact share URL of this view. */
  function report() {
    const subject = encodeURIComponent('[Where They Went] Problem report');
    const body = encodeURIComponent(
      `Page: ${location.href}

What looks wrong:

What you expected (with a source if possible):
`,
    );
    menuOpen = false;
    location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  }
  function closeMenuOnOutside(e: MouseEvent) {
    if (!(e.target as HTMLElement).closest('.menu')) menuOpen = false;
  }
</script>

<svelte:window onclick={closeMenuOnOutside} />

<header class="topbar" aria-label="Controls">
  <a class="brand" href={localizePath('/', locale)}>{tr('site.name')}</a>
  <span class="seg" role="group" aria-label="View">
    <button
      class="btn"
      type="button"
      aria-pressed={ui.v === 'asylum'}
      title={tr('view.asylum') + ' — ' + tr('view.asylum.help')}
      onclick={() => (ui.v = 'asylum')}>{tr('view.asylum.short')}</button
    >
    <button
      class="btn"
      type="button"
      aria-pressed={ui.v === 'origin'}
      title={tr('view.origin') + ' — ' + tr('view.origin.help')}
      onclick={() => (ui.v = 'origin')}>{tr('view.origin.short')}</button
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
      title={tr('scale.per1k')}
      onclick={() => (ui.n = 'per1k')}>/1,000</button
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
    >🔗 <span class="lbl">{tr('share.copy')}</span></button
  >
  <button class="btn ghost" type="button" onclick={oncite} title={tr('cite.title')}
    >❝ <span class="lbl">{tr('source.cite')}</span></button
  >
  <button class="btn ghost" type="button" onclick={ondownload} title={tr('download.title')}
    >⬇ <span class="lbl">{tr('download.title')}</span></button
  >
  <button
    class="btn ghost icon"
    type="button"
    onclick={onkeys}
    title={tr('keys.title')}
    aria-label={tr('keys.title')}>?</button
  >
  <div class="menu">
    <button
      class="btn ghost icon"
      type="button"
      aria-expanded={menuOpen}
      aria-haspopup="true"
      aria-label={tr('nav.menu')}
      onclick={() => (menuOpen = !menuOpen)}>☰</button
    >
    {#if menuOpen}
      <div class="menu-panel">
        <nav class="menu-nav" aria-label="Primary">
          <a
            href={localizePath('/compare', locale) +
              (ui.cmp.length ? `?cmp=${ui.cmp.join(',')}` : '')}>{tr('nav.compare')}</a
          >
          <a href={localizePath('/data', locale)}>{tr('nav.data')}</a>
          <a href={localizePath('/methodology', locale)}>{tr('nav.methodology')}</a>
          <a href={localizePath('/about', locale)}>{tr('nav.about')}</a>
          <a href={localizePath('/about/boundaries', locale)}>{tr('nav.boundaries')}</a>
          <a href={localizePath('/stories', locale)}>{tr('nav.stories')}</a>
          <button type="button" class="report-item" onclick={report}>{tr('page.report')}</button>
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
      </div>
    {/if}
  </div>
</header>

<style>
  .menu {
    position: relative;
  }
  .menu-panel {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-2);
    padding: var(--sp-2);
    min-width: 200px;
    z-index: 30;
  }
  .menu-nav {
    display: grid;
    gap: 2px;
    margin-bottom: var(--sp-2);
    padding-bottom: var(--sp-2);
    border-bottom: 1px solid var(--c-border);
  }
  .menu-nav a {
    text-decoration: none;
    color: var(--c-text);
    padding: 6px 8px;
    border-radius: var(--radius-sm);
  }
  .menu-nav a:hover {
    background: var(--c-surface-2);
  }
  .report-item {
    border: 0;
    background: none;
    font: inherit;
    color: var(--c-text);
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: pointer;
  }
  .report-item:hover {
    background: var(--c-surface-2);
  }
  @media (max-width: 1100px) {
    .lbl {
      display: none;
    }
  }
</style>
