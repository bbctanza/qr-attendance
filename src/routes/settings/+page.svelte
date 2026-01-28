<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "$lib/components/ui/card";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { Checkbox } from "$lib/components/ui/checkbox";
    import { Separator } from "$lib/components/ui/separator";
    import { onMount } from 'svelte';
    import { Moon, Sun } from '@lucide/svelte';

    let churchName = $state("Grace Community Church");
    let defaultTime = $state("09:00");
    let autoCheckIn = $state(true);

    // Dark mode state (client-only)
    let isDark = $state(false);

    function applyDark(d: boolean) {
        isDark = d;
        if (typeof document !== 'undefined') {
            document.documentElement.classList.toggle('dark', d);
        }
        try { localStorage.setItem('theme', d ? 'dark' : 'light'); } catch(e) {}
    }

    onMount(() => {
        try {
            const saved = localStorage.getItem('theme');
            if (saved === 'dark') return applyDark(true);
            if (saved === 'light') return applyDark(false);
        } catch(e) {}

        // Respect OS preference if no saved value
        if (typeof window !== 'undefined' && window.matchMedia) {
            applyDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
        }
    });
</script>

<div class="flex flex-col gap-6 p-4 lg:p-6 max-w-4xl">
    <div>
        <h2 class="text-3xl font-bold tracking-tight">Settings</h2>
        <p class="text-muted-foreground">Manage your system preferences and configurations.</p>
    </div>

    <Separator />

    <!-- General Settings -->
    <Card>
        <CardHeader>
            <CardTitle>General Information</CardTitle>
            <CardDescription>Basic details about your organization.</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-4">
            <div class="grid gap-2">
                <Label for="church-name">Organization Name</Label>
                <Input id="church-name" bind:value={churchName} />
            </div>
            <div class="grid gap-2">
                <Label for="address">Address</Label>
                <Input id="address" placeholder="123 Main St, City, Country" />
            </div>
        </CardContent>
        <CardFooter class="border-t bg-muted/50 px-6 py-4">
            <Button>Save General</Button>
        </CardFooter>
    </Card>

    <!-- Attendance Defaults -->
    <Card>
        <CardHeader>
            <CardTitle>Attendance Defaults</CardTitle>
            <CardDescription>Configure how events are created by default.</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-4">
            <div class="grid gap-2">
                <Label for="default-time">Default Start Time</Label>
                <Input type="time" id="default-time" bind:value={defaultTime} class="w-full md:w-50" />
            </div>
            <div class="flex items-center space-x-2">
                <Checkbox id="auto-checkin" checked={autoCheckIn} />
                <Label for="auto-checkin" class="font-normal">
                    Enable partial name matching for manual entry
                </Label>
            </div>
        </CardContent>
        <CardFooter class="border-t bg-muted/50 px-6 py-4">
            <Button variant="secondary">Update Defaults</Button>
        </CardFooter>
    </Card>

    <!-- Appearance -->
    <Card>
        <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Toggle dark mode for the UI (temporary toggle).</CardDescription>
        </CardHeader>
        <CardContent class="flex items-center justify-between">
            <div>
                <div class="text-sm font-medium">Dark Mode</div>
                <div class="text-xs text-muted-foreground">Toggle between light and dark themes for testing.</div>
            </div>
            <div class="flex items-center gap-2">
                <Button variant="outline" size="sm" onclick={() => applyDark(!isDark)}>
                    {#if isDark}
                        <Sun class="mr-2 h-4 w-4" /> Light
                    {:else}
                        <Moon class="mr-2 h-4 w-4" /> Dark
                    {/if}
                </Button>
            </div>
        </CardContent>
    </Card>
</div>
