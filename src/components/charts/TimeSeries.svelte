<script lang="ts">
  /** Line chart: hosting vs originating over time for one metric. Gaps at null (not zero). Output SVG. */
  import type { CountryFile, AnyMetricId } from '../../lib/types';
  import {
    loadPlot,
    countrySeries,
    segments,
    SERIES_COLORS,
    PLOT_STYLE,
    svgToString,
  } from './plot-helpers';
  import { useT, type Locale, type MessageKey } from '../../i18n/ui';
  import { fmtInt } from '../../lib/format';

  let {
    file,
    locale,
    metric,
    year,
    height = 220,
    showLegend = true,
  }: {
    file: CountryFile;
    locale: Locale;
    metric: AnyMetricId;
    year?: number;
    height?: number;
    showLegend?: boolean;
  } = $props();
  const tr = $derived(useT(locale));
  let el: HTMLDivElement;
  let svgEl: SVGSVGElement | null = null;
  let hasData = $state(true);
  /** Definitional breakpoints (see /methodology/definitions) — annotated on the chart so a
   *  reader never mistakes a structural blank for "the number was zero before". */
  const BREAKS: Partial<Record<AnyMetricId, number>> = { stateless: 2004, idps: 2009, oip: 2018 };

  $effect(() => {
    const pts = countrySeries(file, metric);
    const y = year;
    const h = height;
    let cancelled = false;
    loadPlot().then((Plot) => {
      if (cancelled || !el) return;
      const nonNull = pts.filter((p) => p.value !== null);
      hasData = nonNull.length > 0;
      el.replaceChildren();
      if (!hasData) return;
      const marks: unknown[] = [Plot.ruleY([0])];
      for (const view of ['asylum', 'origin'] as const) {
        for (const seg of segments(pts.filter((p) => p.view === view))) {
          marks.push(
            Plot.line(seg, {
              x: 'year',
              y: 'value',
              stroke: SERIES_COLORS[view],
              strokeWidth: view === 'asylum' ? 2 : 1.5,
              strokeDasharray: view === 'origin' ? '4,3' : undefined,
            }),
          );
        }
      }
      marks.push(
        Plot.dot(nonNull, {
          x: 'year',
          y: 'value',
          r: 1.5,
          fill: (d: { view: 'asylum' | 'origin' }) => SERIES_COLORS[d.view],
        }),
      );
      if (y) marks.push(Plot.ruleX([y], { stroke: '#0b3a6e', strokeOpacity: 0.5 }));
      const bk = BREAKS[metric];
      if (bk && pts.some((p) => p.year < bk)) {
        marks.push(Plot.ruleX([bk], { stroke: '#8a94a6', strokeDasharray: '2,3' }));
        marks.push(
          Plot.text([{ year: bk }], {
            x: 'year',
            frameAnchor: 'top',
            dy: 8,
            dx: 4,
            textAnchor: 'start',
            fill: '#57708c',
            fontSize: 10,
            text: () => tr('chart.seriesBegins', { year: bk }),
          }),
        );
      }
      marks.push(
        Plot.tip(
          nonNull,
          Plot.pointerX({
            x: 'year',
            y: 'value',
            title: (d: { year: number; value: number; view: string }) =>
              `${d.year} · ${d.view === 'asylum' ? tr('detail.hosting') : tr('detail.origin')}\n${fmtInt(d.value, locale)}`,
          }),
        ),
      );
      const plot = Plot.plot({
        height: h,
        width: el.clientWidth || 340,
        marginLeft: 48,
        style: PLOT_STYLE,
        x: { label: tr('common.year'), tickFormat: (d: number) => String(d), ticks: 6 },
        y: { label: tr(`metric.${metric}` as MessageKey), grid: true, tickFormat: 's' },
        marks,
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
  <div bind:this={el} class="plot" aria-label={tr('detail.tab.series')} role="img"></div>
  {#if !hasData}<p class="muted small">{tr('detail.noData')}</p>{/if}
  {#if showLegend && hasData}
    <figcaption class="small muted legend-row">
      <span><i class="sw" style="background:{SERIES_COLORS.asylum}"></i>{tr('detail.hosting')}</span
      >
      <span
        ><i class="sw dashed" style="border-color:{SERIES_COLORS.origin}"></i>{tr(
          'detail.origin',
        )}</span
      >
    </figcaption>
  {/if}
</figure>

<style>
  .chart {
    margin: 0;
  }
  .plot {
    width: 100%;
    min-height: 40px;
  }
  .legend-row {
    display: flex;
    gap: var(--sp-3);
    margin-top: 4px;
  }
  .sw {
    display: inline-block;
    width: 14px;
    height: 3px;
    vertical-align: middle;
    margin-right: 4px;
  }
  .sw.dashed {
    height: 0;
    border-top: 2px dashed;
  }
</style>
