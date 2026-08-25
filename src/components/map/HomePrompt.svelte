<script lang="ts">
  /** Phase 4: "Where is your country?" — a one-time pill that opens the search.
   *  No geolocation, ever: the user clicks and types. Disappears once a country is
   *  selected or the pill is dismissed (localStorage). Shows only after the tour. */
  import { onMount } from 'svelte';
  import { ui, session } from '../../lib/state.svelte';
  import { useT, type Locale } from '../../i18n/ui';

  let { locale, onOpen }: { locale: Locale; onOpen: () => void } = $props();
  const tr = $derived(useT(locale));
  let show = $state(false);
  onMount(() => {
    show =
      localStorage.getItem('wtw.homeAsked') !== '1' &&
      localStorage.getItem('wtw.tourDone') === '1' &&
      !ui.c;
  });
  function done() {
    show = false;
    localStorage.setItem('wtw.homeAsked', '1');
  }
  function open() {
    done();
    onOpen();
  }
  // selecting any country by any means answers the question — retire the pill
  $effect(() => {
    if (show && ui.c) done();
  });
</script>

{#if show && !session.playing}
  <div class="home-prompt">
    <button class="btn primary pill" type="button" onclick={open}>🔍 {tr('home.q')}</button>
    <button class="btn icon ghost" type="button" onclick={done} aria-label={tr('common.close')}
      >✕</button
    >
  </div>
{/if}

<style>
  .home-prompt {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    bottom: 118px;
    display: flex;
    align-items: center;
    gap: 4px;
    z-index: 24;
  }
  .pill {
    border-radius: 999px;
    box-shadow: var(--shadow-2);
    white-space: nowrap;
  }
  :global(.map-page.presentation) .home-prompt {
    display: none !important;
  }
</style>
