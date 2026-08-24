<script lang="ts">
  /** Table mode when WebGL2 is unavailable (§8.4): DataTable + time series + downloads. */
  import type { ViewResult } from '../../lib/view';
  import DataTable from './DataTable.svelte';
  import SourceNote from '../data/SourceNote.svelte';
  import { data, ui } from '../../lib/state.svelte';
  import { useT, type Locale } from '../../i18n/ui';
  let { locale, view, ondownload }: { locale: Locale; view: ViewResult; ondownload: () => void } =
    $props();
  const tr = $derived(useT(locale));
  const srcId = $derived(ui.m === 'idps' ? 'unhcr_idmc' : 'unhcr_population');
  const src = $derived(data.sources?.[srcId]);
</script>

<div class="nowebgl">
  <div class="callout">
    <strong>{tr('map.noWebGL.title')}</strong> — {tr('map.noWebGL.body')}
  </div>
  <DataTable {locale} {view} embedded {ondownload} />
  {#if src}<SourceNote {locale} source={src} sourceId={srcId} />{/if}
</div>

<style>
  .nowebgl {
    position: absolute;
    inset: var(--topbar-h) 0 var(--timeline-h) 0;
    overflow: auto;
    background: var(--c-bg);
    padding: var(--sp-3);
    z-index: 5;
  }
</style>
