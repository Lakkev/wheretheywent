<script lang="ts">
  /** "Did you know?" — rotating, mechanically-computed facts from insights.json.
   *  Every fact deep-links to the reproducible view that proves it. */
  import { onMount } from 'svelte';
  import { raw } from '../../lib/state.svelte';
  import { displayName } from '../../lib/data';
  import { fmtInt, fmtPct } from '../../lib/format';
  import { useT, localizePath, type Locale } from '../../i18n/ui';
  import type { InsightsFile } from '../../lib/types';

  let { locale }: { locale: Locale } = $props();
  const tr = $derived(useT(locale));
  let ins = $state<InsightsFile | null>(null);
  let idx = $state(0);
  let off = $state(true);

  onMount(() => {
    off = localStorage.getItem('wtw.insightsOff') === '1';
    if (!off)
      raw.client
        .insights()
        .then((i) => (ins = i))
        .catch(() => {});
  });
  function dismiss() {
    off = true;
    localStorage.setItem('wtw.insightsOff', '1');
  }
  const name = (iso3: string) => displayName(raw.countryIndex.get(iso3), locale, iso3);
  const facts = $derived.by(() => {
    if (!ins) return [] as { text: string; href?: string }[];
    const g = ins.global;
    const y = ins.year;
    const out: { text: string; href?: string }[] = [];
    const link = (q: string) => `${localizePath('/', locale)}?${q}`;
    if (g.one_in_n) out.push({ text: tr('insight.oneInN', { n: fmtInt(g.one_in_n, locale) }) });
    if (g.top_hosts[0])
      out.push({
        text: tr('insight.topHost', {
          name: name(g.top_hosts[0].iso3),
          value: fmtInt(g.top_hosts[0].value, locale),
        }),
        href: link(`y=${y}&c=${g.top_hosts[0].iso3}`),
      });
    if (g.top5_host_share)
      out.push({ text: tr('insight.top5Share', { pct: fmtPct(g.top5_host_share, locale) }) });
    if (g.record_host_jump)
      out.push({
        text: tr('insight.recordJump', {
          name: name(g.record_host_jump.iso3),
          year: g.record_host_jump.year,
          delta: fmtInt(g.record_host_jump.delta, locale),
        }),
        href: link(`y=${g.record_host_jump.year}&c=${g.record_host_jump.iso3}`),
      });
    if (g.top_origins[0])
      out.push({
        text: tr('insight.topOrigin', {
          name: name(g.top_origins[0].iso3),
          value: fmtInt(g.top_origins[0].value, locale),
        }),
        href: link(`y=${y}&v=origin&c=${g.top_origins[0].iso3}`),
      });
    return out;
  });
  const fact = $derived(facts.length ? facts[idx % facts.length]! : null);
</script>

{#if !off && fact}
  <aside class="insight" role="complementary" aria-label={tr('insight.title')}>
    <div class="head">
      <strong>{tr('insight.title')}</strong>
      <span class="spacer"></span>
      <button class="btn ghost icon" type="button" aria-label={tr('common.close')} onclick={dismiss}
        >×</button
      >
    </div>
    <p>{fact.text}</p>
    <div class="row small">
      {#if fact.href}<a href={fact.href}>{tr('insight.see')}</a>{/if}
      <a href={localizePath('/insights', locale)}>{tr('insights.more')}</a>
      <span class="spacer"></span>
      <button class="btn ghost" type="button" onclick={() => (idx = idx + 1)}
        >{tr('insight.next')}</button
      >
    </div>
  </aside>
{/if}

<style>
  .insight {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: var(--overlay-gap);
    max-width: 380px;
    font-size: var(--fs-xs);
    background: color-mix(in srgb, var(--c-surface) 94%, transparent);
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-1);
    padding: var(--sp-2) var(--sp-3);
    z-index: 5;
  }
  .head,
  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .insight p {
    margin: 4px 0;
    line-height: 1.5;
  }
  :global(.map-page.presentation) .insight {
    display: none !important;
  }
  @media (max-width: 900px) {
    .insight {
      display: none; /* small screens: the map itself is the priority */
    }
  }
</style>
