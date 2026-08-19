<script lang="ts">
  import { ui } from '../../lib/state.svelte';
  import type { ViewResult } from '../../lib/view';
  import { legendEntries, NODATA_COLOR, ZERO_COLOR } from '../../lib/colors';
  import { fmtValue, fmtCompact, fmtRate } from '../../lib/format';
  import { displayName } from '../../lib/data';
  import { useT, type Locale, type MessageKey } from '../../i18n/ui';

  let { locale, view }: { locale: Locale; view: ViewResult } = $props();
  const tr = $derived(useT(locale));
  const entries = $derived(legendEntries(view.breaks));
  let showUnmappable = $state(false);
  const fmtTick = (v: number) => (ui.n === 'per1k' ? fmtRate(v, locale) : fmtCompact(v, locale));
</script>

<div class="legend" role="group" aria-label={tr('legend.title')}>
  <div class="title">{tr(`metric.${ui.m}` as MessageKey)} · {ui.y}</div>
  <div class="muted">
    {ui.v === 'asylum' ? tr('view.asylum') : tr('view.origin')}{ui.n === 'per1k'
      ? ` · ${tr('scale.per1k')}`
      : ''}
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
  {:else if !view.yearAvailable}
    <div class="muted">{tr('timeline.loadingHistory')}</div>
  {/if}
  <div class="swatches">
    <span><i class="sw" style="background:{ZERO_COLOR}"></i>{tr('legend.zero')}</span>
    <span><i class="sw" style="background:{NODATA_COLOR}"></i>{tr('legend.nodata')}</span>
  </div>
  {#if view.total !== null}
    <div class="total num">
      {tr('legend.total', { value: fmtValue(view.total, 'abs', locale) })}
    </div>
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
  .total {
    margin-top: 6px;
    color: var(--c-text-2);
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
