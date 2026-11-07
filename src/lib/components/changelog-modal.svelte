<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		AlertDialog,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogTitle
	} from '$lib/components/ui/alert-dialog';
	import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '$lib/components/ui/drawer';
	import { ScrollArea } from '$lib/components/ui/scroll';
	import { Sparkles, TrendingUp, CheckCircle2, Trash2, MoreHorizontal, Check } from '@lucide/svelte';
	import {
		changelog,
		CATEGORY_LABELS,
		CATEGORY_ORDER,
		type ChangelogCategory,
		type ChangelogItem
	} from '$lib/config/changelog';

	/**
	 * What's New.
	 *
	 * Replaced a single flat bulleted list, every item the same size and colour regardless
	 * of whether it was a privilege-escalation fix or a cosmetic rename. New entries are
	 * grouped into optional sections (New Features / Improvements / Fixes / Removed / Other -
	 * a release shows only the ones it has) with a category icon and colour, and each item
	 * is a bold headline plus one short supporting line instead of one dense sentence that
	 * folded "what changed" and "how it broke internally" together.
	 *
	 * Version switching is a sidebar on desktop and a bottom sheet on mobile instead of
	 * Previous/Next paging - jump to any release in one step either way. Entries from before
	 * this format (2.6.0 and earlier) still carry a flat `string[]`; those render as an
	 * ungrouped list rather than being retroactively sorted into categories that did not
	 * exist when they were written.
	 */

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();
	let currentIndex = $state(0);
	let pickerOpen = $state(false);

	const currentEntry = $derived(changelog[currentIndex]);

	/** Type guard: only the new entries carry category metadata. */
	function isCategorized(items: ChangelogItem[] | string[]): items is ChangelogItem[] {
		return items.length === 0 || typeof items[0] !== 'string';
	}

	const categoryIcon: Record<ChangelogCategory, typeof Sparkles> = {
		feature: Sparkles,
		improvement: TrendingUp,
		fix: CheckCircle2,
		removed: Trash2,
		other: MoreHorizontal
	};

	/** Tailwind-safe literal classes per category - built from template strings here would
	 *  be purged, since Tailwind can only see classes that appear as whole strings in source. */
	const categoryClass: Record<ChangelogCategory, { icon: string; chip: string; label: string }> = {
		feature: {
			icon: 'text-primary',
			chip: 'bg-primary/10',
			label: 'text-primary'
		},
		improvement: {
			icon: 'text-(--stat-accent)',
			chip: 'bg-(--stat-accent)/15',
			label: 'text-(--stat-accent)'
		},
		fix: {
			icon: 'text-sky-600 dark:text-sky-400',
			chip: 'bg-sky-500/10',
			label: 'text-sky-600 dark:text-sky-400'
		},
		removed: {
			icon: 'text-destructive',
			chip: 'bg-destructive/10',
			label: 'text-destructive'
		},
		other: {
			icon: 'text-muted-foreground',
			chip: 'bg-muted',
			label: 'text-muted-foreground'
		}
	};

	/** Grouped in CATEGORY_ORDER, every group optional - a release with only fixes shows
	 *  only a Fixes section.
	 *
	 *  A plain record rather than a Map: this is a throwaway index inside a derivation, and
	 *  the lint rule steering reactive state towards SvelteMap does not distinguish the two. */
	let groups = $derived.by(() => {
		if (!isCategorized(currentEntry.items)) return [];
		const byCategory: Partial<Record<ChangelogCategory, ChangelogItem[]>> = {};
		for (const item of currentEntry.items) {
			(byCategory[item.category] ??= []).push(item);
		}
		return CATEGORY_ORDER.filter((c) => byCategory[c]).map((category) => ({
			category,
			items: byCategory[category]!
		}));
	});

	function selectVersion(index: number) {
		currentIndex = index;
		pickerOpen = false;
	}

	function handleClose() {
		open = false;
	}

	function handleDontShowAgain() {
		if (typeof window !== 'undefined') {
			localStorage.setItem('lastSeenVersion', currentEntry.version);
		}
		open = false;
	}

	function onOpenChange(isOpen: boolean) {
		if (isOpen) currentIndex = 0;
	}
