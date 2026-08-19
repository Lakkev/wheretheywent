<script lang="ts">
  import { session } from '../../lib/state.svelte';
</script>

<div class="toasts" aria-live="polite" aria-atomic="false">
  {#each session.toasts as t (t.id)}
    <div class="toast" role="status">{t.text}</div>
  {/each}
</div>
