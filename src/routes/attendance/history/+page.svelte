<script lang="ts">
  import { onMount } from 'svelte';
  import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
  import { Badge } from '$lib/components/ui/badge';
  import { ChevronRight, ChevronDown, ChevronLeft, QrCode } from '@lucide/svelte';
  import { attendanceApi } from '$lib/api/attendance';
  import { eventsApi } from '$lib/api/events';
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
  let selectedMonth = $state('OCT');
  let filterPresent = $state(true);
  let months = ['ALL', 'OCT', 'NOV', 'DEC', 'JAN'];
  let monthPage = $state(0);
  let monthsPerPage = 4;

  let visibleMonths = $derived(() => months.slice(monthPage * monthsPerPage, (monthPage + 1) * monthsPerPage));
  let hasPrev = $derived(() => monthPage > 0);
  let hasNext = $derived(() => (monthPage + 1) * monthsPerPage < months.length);

  // Attendance calculations using $derived
  let totalAttendees = $derived(() => events.reduce((s, e) => s + (e.attendees ? e.attendees.length : 0), 0));
  // Default average event size (fallback) — could be computed dynamically later
  let defaultAvgSize = 18;
  let averageSize = $derived(() => events.length ? Math.round(totalAttendees() / events.length) || defaultAvgSize : defaultAvgSize);
  let attendanceRate = $derived(() => events.length ? Math.round((totalAttendees() / (events.length * defaultAvgSize)) * 100) : 0);

  // Mock placeholder until backend returns data
  const mockEvents: Event[] = [
    {
      event_id: 101,
      event_name: 'Q3 PLANNING SESSION',
      event_date: '2023-10-24',
      start_datetime: '2023-10-24T09:00:00Z',
      end_datetime: '2023-10-24T11:00:00Z',
      attendees: [
        { member_id: 'm1', first_name: 'Alex', last_name: 'Chen', time: '09:00 AM' },
        { member_id: 'm2', first_name: 'Sarah', last_name: 'Jones', time: '09:05 AM' },
        { member_id: 'm3', first_name: 'Marcus', last_name: 'Lee', time: '09:12 AM' }
      ],
      absent: [
        { member_id: 'm4', first_name: 'Mary', last_name: 'Smith' },
        { member_id: 'm5', first_name: 'John', last_name: 'Doe' }
      ]
    },
    {
      event_id: 102,
      event_name: 'DESIGN WORKSHOP A',
      event_date: '2023-10-20',
      start_datetime: '2023-10-20T10:00:00Z',
      end_datetime: '2023-10-20T12:00:00Z',
      attendees: [
        { member_id: 'm1', first_name: 'Alex', last_name: 'Chen', time: '10:05 AM' },
        { member_id: 'm4', first_name: 'Mary', last_name: 'Smith', time: '10:12 AM' }
      ],
      absent: [
        { member_id: 'm2', first_name: 'Sarah', last_name: 'Jones' },
        { member_id: 'm3', first_name: 'Marcus', last_name: 'Lee' }
      ]
    }
  ];

  onMount(async () => {
    try {
      // Try to load completed events with pending scans
      const loaded = await eventsApi.getCompletedEventsWithPendingScans();
      if (loaded && loaded.length > 0) {
        // Map minimal fields
        events = loaded.map(e => ({
          event_id: e.event_id,
          event_name: e.event_name,
          event_date: e.event_date,
          start_datetime: e.start_datetime,
          end_datetime: e.end_datetime,
          attendees: []
        }));
      } else {
        events = mockEvents;
      }

      // Try to fetch attendee counts for each event (confirmed)
      for (let ev of events) {
        try {
          const confirmed = await attendanceApi.getConfirmedAttendance(ev.event_id);
          ev.attendees = confirmed.map(c => ({ member_id: c.member_id, first_name: c.members.first_name, last_name: c.members.last_name, time: new Date(c.scan_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }));
        } catch (e) {
          // Keep mock attendees if API fails
        }
      }
    } catch (e) {
      events = mockEvents;
    }
  });

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