</script>

{#snippet itemRow(item: ChangelogItem)}
	<div class="flex gap-2.5 py-2.5 first:pt-0 not-last:border-b not-last:border-border/50">
		<div class="min-w-0 flex-1">
			<div class="text-sm font-bold text-foreground">{item.title}</div>
			<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
		</div>
	</div>
{/snippet}

{#snippet entryBody()}
	{#if isCategorized(currentEntry.items)}
		<div class="flex flex-col gap-5">
			{#each groups as group (group.category)}
				{@const Icon = categoryIcon[group.category]}
				{@const cls = categoryClass[group.category]}
				<div>
					<div class="mb-2 flex items-center gap-1.5">
						<div class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md {cls.chip}">
							<Icon class="h-3 w-3 {cls.icon}" />
						</div>
						<span class="text-[11px] font-extrabold tracking-wide uppercase {cls.label}">
							{CATEGORY_LABELS[group.category]}
						</span>
						<span
							class="rounded-full bg-muted px-1.5 py-px text-[10.5px] font-semibold text-muted-foreground"
						>
							{group.items.length}
						</span>
					</div>
					<div>
						{#each group.items as item (item.title)}
							{@render itemRow(item)}
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<!-- Legacy flat entries (2.6.0 and earlier): the original dot-list, unchanged. -->
		<div class="space-y-3 sm:space-y-4">
			{#each currentEntry.items as item (item)}
				<div class="flex items-start gap-3 sm:gap-4">
					<div
						class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary ring-2 ring-primary/10 sm:h-2 sm:w-2"
					></div>
					<p class="text-xs leading-relaxed font-medium text-foreground/90 sm:text-base">
						{item}
					</p>
				</div>
			{/each}
		</div>
	{/if}
{/snippet}

<AlertDialog bind:open {onOpenChange}>
	<AlertDialogContent
		class="pointer-events-auto h-auto max-h-[85vh] min-h-[22rem] w-[95vw] max-w-2xl overflow-hidden rounded-xl p-0 shadow-2xl sm:max-w-3xl"
	>
		<div class="grid sm:grid-cols-[176px_1fr]">
			<!-- Desktop: a persistent release sidebar - jump to any version in one click,
			     replacing Previous/Next paging entirely.

			     max-h-[85vh] here too, not just on the content pane: without a bounded
			     height on THIS column the grid row stretches to this list's natural
			     height instead of the dialog's, and overflow-y-auto below has nothing to
			     actually overflow - the list just grows the dialog instead of scrolling. -->
			<div class="hidden max-h-[85vh] flex-col border-r bg-muted/40 py-3.5 sm:flex">
				<div class="px-3.5 pb-2.5 text-[10.5px] font-bold tracking-wide text-muted-foreground uppercase">
					Releases
				</div>
				<ScrollArea className="min-h-0 flex-1">
					<div class="space-y-0.5 px-2 pb-2">
						{#each changelog as entry, i (entry.version)}
							{@const selected = i === currentIndex}
							<!-- A background-shade difference against an already-pale bg-muted/40
							     sidebar read as almost nothing. The selected row now gets its own
							     brand-coloured left edge plus brand-coloured text - the same
							     "state is a coloured edge, not just a tint" language the Access
							     Directory cards already use elsewhere in the app. -->
							<button
								type="button"
								class="flex w-full items-center gap-2.5 rounded-lg py-2 pr-2.5 pl-2 text-left transition-colors {selected
									? 'bg-background shadow-xs'
									: 'hover:bg-background/60'}"
								onclick={() => (currentIndex = i)}
							>
								<span
									class="h-7 w-[3px] shrink-0 rounded-full {selected
										? 'bg-primary'
										: 'bg-transparent'}"
								></span>
								<span class="min-w-0">
									<span
										class="block text-xs font-bold {selected
											? 'text-primary'
											: 'text-foreground'}"
									>
										v{entry.version}
									</span>
									<span class="block text-[10.5px] text-muted-foreground">{entry.date}</span>
								</span>
								{#if i === 0}
									<!-- "This is the latest", independent of which one you're currently
									     looking at - gray, not brand-coloured, so it never competes with
									     the selection marker when they land on the same row. No label:
									     the dot alone is the point. -->
									<span
										class="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50"
										aria-label="Latest release"
									></span>
								{/if}
							</button>
						{/each}
					</div>
				</ScrollArea>
			</div>

			<div class="flex max-h-[85vh] min-w-0 flex-col">
				<!-- Header -->
				<div class="border-b bg-background px-5 pt-5 pb-4 sm:px-6">
					<AlertDialogTitle class="text-lg font-bold tracking-tight wrap-break-word sm:text-2xl">
						{currentEntry.title}
					</AlertDialogTitle>

					<!-- Mobile only: the sidebar's job, collapsed to a tappable metadata line.
					     Deliberately plain text with only the chevron coloured - a card/badge/
					     shadow here looked bolted onto a header that is otherwise just prose. -->
					<button
						type="button"
						class="mt-1 inline-flex items-center gap-1 bg-transparent p-0 sm:hidden"
						onclick={() => (pickerOpen = true)}
					>
						<span class="text-xs font-medium text-muted-foreground">
							Version {currentEntry.version} · {currentEntry.date}
						</span>
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.3"
							class="mt-px shrink-0 text-primary"
						>
							<path d="M6 9l6 6 6-6" />
						</svg>
					</button>

					<AlertDialogDescription class="mt-1 hidden text-sm font-medium opacity-70 sm:block">
						Version {currentEntry.version} • {currentEntry.date}
					</AlertDialogDescription>
				</div>

				<!-- Content -->
				<ScrollArea className="min-h-0 flex-1 bg-background">
					<div class="px-5 py-4 sm:px-6 sm:py-5">
						{@render entryBody()}
					</div>
				</ScrollArea>

				<!-- Footer: Don't Show Again / Continue only - version switching lives in the
				     sidebar or the sheet now, not here. -->
				<div class="border-t bg-background px-5 py-3.5 sm:px-6">
					<div class="flex flex-col-reverse items-stretch justify-end gap-2 sm:flex-row sm:gap-2.5">
						<Button
							variant="outline"
							onclick={handleDontShowAgain}
							class="flex-1 text-xs sm:flex-none sm:text-sm"
						>
							Don't Show Again
						</Button>
						<Button onclick={handleClose} class="flex-1 text-xs sm:flex-none sm:text-sm">
							Continue
						</Button>
					</div>
				</div>
			</div>
		</div>
	</AlertDialogContent>
</AlertDialog>

<!-- Mobile version picker - the sidebar's job, as a bottom sheet. -->
<Drawer bind:open={pickerOpen}>
	<DrawerContent>
		<DrawerHeader class="pb-2 text-left">
			<DrawerTitle class="text-sm font-bold">Jump to a release</DrawerTitle>
		</DrawerHeader>
		<div class="max-h-[50vh] overflow-y-auto px-3 pb-6">
			{#each changelog as entry, i (entry.version)}
				<button
					type="button"
					class="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left {i ===
					currentIndex
						? 'bg-muted'
						: ''}"
					onclick={() => selectVersion(i)}
				>
					<div>
						<div class="text-sm font-bold text-foreground">v{entry.version}</div>
						<div class="text-xs text-muted-foreground">{entry.date}</div>
					</div>
					<div class="flex shrink-0 items-center gap-2">
						{#if i === 0}
							<!-- Same quiet "this is the latest" dot as the desktop sidebar - gray,
							     no label, shown regardless of whether it's also the selected one. -->
							<span
								class="h-1.5 w-1.5 rounded-full bg-muted-foreground/50"
								aria-label="Latest release"
							></span>
						{/if}
						{#if i === currentIndex}
							<Check class="h-4 w-4 text-primary" />
						{/if}
					</div>
				</button>
			{/each}
		</div>
	</DrawerContent>
</Drawer>

<style>
	:global([data-state='open']) {
		animation: dialogShow 0.2s ease-out;
	}

	@keyframes dialogShow {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
