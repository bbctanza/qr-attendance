<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { LayoutGrid, Users, QrCode, ListChecks, MoreHorizontal } from 'lucide-svelte';
	import { cn } from '$lib/utils';

	let { class: className = '' } = $props();

	let activePath = $derived($page.url.pathname);

	function isActive(path: string) {
		if (path === '/' && activePath === '/') return true;
		if (path !== '/' && activePath.startsWith(path)) return true;
		return false;
	}
</script>

<nav
	data-mobile-nav="true"
	class={cn(
		'fixed right-0 bottom-0 left-0 z-50 border-t border-border/10 bg-background/80 px-4 pt-2 pb-6 backdrop-blur-xl md:hidden',
		className
	)}
>
	<div class="mx-auto flex max-w-lg items-center justify-between">
		<button
			class="flex w-16 flex-col items-center gap-1 transition-colors {isActive('/overview')
				? 'text-primary'
				: 'text-muted-foreground-mobile'}"
			onclick={() => goto('/overview')}
		>
			<LayoutGrid class="h-6 w-6" />
			<span class="text-[10px] font-medium">Home</span>
		</button>

		<button
			class="flex w-16 flex-col items-center gap-1 transition-colors {isActive('/members')
				? 'text-primary'
				: 'text-muted-foreground-mobile'}"
			onclick={() => goto('/members')}
		>
			<Users class="h-6 w-6" />
			<span class="text-[10px] font-medium">Members</span>
		</button>

		<button
			class="relative -top-8 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 shadow-primary/20 ring-background transition-all outline-none active:scale-95"
			onclick={() => goto('/scan')}
		>
			<QrCode class="h-7 w-7" />
		</button>

		<button
			class="flex w-16 flex-col items-center gap-1 transition-colors {isActive('/attendance')
				? 'text-primary'
				: 'text-muted-foreground-mobile'}"
			onclick={() => goto('/attendance')}
		>
			<ListChecks class="h-6 w-6" />
			<span class="text-[10px] font-medium">Attendance</span>
		</button>

		<button
			class="flex w-16 flex-col items-center gap-1 transition-colors {isActive('/settings')
				? 'text-primary'
				: 'text-muted-foreground-mobile'}"
			onclick={() => goto('/settings')}
		>
			<MoreHorizontal class="h-6 w-6" />
			<span class="text-[10px] font-medium">Options</span>
		</button>
	</div>
</nav>
