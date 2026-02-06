<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogHeader,
		AlertDialogTitle,
	} from '$lib/components/ui/alert-dialog';
	import { Info } from 'lucide-svelte';

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	function handleClose() {
		open = false;
	}
</script>

<AlertDialog bind:open>
	<AlertDialogContent class="max-w-md">
		<AlertDialogHeader>
			<div class="flex items-center gap-3">
				<div class="p-2 rounded-lg bg-primary/10 text-primary">
					<Info class="h-5 w-5" />
				</div>
				<AlertDialogTitle>About This App</AlertDialogTitle>
			</div>
		</AlertDialogHeader>

		<AlertDialogDescription class="space-y-4">
			<div>
				<p class="font-semibold text-foreground mb-2">QR Attendance System</p>
				<p class="text-sm leading-relaxed">
					A modern attendance tracking system designed for organizations, churches, and educational institutions. Scan QR codes to record attendance in real-time with automated event management.
				</p>
			</div>

			<div class="space-y-2">
				<p class="text-xs font-semibold text-muted-foreground uppercase">Features</p>
				<ul class="text-sm space-y-1 text-muted-foreground">
					<li>• QR code scanning for fast check-ins</li>
					<li>• Automated recurring event scheduling</li>
					<li>• Real-time attendance analytics</li>
					<li>• Member & group management</li>
				</ul>
			</div>
		</AlertDialogDescription>

		<div class="flex gap-3 justify-end pt-4">
			<AlertDialogAction onclick={handleClose}>
				Got it
			</AlertDialogAction>
		</div>
	</AlertDialogContent>
</AlertDialog>
