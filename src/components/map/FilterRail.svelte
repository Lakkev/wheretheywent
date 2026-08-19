<script lang="ts">
  import { ui, data, session, selectCountry, prefetchCountry } from '../../lib/state.svelte';
  import type { ViewResult } from '../../lib/view';
  import { topRows } from '../../lib/view';
  import { displayName } from '../../lib/data';
  import { fmtValue } from '../../lib/format';
  import { useT, type Locale } from '../../i18n/ui';

  let {
    locale,
    view,
    searchEl = $bindable(),
  }: { locale: Locale; view: ViewResult; searchEl?: HTMLInputElement } = $props();
  const tr = $derived(useT(locale));
  let query = $state('');
  const open = $derived(ui.p === 'open');
  const regions = $derived(data.countriesFile?.regions ?? []);
  const top = $derived(topRows(view, 20));
  const maxTop = $derived(top[0]?.value ?? 1);
  const matches = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as typeof view.rows;
    return view.rows
      .filter((r) => r.meta.in_unhcr || r.meta.in_geo)
      .filter(
        (r) =>
          displayName(r.meta, locale).toLowerCase().includes(q) ||
          r.meta.name.toLowerCase().includes(q) ||
          r.iso3.toLowerCase() === q,
      )
      .slice(0, 12);
  });
  function toggleRegion(slug: string) {
    const i = ui.r.indexOf(slug);
    if (i >= 0) ui.r = ui.r.filter((x) => x !== slug);
    else ui.r = [...ui.r, slug].sort();
  }
  function pick(iso3: string) {
    selectCountry(iso3);
    query = '';
  }
</script>

<aside class="rail panel" class:is-collapsed={!open} aria-label={tr('rail.title')}>
  <div class="panel-head">
    <span class="title">{tr('rail.title')}</span>
    <span class="spacer"></span>
    <button
      class="btn ghost icon"
      type="button"
      aria-expanded={open}
      aria-label={open ? tr('rail.collapse') : tr('rail.expand')}
      onclick={() => (ui.p = open ? 'closed' : 'open')}>{open ? '‹' : '›'}</button
    >
  </div>
  {#if open}
    <div class="panel-body">
      <div class="rail-controls">
        <label>
          {tr('rail.search')}
          <input
            type="search"
            bind:this={searchEl}
            bind:value={query}
            placeholder={tr('rail.search.placeholder')}
            autocomplete="off"
            aria-autocomplete="list"
            aria-controls="search-results"
          />
        </label>
        {#if matches.length}
          <ul class="ranklist search-results" id="search-results" role="listbox">
            {#each matches as r (r.iso3)}
              <li
                role="option"
                aria-selected={ui.c === r.iso3}
                tabindex="0"
                onclick={() => pick(r.iso3)}
                onkeydown={(e) => e.key === 'Enter' && pick(r.iso3)}
                onmouseenter={() => prefetchCountry(r.iso3)}
              >
                <span class="rank">{r.iso3}</span>
                <span class="name">{displayName(r.meta, locale)}</span>
                <span class="val"
                  >{r.value === null ? '—' : fmtValue(r.value, ui.n, locale, true)}</span
                >
              </li>
            {/each}
          </ul>
        {/if}
        <fieldset class="regions">
          <legend>{tr('rail.region')}</legend>
          <label class="inline"
            ><input type="checkbox" checked={ui.r.length === 0} onchange={() => (ui.r = [])} />
            {tr('rail.region.all')}</label
          >
          {#each regions as reg (reg.slug)}
            <label class="inline"
              ><input
                type="checkbox"
                checked={ui.r.includes(reg.slug)}
                onchange={() => toggleRegion(reg.slug)}
              />
              {reg.name}</label
            >
          {/each}
        </fieldset>
        <label>
          {tr('rail.min')}
          <input
            type="number"
            min="0"
            step="1000"
            value={ui.min}
            onchange={(e) =>
              (ui.min = Math.max(0, Number((e.currentTarget as HTMLInputElement).value) || 0))}
          />
        </label>
      </div>
      <div class="rank-head">
        <span class="muted small">{tr('rail.top')}</span>
        <button class="btn ghost small" type="button" onclick={() => (ui.t = !ui.t)}
          >{tr('rail.showTable')}</button
        >
      </div>
      {#if top.length === 0}
        <p class="muted small">{tr('rail.rank.empty')}</p>
      {:else}
        <ol class="ranklist" aria-label={tr('rail.top')}>
          {#each top as r (r.iso3)}
            <li
              class:is-selected={ui.c === r.iso3}
              tabindex="0"
              onclick={() => pick(r.iso3)}
              onkeydown={(e) => e.key === 'Enter' && pick(r.iso3)}
              onmouseenter={() => ((session.hover = r.iso3), prefetchCountry(r.iso3))}
              onmouseleave={() => (session.hover = null)}
              style="position:relative"
            >
              <span class="bar" style="width:{Math.max(2, ((r.value ?? 0) / (maxTop || 1)) * 100)}%"
              ></span>
              <span class="rank">{r.rank}</span>
              <span class="name"
                >{displayName(r.meta, locale)}{#if !r.drawable}<span class="muted">
                    ◌</span
                  >{/if}</span
              >
              <span class="val num">{fmtValue(r.value, ui.n, locale, true)}</span>
            </li>
          {/each}
        </ol>
      {/if}
    </div>
  {/if}
</aside>

<style>
  .regions {
    border: 0;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 2px;
  }
  .regions legend {
    font-size: var(--fs-xs);
    color: var(--c-text-2);
    padding: 0;
    margin-bottom: 2px;
  }
  .regions .inline {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--fs-sm);
    color: var(--c-text);
  }
  .rank-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: var(--sp-2) 0 var(--sp-1);
  }
  .btn.small {
    font-size: var(--fs-xs);
    min-height: 26px;
    padding: 2px 6px;
  }
  .search-results {
    border: 1px solid var(--c-border);
    border-radius: var(--radius-sm);
    background: var(--c-surface);
    max-height: 240px;
    overflow: auto;
  }
</style>
