<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "$lib/components/ui/card";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { Checkbox } from "$lib/components/ui/checkbox";
    import { Separator } from "$lib/components/ui/separator";

    let churchName = "Grace Community Church";
    let defaultTime = "09:00";
    let autoCheckIn = true;
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
                <Label htmlFor="church-name">Organization Name</Label>
                <Input id="church-name" bind:value={churchName} />
            </div>
            <div class="grid gap-2">
                <Label htmlFor="address">Address</Label>
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
                <Label htmlFor="default-time">Default Start Time</Label>
                <Input type="time" id="default-time" bind:value={defaultTime} class="w-full md:w-[200px]" />
            </div>
            <div class="flex items-center space-x-2">
                <Checkbox id="auto-checkin" checked={autoCheckIn} />
                <Label htmlFor="auto-checkin" class="font-normal">
                    Enable partial name matching for manual entry
                </Label>
            </div>
        </CardContent>
        <CardFooter class="border-t bg-muted/50 px-6 py-4">
            <Button variant="secondary">Update Defaults</Button>
        </CardFooter>
    </Card>
</div>
