<script lang="ts">
  // Batch ① stub — replaced by the full island in batch ③.
  import type { Locale } from '../../i18n/ui';
  let {
    locale,
    styleUrl,
    yearMin,
    yearMax,
    snapshotId,
  }: {
    locale: Locale;
    styleUrl: string;
    yearMin: number;
    yearMax: number;
    snapshotId: string | null;
  } = $props();
  void locale;
  void styleUrl;
  void yearMin;
  void yearMax;
  void snapshotId;
</script>
