<script lang="ts">
  /** ★ Mandatory under every chart/number block: attribution + data_as_of + retrieved_at (+ caveats). */
  import type { SourceEntry } from '../../lib/types';
  import { fmtDateLong } from '../../lib/format';
  import { useT, type Locale } from '../../i18n/ui';
  import { sourceCaveats } from '../../lib/data';
  let {
    locale,
    source,
    sourceId,
    compact = false,
    extraCaveats = [] as string[],
  }: {
    locale: Locale;
    source: SourceEntry;
    sourceId: string;
    compact?: boolean;
    extraCaveats?: string[];
  } = $props();
  const tr = $derived(useT(locale));
  const caveats = $derived([...sourceCaveats(source, locale), ...extraCaveats]);
  let open = $state(false);
</script>

<p class="source-note small muted" data-source-id={sourceId}>
  {tr('source.note', {
    attribution: source.attribution,
    asOf: fmtDateLong(source.data_as_of, locale),
    retrieved: fmtDateLong(source.retrieved_at, locale),
  })}
  <a href={source.landing_page} rel="noopener" target="_blank">{source.publisher}</a> · {source
    .license.id}
  {#if source.status !== 'ok'}<span class="chip stale">{source.status}</span>{/if}
  {#if caveats.length && !compact}
    <button class="caveat-toggle" type="button" aria-expanded={open} onclick={() => (open = !open)}
      >{tr('source.caveats')} ({caveats.length})</button
    >
  {/if}
</p>
{#if open}
  <ul class="small muted caveats">
    {#each caveats as c, i (i)}<li>{c}</li>{/each}
  </ul>
{/if}

<style>
  .source-note {
    margin: var(--sp-2) 0 0;
    line-height: 1.4;
  }
  .caveat-toggle {
    border: 0;
    background: none;
    color: var(--c-primary);
    text-decoration: underline;
    padding: 0;
    font: inherit;
    cursor: pointer;
  }
  .caveats {
    margin: 2px 0 0;
    padding-left: 1rem;
  }
</style>
