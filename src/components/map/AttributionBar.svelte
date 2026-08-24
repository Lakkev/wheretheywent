<script lang="ts">
  import { session, data } from '../../lib/state.svelte';
  import { useT, type Locale } from '../../i18n/ui';
  import { fmtDateIso } from '../../lib/format';
  let { locale }: { locale: Locale } = $props();
  const tr = $derived(useT(locale));
  // §10: the choropleth is a chart — it must carry data_as_of / retrieved_at / licence, always.
  const pop = $derived(data.sources?.['unhcr_population']);
</script>

<div class="attribution">
  <span
    >{tr('map.attribution.data')}{#if pop}
      ({tr('cite.dataAsOf')}
      {fmtDateIso(pop.data_as_of)} · {tr('cite.retrieved')}
      {fmtDateIso(pop.retrieved_at)} · {pop.license.id}){/if}</span
  >
  ·
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
