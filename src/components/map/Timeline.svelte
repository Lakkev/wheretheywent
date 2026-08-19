<script lang="ts">
  import { ui, data, session, raw, setYear, announce } from '../../lib/state.svelte';
  import { useT, type Locale, type MessageKey } from '../../i18n/ui';
  import { fmtCompact } from '../../lib/format';
  import { prefersReducedMotion } from '../../lib/webgl';
  import { onDestroy } from 'svelte';

  let { locale, total }: { locale: Locale; total: number | null } = $props();
  const tr = $derived(useT(locale));
  const yearMin = $derived(data.yearMin);
  const yearMax = $derived(data.yearMax);
  const loadedMin = $derived.by(() => {
    void data.stockVersion;
    return raw.stock.years[0] ?? yearMax;
  });

  // sparkline of the global total for the current metric/view across loaded years
  const spark = $derived.by(() => {
    void data.stockVersion;
    const ys = raw.stock.years;
    const s = raw.stock.totalSeries(ui.v, ui.m);
    const vals = s.map((v) => v ?? 0);
    const max = Math.max(1, ...vals);
    const W = 600,
      H = 28;
    const pts = ys.map(
      (y, i) =>
        `${(((y - yearMin) / Math.max(1, yearMax - yearMin)) * W).toFixed(1)},${(H - (vals[i]! / max) * (H - 2)).toFixed(1)}`,
    );
    return { d: pts.length ? `M${pts.join(' L')}` : '', W, H };
  });

  let timer: ReturnType<typeof setInterval> | null = null;
  function play() {
    if (session.playing) return stop();
    if (prefersReducedMotion()) return;
    session.playing = true;
    if (ui.y >= yearMax) setYear(loadedMin);
    timer = setInterval(() => {
      if (ui.y >= yearMax) return stop();
      setYear(ui.y + 1);
    }, 700);
  }
  function stop() {
    session.playing = false;
    if (timer) clearInterval(timer);
    timer = null;
  }
  onDestroy(stop);
  export { play, stop };

  function onInput(e: Event) {
    const y = Number((e.currentTarget as HTMLInputElement).value);
    if (y < loadedMin && !data.historyLoaded) {
      // history not yet loaded: clamp and hint
      setYear(loadedMin);
      return;
    }
    setYear(y);
  }
  $effect(() => {
    const y = ui.y;
    const t = total;
    announce(
      tr('a11y.yearChanged', {
        year: y,
        metric: tr(`metric.${ui.m}` as MessageKey),
        view: ui.v === 'asylum' ? tr('view.asylum') : tr('view.origin'),
        total: fmtCompact(t, locale),
      }),
    );
  });
</script>

<div class="timeline" role="group" aria-label={tr('timeline.year')}>
  <div class="year num" aria-live="off">{ui.y}</div>
  <div>
    <svg
      class="spark"
      viewBox="0 0 {spark.W} {spark.H}"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {#if spark.d}<path
          d={spark.d}
          fill="none"
          stroke="var(--ramp-blues-5)"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
        />{/if}
      <line
        x1={((ui.y - yearMin) / Math.max(1, yearMax - yearMin)) * spark.W}
        x2={((ui.y - yearMin) / Math.max(1, yearMax - yearMin)) * spark.W}
        y1="0"
        y2={spark.H}
        stroke="var(--c-primary)"
        stroke-width="1.5"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <input
      type="range"
      min={yearMin}
      max={yearMax}
      step="1"
      value={ui.y}
      oninput={onInput}
      aria-label={tr('timeline.year')}
      aria-valuetext={String(ui.y)}
      list="year-ticks"
    />
    <div class="ticks" aria-hidden="true">
      <span>{yearMin}</span>
      {#if !data.historyLoaded}<span class="muted">{tr('timeline.loadingHistory')}</span>{/if}
      <span>{yearMax}</span>
    </div>
  </div>
  <div class="controls">
    <button
      class="btn icon"
      type="button"
      onclick={() => setYear(ui.y - 1)}
      aria-label="Previous year"
      disabled={ui.y <= loadedMin}>‹</button
    >
    <button class="btn" type="button" onclick={play} aria-pressed={session.playing}
      >{session.playing ? '❚❚ ' + tr('timeline.pause') : '▶ ' + tr('timeline.play')}</button
    >
    <button
      class="btn icon"
      type="button"
      onclick={() => setYear(ui.y + 1)}
      aria-label="Next year"
      disabled={ui.y >= yearMax}>›</button
    >
  </div>
</div>

<style>
  .controls {
    display: flex;
    gap: 4px;
  }
</style>
