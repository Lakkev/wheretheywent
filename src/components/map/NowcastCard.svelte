<script lang="ts">
  /** "Latest estimate" card — UNHCR nowcasting, clearly labelled as an estimate (D11). */
  import { data, ui, raw, session } from '../../lib/state.svelte';
  import { fmtCompact, fmtMonth } from '../../lib/format';
  import { displayName } from '../../lib/data';
  import { useT, type Locale } from '../../i18n/ui';
  let { locale }: { locale: Locale } = $props();
  const tr = $derived(useT(locale));
  let open = $state(false);
  const nc = $derived(data.nowcast);
  const row = $derived(nc && ui.c ? nc.rows.find((r) => r.iso3 === ui.c) : null);
  const src = $derived(data.sources?.['unhcr_nowcasting']);
</script>

<!-- The first-visit tour gets the reader's attention to itself; standing cards return after it. -->
{#if nc && !session.tourOpen}
  <div class="nowcast-card" role="complementary" aria-label={tr('map.nowcast.title')}>
    <button class="head" type="button" aria-expanded={open} onclick={() => (open = !open)}>
      <span class="chip estimate">{tr('source.estimate')}</span>
      <strong>{tr('map.nowcast.title')}</strong>
      · {fmtMonth(nc.period, locale)}
    </button>
    {#if open}
      <p class="small muted">{tr('map.nowcast.body', { month: fmtMonth(nc.period, locale) })}</p>
      <table class="small">
        <tbody>
          <tr
            ><td>{tr('common.global')} · {tr('metric.refugees')}</td><td class="num"
              >{fmtCompact(nc.total_refugees, locale)}</td
            ></tr
          >
          <tr
            ><td>{tr('common.global')} · {tr('metric.asylum_seekers')}</td><td class="num"
              >{fmtCompact(nc.total_asylum_seekers, locale)}</td
            ></tr
          >
          {#if row}
            <tr
              ><td
                >{displayName(raw.countryIndex.get(row.iso3), locale, row.iso3)} · {tr(
                  'metric.refugees',
                )}</td
              ><td class="num">{fmtCompact(row.refugees, locale)}</td></tr
            >
            <tr
              ><td
                >{displayName(raw.countryIndex.get(row.iso3), locale, row.iso3)} · {tr(
                  'metric.asylum_seekers',
                )}</td
              ><td class="num">{fmtCompact(row.asylum_seekers, locale)}</td></tr
            >
            <tr><td colspan="2" class="muted">{row.source}</td></tr>
          {/if}
        </tbody>
      </table>
      {#if src}<p class="small muted">
          {src.attribution} · {tr('cite.retrieved')}
          {src.retrieved_at.slice(0, 10)}
        </p>{/if}
    {/if}
  </div>
{/if}

<style>
  .head {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    font-size: var(--fs-xs);
    text-align: left;
    cursor: pointer;
    color: inherit;
  }
  table td {
    padding: 2px 4px;
  }
</style>
