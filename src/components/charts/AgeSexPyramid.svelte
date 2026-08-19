<script lang="ts">
  /** Age × sex pyramid (country of asylum dimension, 2010+). */
  import type { CountryFile } from '../../lib/types';
  import { loadPlot, PLOT_STYLE, svgToString } from './plot-helpers';
  import { useT, type Locale } from '../../i18n/ui';
  import { fmtInt, fmtPct } from '../../lib/format';

  let {
    file,
    locale,
    year,
    height = 200,
  }: { file: CountryFile; locale: Locale; year: number; height?: number } = $props();
  const tr = $derived(useT(locale));
  const AGES = ['0–4', '5–11', '12–17', '18–59', '60+', 'other'];
  let el: HTMLDivElement;
  let svgEl: SVGSVGElement | null = null;
  // nearest available year ≤ requested, else nearest
  const row = $derived.by(() => {
    const rows = file.demographics;
    if (!rows.length) return null;
    const exact = rows.find((r) => r.year === year);
    if (exact) return exact;
    const before = rows.filter((r) => r.year <= year).sort((a, b) => b.year - a.year)[0];
    return before ?? rows[0]!;
  });
  const breakdownAvailable = $derived(
    row ? row.f.slice(0, 6).some((v) => v) || row.m.slice(0, 6).some((v) => v) : false,
  );
  const fTotal = $derived(row?.f[6] ?? null);
  const mTotal = $derived(row?.m[6] ?? null);

  $effect(() => {
    const r = row;
    const h = height;
    let cancelled = false;
    loadPlot().then((Plot) => {
      if (cancelled || !el) return;
      el.replaceChildren();
      if (!r || !breakdownAvailable) return;
      const data = AGES.flatMap((age, i) => [
        { age, sex: 'F', value: -(r.f[i] ?? 0), abs: r.f[i] ?? 0 },
        { age, sex: 'M', value: r.m[i] ?? 0, abs: r.m[i] ?? 0 },
      ]);
      const plot = Plot.plot({
        height: h,
        width: el.clientWidth || 340,
        marginLeft: 44,
        style: PLOT_STYLE,
        x: {
          label: null,
          tickFormat: (d: number) =>
            Math.abs(d) >= 1000 ? `${Math.round(Math.abs(d) / 1000)}k` : String(Math.abs(d)),
        },
        y: { domain: AGES, label: null },
        color: { domain: ['F', 'M'], range: ['#9ecae1', '#2171b5'], legend: true },
        marks: [
          Plot.barX(data, {
            x: 'value',
            y: 'age',
            fill: 'sex',
            title: (d: { sex: string; age: string; abs: number }) =>
              `${d.sex === 'F' ? 'Female' : 'Male'} ${d.age}: ${fmtInt(d.abs, locale)}`,
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
  {#if !row}
    <p class="muted small">{tr('detail.noData')}</p>
  {:else}
    {#if row.year !== year}<p class="muted small">
        {tr('country.demographics', { year: row.year })}
      </p>{/if}
    {#if breakdownAvailable}
      <div bind:this={el} class="plot" role="img" aria-label={tr('detail.tab.demographics')}></div>
    {:else}
      <p class="muted small">{tr('detail.noData')}</p>
    {/if}
    <figcaption class="small muted">
      F {fmtInt(fTotal, locale)} ({fmtPct(row.total ? (fTotal ?? 0) / row.total : null, locale)}) ·
      M {fmtInt(mTotal, locale)} · {tr('common.all')}
      {fmtInt(row.total, locale)}
    </figcaption>
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
