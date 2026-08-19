<script lang="ts">
  import { session } from '../../lib/state.svelte';
  import { useT, localizePath, type Locale } from '../../i18n/ui';
  let { locale }: { locale: Locale } = $props();
  const tr = $derived(useT(locale));
</script>

<div class="attribution">
  <span>{tr('map.attribution.data')}</span> ·
  <a href={localizePath('/about/boundaries', locale)} title="Boundaries disclaimer"
    >{tr('map.attribution.boundaries')} ⓘ</a
  >
  {#if session.basemapOk}
    · <span>{tr('map.attribution.basemap')}</span>{/if}
</div>
