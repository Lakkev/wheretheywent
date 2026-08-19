<script lang="ts">
  /** Read-only text block with a Copy button (clipboard API with fallback). */
  import { useT, type Locale } from '../../i18n/ui';
  let {
    locale,
    label,
    value,
    rows = 3,
    mono = true,
  }: { locale: Locale; label: string; value: string; rows?: number; mono?: boolean } = $props();
  const tr = $derived(useT(locale));
  let copied = $state(false);
  let ta: HTMLTextAreaElement;
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      ta.select();
      document.execCommand('copy');
    }
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<div class="copy-field">
  <div class="row">
    <span class="label">{label}</span>
    <button class="btn small" type="button" onclick={copy} aria-live="polite"
      >{copied ? '✓ ' + tr('cite.copied') : tr('cite.copy')}</button
    >
  </div>
  <textarea
    bind:this={ta}
    readonly
    {rows}
    class:mono
    aria-label={label}
    onfocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()}>{value}</textarea
  >
</div>

<style>
  .copy-field {
    margin-bottom: var(--sp-3);
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .label {
    font-size: var(--fs-sm);
    font-weight: 600;
  }
  textarea {
    width: 100%;
    resize: vertical;
    font-size: var(--fs-sm);
    padding: var(--sp-2);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-sm);
    background: var(--c-surface-2);
    font-family: inherit;
  }
  textarea.mono {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
  }
  .btn.small {
    min-height: 26px;
    padding: 2px 8px;
    font-size: var(--fs-xs);
  }
</style>
