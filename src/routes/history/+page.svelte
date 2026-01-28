<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';

    onMount(() => {
        // Client-side redirect to the new Attendance route
        goto('/attendance', { replaceState: true });
    });
</script>

<div class="p-6 text-center text-muted-foreground">
    Redirecting to Attendance…
</div>

