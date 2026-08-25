<script lang="ts">
  /** First-visit 4-step tour — teaches the timeline, the two views, click and hover.
   *  Shows once (localStorage), fully dismissible, no spotlight theatrics. */
  import { onMount } from 'svelte';
  import { data } from '../../lib/state.svelte';
  import { useT, type Locale, type MessageKey } from '../../i18n/ui';

  let { locale }: { locale: Locale } = $props();
  const tr = $derived(useT(locale));
  let step = $state(0);
  let show = $state(false);
  onMount(() => {
    show = localStorage.getItem('wtw.tourDone') !== '1';
  });
  function finish() {
    show = false;
    localStorage.setItem('wtw.tourDone', '1');
  }
  const STEPS: MessageKey[] = ['tour.s1', 'tour.s2', 'tour.s3', 'tour.s4'];
</script>

{#if show}
  <!-- non-modal, no focus trap — complementary landmark, not a dialog (kept out of getByRole('dialog')) -->
  <aside class="tour" aria-label={tr('tour.title')}>
    <div class="head">
      <strong>{tr('tour.title')}</strong>
      <span class="muted">{step + 1}/{STEPS.length}</span>
    </div>
    <p>{tr(STEPS[step]!, { year: data.yearMax })}</p>
    <div class="row">
      <button class="btn ghost small-btn" type="button" onclick={finish}>{tr('tour.skip')}</button>
      <span class="spacer"></span>
      {#if step < STEPS.length - 1}
        <button class="btn primary small-btn" type="button" onclick={() => (step += 1)}
          >{tr('insight.next')}</button
        >
      {:else}
        <button class="btn primary small-btn" type="button" onclick={finish}
          >{tr('tour.done')}</button
        >
      {/if}
    </div>
  </aside>
{/if}

<style>
  .tour {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    bottom: 118px;
    width: min(360px, calc(100vw - 24px));
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-2);
    padding: var(--sp-3);
    font-size: var(--fs-sm);
    z-index: 25;
  }
  .head,
  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .tour p {
    margin: 6px 0 10px;
    line-height: 1.55;
  }
  :global(.map-page.presentation) .tour {
    display: none !important;
  }
</style>
