<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogHeader,
		AlertDialogTitle
	} from '$lib/components/ui/alert-dialog';
	import { Info, BookOpen } from 'lucide-svelte';

	interface Props {
		open?: boolean;
		onViewChangelog?: () => void;
	}

	let { open = $bindable(false), onViewChangelog }: Props = $props();

	function handleClose() {
		open = false;
	}

	function handleViewChangelog() {
		onViewChangelog?.();
		open = false;
	}
</script>

<AlertDialog bind:open>
	<AlertDialogContent class="max-w-md">
		<AlertDialogHeader>
			<div class="flex items-center gap-3">
				<div class="rounded-lg bg-primary/10 p-2 text-primary">
					<Info class="h-5 w-5" />
				</div>
				<div>
					<AlertDialogTitle>About This App</AlertDialogTitle>
				</div>
			</div>
		</AlertDialogHeader>

		<AlertDialogDescription class="space-y-4">
			<div>
				<p class="mb-2 font-semibold text-foreground">QR Attendance System</p>
				<p class="text-sm leading-relaxed">
					A modern attendance tracking system designed for organizations, churches, and educational
					institutions. Scan QR codes to record attendance in real-time with automated event
					management.
				</p>
			</div>

			<div class="space-y-1 border-t border-border/50 pt-2">
				<p class="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
					Bible Baptist Church Tanza © 2026
				</p>
				<p class="text-xs text-muted-foreground italic">
					"John 12:32 A Place Where Christ is Lifted Up"
				</p>
			</div>

			<div class="space-y-2">
				<p class="text-xs font-semibold text-muted-foreground uppercase">Features</p>
				<ul class="space-y-1 text-sm text-muted-foreground">
					<li>• QR code scanning for fast check-ins</li>
					<li>• Automated recurring event scheduling</li>
					<li>• Real-time attendance analytics</li>
					<li>• Member & group management</li>
				</ul>
			</div>
		</AlertDialogDescription>

		<div class="flex justify-end gap-3 pt-4">
			<Button variant="outline" onclick={handleViewChangelog} class="gap-2">
				<BookOpen class="h-4 w-4" />
				Changelog
			</Button>
			<AlertDialogAction onclick={handleClose}>Got it</AlertDialogAction>
		</div>
	</AlertDialogContent>
</AlertDialog>
