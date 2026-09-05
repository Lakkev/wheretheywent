<script lang="ts" generics="T extends { iso3: string }">
  /**
   * Country search box, shared by the map's filter rail and the compare page.
   *
   * Both used to be a text input with a `role="listbox"` beside it, every option carrying
   * `tabindex="0"` and handling Enter only. That has three problems for anyone not using a mouse:
   * arrow keys do nothing, so the list is unreachable from the input; each option becomes its own
   * tab stop, so Tab walks through twelve results instead of leaving the widget; and nothing tells
   * a screen reader that the input owns the list or which option is current. An automated axe scan
   * does not catch any of it — the roles are present and correct, it is the interaction model that
   * is missing.
   *
   * This implements the ARIA 1.2 combobox pattern: the input is the combobox, keeps focus at all
   * times, and points at the active option with aria-activedescendant. Up/Down (with wrap), Home,
   * End, Enter, Escape and Tab all behave as a keyboard user expects.
   */
  import type { Snippet } from 'svelte';

  let {
    items,
    query = $bindable(''),
    inputEl = $bindable(),
    id,
    label,
    labelHidden = false,
    listClass = 'ranklist search-results',
    placeholder,
    selectedKey = null,
    onpick,
    onhover,
    option,
  }: {
    items: T[];
    query?: string;
    inputEl?: HTMLInputElement;
    /** Unique per instance — two comboboxes can be on the same page. */
    id: string;
    label: string;
    /** Some call sites carry the label in the placeholder; the text still has to exist for AT. */
    labelHidden?: boolean;
    listClass?: string;
    placeholder?: string;
    /** iso3 of the country currently shown elsewhere, for aria-selected. */
    selectedKey?: string | null;
    onpick: (iso3: string) => void;
    onhover?: (iso3: string) => void;
    option: Snippet<[T]>;
  } = $props();

  let active = $state(-1);
  let listEl = $state<HTMLUListElement | undefined>();
  const open = $derived(items.length > 0);
  const optionId = (i: number) => `${id}-opt-${i}`;

  // A new result set invalidates the old highlight: keeping index 3 while the list changed under
  // it would announce, and act on, a country the reader never saw.
  $effect(() => {
    void items;
    active = -1;
  });

  function scrollActiveIntoView() {
    queueMicrotask(() => {
      if (active < 0) return;
      listEl?.querySelector(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: 'nearest' });
    });
  }

  function move(delta: number) {
    if (!open) return;
    const n = items.length;
    active = active < 0 ? (delta > 0 ? 0 : n - 1) : (active + delta + n) % n;
    scrollActiveIntoView();
  }

  function choose(i: number) {
    const item = items[i];
    if (!item) return;
    onpick(item.iso3);
    active = -1;
  }

  function onkeydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home':
        if (!open) return;
        e.preventDefault();
        active = 0;
        scrollActiveIntoView();
        break;
      case 'End':
        if (!open) return;
        e.preventDefault();
        active = items.length - 1;
        scrollActiveIntoView();
        break;
      case 'Enter':
        if (!open) return;
        e.preventDefault();
        // Enter with nothing highlighted takes the first result, which is what typing a country
        // name and pressing Enter has always meant here.
        choose(active < 0 ? 0 : active);
        break;
      case 'Escape':
        // First Escape drops the highlight, a second clears the query. Escape is also the map's
        // presentation-mode key, so it must not travel further while this widget is in use.
        if (active >= 0) {
          e.preventDefault();
          e.stopPropagation();
          active = -1;
        } else if (query) {
          e.preventDefault();
          e.stopPropagation();
          query = '';
        }
        break;
      case 'Tab':
        active = -1;
        break;
    }
  }
</script>

<label>
  <span class={labelHidden ? 'visually-hidden' : undefined}>{label}</span>
  <input
    type="search"
    bind:this={inputEl}
    bind:value={query}
    {placeholder}
    autocomplete="off"
    role="combobox"
    aria-expanded={open}
    aria-controls={`${id}-listbox`}
    aria-autocomplete="list"
    aria-activedescendant={active >= 0 ? optionId(active) : undefined}
    {onkeydown}
  />
</label>
{#if open}
  <ul bind:this={listEl} class={listClass} id={`${id}-listbox`} role="listbox" aria-label={label}>
    {#each items as item, i (item.iso3)}
      <!-- No tabindex: focus stays on the input, as the combobox pattern requires. The click
           handler is the pointer path; the keyboard path is aria-activedescendant + Enter. -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_mouse_events_have_key_events -->
      <li
        id={optionId(i)}
        role="option"
        class:is-active={i === active}
        aria-selected={selectedKey === item.iso3}
        onclick={() => choose(i)}
        onmouseenter={() => onhover?.(item.iso3)}
      >
        {@render option(item)}
      </li>
    {/each}
  </ul>
{/if}

<style>
  /* The active option must be visible without focus, since focus never leaves the input. */
  li.is-active {
    background: var(--c-primary-soft);
    outline: 2px solid var(--c-primary);
    outline-offset: -2px;
  }
</style>
