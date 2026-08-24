<script lang="ts">
  import { ui } from '../../lib/state.svelte';
  import type { ViewResult } from '../../lib/view';
  import { legendEntries, NODATA_COLOR, ZERO_COLOR } from '../../lib/colors';
  import { fmtValue, fmtCompact, fmtRate, fmtInt } from '../../lib/format';
  import { displayName } from '../../lib/data';
  import { useT, type Locale, type MessageKey } from '../../i18n/ui';

  let {
    locale,
    view,
    worldPop = null,
    metricCaveats = [],
  }: {
    locale: Locale;
    view: ViewResult;
    /** WPP world population for the current year — powers the "1 in n people" line (anti-numbing). */
    worldPop?: number | null;
    /** metric-level caveats (metrics.json), locale-resolved by the caller (#audit-2) */
    metricCaveats?: string[];
  } = $props();
  const tr = $derived(useT(locale));
  const entries = $derived(legendEntries(view.breaks));
  let showUnmappable = $state(false);
  let showCaveats = $state(false);
  const fmtTick = (v: number) => (ui.n === 'per1k' ? fmtRate(v, locale) : fmtCompact(v, locale));
  /**
   * Evidence-class chip (#audit F3): IDPs are IDMC estimates, total_poc is a client-side sum;
   * only genuinely reported annual figures get the "Reported" chip.
   */
  const evidenceChip = $derived(
    ui.m === 'idps'
      ? tr('source.idmcEstimate')
      : ui.m === 'total_poc'
        ? tr('source.derived')
        : tr('source.confirmed'),
  );
  /** One plain sentence saying what is on screen (#audit F11). */
  const sentence = $derived(
    tr(ui.v === 'asylum' ? 'legend.sentence.asylum' : 'legend.sentence.origin', {
      metric: tr(`metric.${ui.m}` as MessageKey),
      year: ui.y,
    }),
  );
  /** "≈ 1 in every n people on Earth" (#audit F4 — Slovic anti-numbing anchor). */
  const perCapitaLine = $derived.by(() => {
    if (view.total === null || !worldPop || worldPop <= 0 || view.total <= 0) return null;
    const n = Math.round(worldPop / view.total);
    return n >= 2 ? tr('legend.perCapita', { n: fmtInt(n, locale) }) : null;
  });
</script>

<div class="legend" role="group" aria-label={tr('legend.title')}>
  <div class="title">
    {sentence}
    {#if view.total !== null}<span class="chip" title={evidenceChip}>{evidenceChip}</span>{/if}
  </div>
  {#if entries.length}
    <div class="ramp" aria-hidden="true">
      {#each entries as e (e.color)}<span
          style="background:{e.color}"
          title={e.to === null ? `≥ ${fmtTick(e.from)}` : `${fmtTick(e.from)} – ${fmtTick(e.to)}`}
        ></span>{/each}
    </div>
    <div class="ticks" aria-hidden="true">
      <span>{fmtTick(entries[0]!.from)}</span>
      {#if entries[3]?.from !== undefined}<span>{fmtTick(entries[3]!.from)}</span>{/if}
      <span>{fmtTick(entries[entries.length - 1]!.from)}+</span>
    </div>
    <ul class="visually-hidden">
      {#each entries as e, i (i)}<li>
          {e.to === null ? `≥ ${fmtTick(e.from)}` : `${fmtTick(e.from)} – ${fmtTick(e.to)}`}
        </li>{/each}
    </ul>
    <div class="muted note">{tr('legend.breaksNote')}</div>
    {#if ui.n === 'per1k'}<div class="muted note">{tr('legend.per1kNote')}</div>{/if}
  {:else if !view.yearAvailable}
    <div class="muted">{tr('timeline.loadingHistory')}</div>
  {/if}
  <div class="swatches">
    <span><i class="sw" style="background:{ZERO_COLOR}"></i>{tr('legend.zero')}</span>
    <span title={tr('legend.nodata.help')}
      ><i class="sw" style="background:{NODATA_COLOR}"></i>{tr('legend.nodata')}</span
    >
  </div>
  {#if view.total !== null}
    <div class="total num">
      {tr('legend.total', { value: fmtValue(view.total, 'abs', locale) })}
      {#if perCapitaLine}<div class="muted">{perCapitaLine}</div>{/if}
    </div>
  {/if}
  {#if metricCaveats.length}
    <button
      class="caveat-toggle small"
      type="button"
      aria-expanded={showCaveats}
      onclick={() => (showCaveats = !showCaveats)}
    >
      ⓘ {tr('source.caveats')} ({metricCaveats.length})
    </button>
    {#if showCaveats}
      <ul class="caveat-list muted">
        {#each metricCaveats as cv, i (i)}<li>{cv}</li>{/each}
      </ul>
    {/if}
  {/if}
  {#if view.unmappable.length}
    <button
      class="chip unmappable"
      type="button"
      aria-expanded={showUnmappable}
      onclick={() => (showUnmappable = !showUnmappable)}
    >
      ◌ {tr('legend.unmappable', { n: view.unmappable.length })}
    </button>
    {#if showUnmappable}
      <ul class="unmappable-list">
        {#each view.unmappable as r (r.iso3)}
          <li>
            <span>{displayName(r.meta, locale)}</span><span class="num"
              >{fmtValue(r.abs, 'abs', locale, true)}</span
            >
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .note {
    margin-top: 2px;
    font-size: 10px;
    line-height: 1.4;
  }
  .total {
    margin-top: 6px;
    color: var(--c-text-2);
  }
  .caveat-toggle {
    margin-top: 6px;
    border: 0;
    background: none;
    color: var(--c-primary);
    padding: 0;
    font-size: var(--fs-xs);
    text-decoration: underline;
    cursor: pointer;
    display: block;
  }
  .caveat-list {
    margin: 4px 0 0;
    padding-left: 1rem;
    max-height: 140px;
    overflow: auto;
  }
  .unmappable {
    margin-top: 6px;
    cursor: pointer;
  }
  .unmappable-list {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    max-height: 160px;
    overflow: auto;
    font-size: var(--fs-xs);
  }
  .unmappable-list li {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-2);
    padding: 1px 0;
  }
</style>
