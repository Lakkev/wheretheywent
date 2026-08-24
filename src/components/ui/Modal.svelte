<script lang="ts">
  /** Accessible modal: role=dialog, focus trap, Esc closes, returns focus. */
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  let {
    title,
    onclose,
    children,
    wide = false,
    closeLabel = 'Close',
  }: {
    title: string;
    onclose: () => void;
    children: Snippet;
    wide?: boolean;
    closeLabel?: string;
  } = $props();
  let box: HTMLDivElement;
  let prev: Element | null = null;
  const FOCUSABLE =
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  onMount(() => {
    prev = document.activeElement;
    const first = box.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? box).focus();
    return () => (prev as HTMLElement | null)?.focus?.();
  });
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
      return;
    }
    if (e.key === 'Tab') {
      const els = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!els.length) return;
      const first = els[0]!,
        last = els[els.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="modal-backdrop"
  onclick={(e) => e.target === e.currentTarget && onclose()}
  onkeydown={onKey}
>
  <div
    class="modal"
    class:wide
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
    bind:this={box}
  >
    <div class="modal-head">
      <h2 id="modal-title">{title}</h2>
      <button class="btn ghost icon" type="button" aria-label={closeLabel} onclick={onclose}>×</button>
    </div>
    {@render children()}
  </div>
</div>

<style>
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    margin-bottom: var(--sp-3);
  }
  .modal.wide {
    max-width: 900px;
  }
</style>
