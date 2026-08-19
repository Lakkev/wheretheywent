<script lang="ts">
  import { session } from '../../lib/state.svelte';
  import { useT, type Locale } from '../../i18n/ui';
  let { locale }: { locale: Locale } = $props();
  const tr = $derived(useT(locale));
</script>

<div class="attribution">
  <span>{tr('map.attribution.data')}</span> ·
  <button
    type="button"
    class="linkish"
    onclick={() => (session.dialog = 'boundaries')}
    title="Boundaries disclaimer">{tr('map.attribution.boundaries')} ⓘ</button
  >
  {#if session.basemapOk}
    · <span>{tr('map.attribution.basemap')}</span>{/if}
</div>

<style>
  .linkish {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    color: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
