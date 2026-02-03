<script lang="ts">
	import { onMount } from 'svelte';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { ChevronRight, ChevronDown, ChevronLeft, QrCode } from '@lucide/svelte';
	import { attendanceApi } from '$lib/api/attendance';
	import { eventsApi } from '$lib/api/events';
	import { supabase } from '$lib/supabase';
	import Progress from '$lib/components/ui/progress';

	type Event = {
		event_id: number;
		event_name: string;
		event_date: string;
		start_datetime: string;
		end_datetime: string;
		attendees?: { member_id: string; first_name: string; last_name: string; time?: string }[];
		absent?: { member_id: string; first_name: string; last_name: string }[];
	};

	let events = $state<Event[]>([]);
	let openEventId = $state<number | null>(null);
	let selectedMonth = $state('ALL'); // Default to ALL to show something initially
	let filterPresent = $state(true);
	let months = ['ALL', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP'];
	let monthPage = $state(0);
	let monthsPerPage = 4;
	let isLoading = $state(true);

	let visibleMonths = $derived(() => months.slice(monthPage * monthsPerPage, (monthPage + 1) * monthsPerPage));
	let hasPrev = $derived(() => monthPage > 0);
	let hasNext = $derived(() => (monthPage + 1) * monthsPerPage < months.length);

	// Attendance calculations using $derived
	let totalAttendees = $derived(() => events.reduce((s, e) => s + (e.attendees ? e.attendees.length : 0), 0));
	// Default average event size (fallback) — could be computed dynamically later
	let defaultAvgSize = 18;
	let averageSize = $derived(() => events.length ? Math.round(totalAttendees() / events.length) || defaultAvgSize : defaultAvgSize);
	let attendanceRate = $derived(() => events.length ? Math.round((totalAttendees() / (events.length * defaultAvgSize)) * 100) : 0);

	onMount(async () => {
		isLoading = true;
		try {
			await fetchHistory();
		} finally {
			isLoading = false;
		}
	});

	async function fetchHistory() {
		// 1. Fetch completed events
		const { data: completedEvents, error } = await supabase
			.from('events')
			.select('*')
			.eq('status', 'completed')
			.order('end_datetime', { ascending: false });
		
		if (error) {
			console.error('Error fetching history events:', error);
			return;
		}

		if (!completedEvents) {
			events = [];
			return;
		}

		// 2. Hydrate events with attendance data
		// Optimized approach: Fetch all history for these events in parallel or one batch if possible.
		// For now, simpler map loop until performance is an issue.
		const eventsWithDetails = await Promise.all(completedEvents.map(async (ev) => {
			// Get Present
			const { data: presentData } = await supabase
				.from('attendance_present')
				.select('member_id, scan_datetime, members(first_name, last_name)')
				.eq('event_id', ev.event_id);

			const attendees = (presentData || []).map((p: any) => ({
				member_id: p.member_id,
				first_name: p.members?.first_name || 'Unknown',
				last_name: p.members?.last_name || 'Member',
				time: new Date(p.scan_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
			}));

			// Get Absent
			// If we want to show absent people, we need to query attendance_absent
			const { data: absentData } = await supabase
				.from('attendance_absent')
				.select('member_id, members(first_name, last_name)')
				.eq('event_id', ev.event_id);
			
			const absent = (absentData || []).map((a: any) => ({
				member_id: a.member_id,
				first_name: a.members?.first_name || 'Unknown',
				last_name: a.members?.last_name || 'Member'
			}));

			return {
				event_id: ev.event_id,
				event_name: ev.event_name,
				event_date: ev.event_date,
				start_datetime: ev.start_datetime,
				end_datetime: ev.end_datetime,
				attendees,
				absent
			};
		}));

		events = eventsWithDetails;
	}

  function toggleEvent(id: number) {
    openEventId = openEventId === id ? null : id;
  }

  function scanMember() {
    // redirect to scanner page
    window.location.href = '/scan';
  }
</script>

<div class="flex flex-col gap-4 md:gap-6 p-4 md:px-12 md:py-10 lg:px-16 lg:py-12">

  <Card>
    <CardHeader>
      <CardTitle>Total Attendance</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="flex items-center justify-between">
        <div class="text-4xl font-black">85<small class="text-primary">%</small></div>
        <div class="text-sm text-muted-foreground">{selectedMonth}</div>
      </div>
      <div class="mt-4">
        <Progress value={85} max={100} />
      </div>
    </CardContent>
  </Card>

  <div class="grid grid-cols-2 gap-4 md:gap-6">
    <div class="rounded-2xl border border-border/20 bg-card p-4">
      <div class="text-xs text-muted-foreground uppercase">Events</div>
      <div class="text-xl font-bold mt-2">{events.length}</div>
      <div class="text-sm text-muted-foreground">This month</div>
    </div>
    <div class="rounded-2xl border border-border/20 bg-card p-4">
      <div class="text-xs text-muted-foreground uppercase">Average</div>
      <div class="text-xl font-bold mt-2">{averageSize()}</div>
      <div class="text-sm text-muted-foreground">Members</div>
    </div>
  </div>

  <div class="flex flex-col items-center md:flex-row md:justify-between md:items-center mt-2 md:mt-4">
    <div class="flex items-center gap-2 mb-2 md:mb-0">
      <button class="p-2 rounded-full bg-card/30 text-muted-foreground hover:bg-card/50 disabled:opacity-50" disabled={!hasPrev()} onclick={() => monthPage--}>
        <ChevronLeft class="h-4 w-4" />
      </button>
      {#each visibleMonths() as m}
        <button class="rounded-full px-4 py-2 md:px-6 md:py-3 text-sm font-bold {m === selectedMonth ? 'bg-primary text-primary-foreground' : 'bg-card/30 text-muted-foreground'}" onclick={() => selectedMonth = m}>{m}</button>
      {/each}
      <button class="p-2 rounded-full bg-card/30 text-muted-foreground hover:bg-card/50 disabled:opacity-50" disabled={!hasNext()} onclick={() => monthPage++}>
        <ChevronRight class="h-4 w-4" />
      </button>
    </div>
    <div role="tablist" aria-label="Present or Absent" class="inline-flex w-full max-w-md md:max-w-lg lg:max-w-xl rounded-2xl border border-border/20 bg-card/10 p-1">
      <button
        role="tab"
        aria-selected={filterPresent}
        class={"flex-1 text-sm font-bold py-2 px-6 rounded-xl transition-all text-center " + (filterPresent ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")}
        onclick={() => filterPresent = true}
      >
        PRESENT
      </button>
      <button
        role="tab"
        aria-selected={!filterPresent}
        class={"flex-1 text-sm font-bold py-2 px-6 rounded-xl transition-all text-center " + (!filterPresent ? "bg-destructive text-primary-foreground shadow-sm" : "text-muted-foreground")}
        onclick={() => filterPresent = false}
      >
        ABSENT
      </button>
    </div>
  </div>

  <div class="space-y-4">
    {#each events as ev}
      <div class="rounded-2xl border border-border/20 bg-card overflow-hidden">
        <div class="flex items-center justify-between p-4 md:p-6">
          <div class="flex items-center gap-3">
            <div class="w-1.5 h-10 rounded-l-full bg-primary/60"></div>
            <div>
              <div class="font-bold uppercase">{ev.event_name}</div>
              <div class="text-sm text-muted-foreground mt-1">{new Date(ev.event_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="text-sm font-medium bg-muted px-3 py-1 rounded-md">{filterPresent ? (ev.attendees?.length || 0) : (ev.absent?.length || 0)}</div>
            <button class="h-8 w-8 rounded-full bg-card/10 flex items-center justify-center" onclick={() => toggleEvent(ev.event_id)}>
              {#if openEventId === ev.event_id}
                <ChevronDown />
              {:else}
                <ChevronRight />
              {/if}
            </button>
          </div>
        </div>

        {#if openEventId === ev.event_id}
          <div class="border-t border-border/20 p-3 md:p-4">
            <div class="grid gap-3">
              {#if filterPresent}
                {#each ev.attendees || [] as a}
                  <div class="flex items-center justify-between p-2 md:p-3">
                    <div class="flex items-center gap-3">
                      <Avatar class="h-10 w-10"><AvatarFallback>{a.first_name[0]}{a.last_name[0]}</AvatarFallback></Avatar>
                      <div>
                        <div class="font-medium">{a.first_name} {a.last_name}</div>
                        <div class="text-xs text-muted-foreground">UI Department</div>
                      </div>
                    </div>
                    <div class="flex items-center gap-3">
                      <div class="text-sm bg-primary/10 text-primary px-3 py-1 rounded-md">{a.time}</div>
                    </div>
                  </div>
                {/each}
              {:else}
                {#each ev.absent || [] as a}
                  <div class="flex items-center justify-between p-2 md:p-3">
                    <div class="flex items-center gap-3">
                      <Avatar class="h-10 w-10"><AvatarFallback>{a.first_name[0]}{a.last_name[0]}</AvatarFallback></Avatar>
                      <div>
                        <div class="font-medium">{a.first_name} {a.last_name}</div>
                        <div class="text-xs text-muted-foreground">UI Department</div>
                      </div>
                    </div>
                    <div class="flex items-center gap-3">
                      <div class="text-sm bg-destructive/10 text-destructive px-3 py-1 rounded-md">Absent</div>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>