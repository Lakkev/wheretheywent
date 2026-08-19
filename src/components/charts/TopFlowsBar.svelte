<script lang="ts">
  /** Top partner countries (origins of people hosted here / hosts of people from here) for a year. */
  import type { CountryFile, ViewId } from '../../lib/types';
  import { loadPlot, PLOT_STYLE, svgToString } from './plot-helpers';
  import { raw } from '../../lib/state.svelte';
  import { displayName } from '../../lib/data';
  import { useT, type Locale } from '../../i18n/ui';
  import { fmtInt } from '../../lib/format';

  let {
    file,
    locale,
    year,
    view,
    height = 240,
    countryIndex = raw.countryIndex,
  }: {
    file: CountryFile;
    locale: Locale;
    year: number;
    view: ViewId;
    height?: number;
    countryIndex?: Map<string, import('../../lib/types').CountryMeta>;
  } = $props();
  const tr = $derived(useT(locale));
  let el: HTMLDivElement;
  let svgEl: SVGSVGElement | null = null;
  const table = $derived(view === 'asylum' ? file.top_origins : file.top_hosts);
  const years = $derived(
    Object.keys(table)
      .map(Number)
      .sort((a, b) => a - b),
  );
  const useYear = $derived(
    table[String(year)] ? year : (years.filter((y) => y <= year).pop() ?? years[0]),
  );
  const rows = $derived(useYear !== undefined ? (table[String(useYear)] ?? []) : []);
  const nameOf = (p: string) => displayName(countryIndex.get(p), locale, p);

  $effect(() => {
    const r = rows;
    const h = height;
    let cancelled = false;
    loadPlot().then((Plot) => {
      if (cancelled || !el) return;
      el.replaceChildren();
      if (!r.length) return;
      const data = r.flatMap((x) => [
        { partner: nameOf(x.p), kind: tr('metric.refugees'), value: x.refugees ?? 0 },
        { partner: nameOf(x.p), kind: tr('metric.asylum_seekers'), value: x.asylum_seekers ?? 0 },
      ]);
      const plot = Plot.plot({
        height: h,
        width: el.clientWidth || 340,
        marginLeft: 110,
        style: PLOT_STYLE,
        x: { label: null, tickFormat: 's' },
        y: { label: null, domain: r.map((x) => nameOf(x.p)) },
        color: {
          domain: [tr('metric.refugees'), tr('metric.asylum_seekers')],
          range: ['#2171b5', '#9ecae1'],
          legend: true,
        },
        marks: [
          Plot.barX(data, {
            x: 'value',
            y: 'partner',
            fill: 'kind',
            title: (d: { partner: string; kind: string; value: number }) =>
              `${d.partner} · ${d.kind}: ${fmtInt(d.value, locale)}`,
          }),
          Plot.ruleX([0]),
        ],
      }) as SVGSVGElement;
      svgEl = plot;
      el.append(plot);
    });
    return () => {
      cancelled = true;
    };
  });
  export function svg(): string | null {
    return svgEl ? svgToString(svgEl) : null;
  }
</script>

<figure class="chart">
  <p class="small muted">
    {view === 'asylum' ? tr('country.topOrigins') : tr('country.topHosts')}{useYear !== undefined &&
    useYear !== year
      ? ` (${useYear})`
      : ''}
  </p>
  {#if !rows.length}
    <p class="muted small">{tr('detail.noData')}</p>
  {:else}
    <div bind:this={el} class="plot" role="img" aria-label={tr('detail.tab.flows')}></div>
    <table class="visually-hidden">
      <thead
        ><tr
          ><th>{tr('common.country')}</th><th>{tr('metric.refugees')}</th><th
            >{tr('metric.asylum_seekers')}</th
          ></tr
        ></thead
      >
      <tbody
        >{#each rows as x (x.p)}<tr
            ><td>{nameOf(x.p)}</td><td>{fmtInt(x.refugees, locale)}</td><td
              >{fmtInt(x.asylum_seekers, locale)}</td
            ></tr
          >{/each}</tbody
      >
    </table>
  {/if}
</figure>

<style>
  .chart {
    margin: 0;
  }
  .plot {
    width: 100%;
  }
</style>
