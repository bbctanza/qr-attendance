<script lang="ts">
	import { onMount } from 'svelte';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { ChevronRight, ChevronDown, ChevronLeft, QrCode, Download, MoreVertical } from '@lucide/svelte';
	import { attendanceApi } from '$lib/api/attendance';
	import { eventsApi } from '$lib/api/events';
	import { supabase } from '$lib/supabase';
	import Progress from '$lib/components/ui/progress';
	import FullPageLoading from "$lib/components/full-page-loading.svelte";
	import { formatLocalTime } from '$lib/utils/time';
	import { exportToCSV, exportToPDF, type ExportRecord } from '$lib/utils/attendanceExport';
	import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '$lib/components/ui/dropdown-menu';

	type Event = {
		event_id: number;
		event_name: string;
		event_date: string;
		start_datetime: string;
		end_datetime: string;
		attendees?: { member_id: string; first_name: string; last_name: string; time?: string; care_group?: string }[];
		absent?: { member_id: string; first_name: string; last_name: string; care_group?: string }[];
	};

	let events = $state<Event[]>([]);
	let openEventId = $state<number | null>(null);
	let selectedMonth = $state('');
	let filterPresent = $state(true);
	let months = $state<string[]>([]);
	let monthMap: Record<string, number> = {
		'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
		'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
	};
	const monthOrder = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
	let monthPage = $state(0);
	let monthsPerPage = 4;
	let isLoading = $state(true);

	let visibleMonths = $derived(months.slice(monthPage * monthsPerPage, (monthPage + 1) * monthsPerPage));
	let hasPrev = $derived(monthPage > 0);
	let hasNext = $derived((monthPage + 1) * monthsPerPage < months.length);

	// Filtering
	let filteredEvents = $derived(
		events.filter(e => new Date(e.event_date).getMonth() === monthMap[selectedMonth])
	);

	// Attendance calculations
	let totalAttendees = $derived(filteredEvents.reduce((s, e) => s + (e.attendees ? e.attendees.length : 0), 0));
	let totalExpected = $derived(filteredEvents.reduce((s, e) => s + ((e.attendees?.length || 0) + (e.absent?.length || 0)), 0));
	
	let averageSize = $derived(filteredEvents.length ? Math.round(totalAttendees / filteredEvents.length) : 0);
	let attendanceRate = $derived(totalExpected > 0 ? Math.round((totalAttendees / totalExpected) * 100) : 0);

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
				.select('member_id, scan_datetime, members(first_name, last_name, groups(name))')
				.eq('event_id', ev.event_id);

			const attendees = await Promise.all((presentData || []).map(async (p: any) => ({
				member_id: p.member_id,
				first_name: p.members?.first_name || 'Unknown',
				last_name: p.members?.last_name || 'Member',
				care_group: p.members?.groups?.name || '-',
				time: await formatLocalTime(p.scan_datetime)
			})));

			const { data: absentData } = await supabase
				.from('attendance_absent')
				.select('member_id, members(first_name, last_name, groups(name))')
				.eq('event_id', ev.event_id);
			
			const absent = (absentData || []).map((a: any) => ({
				member_id: a.member_id,
				first_name: a.members?.first_name || 'Unknown',
				last_name: a.members?.last_name || 'Member',
				care_group: a.members?.groups?.name || '-'
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
		
		// Extract unique months from events and sort them
		const uniqueMonths = new Set<string>();
		eventsWithDetails.forEach(event => {
			const date = new Date(event.event_date);
			const monthIndex = date.getMonth();
			const monthStr = monthOrder[monthIndex];
			uniqueMonths.add(monthStr);
		});
		
		// Sort months chronologically
		const sortedMonths = Array.from(uniqueMonths).sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));
		months = sortedMonths;
		// Set selected month to the latest month (last in sorted array)
		if (sortedMonths.length > 0) {
			selectedMonth = sortedMonths[sortedMonths.length - 1];
		}
		monthPage = 0; // Reset pagination
	}

  function toggleEvent(id: number) {
    openEventId = openEventId === id ? null : id;
  }

  function scanMember() {
    // redirect to scanner page
    window.location.href = '/scan';
  }


  function handleExportPresentCSV() {
    const records: ExportRecord[] = [];
    
    filteredEvents.forEach(event => {
      (event.attendees || []).forEach(attendee => {
        records.push({
          member_id: attendee.member_id,
          care_group: attendee.care_group,
          event_name: event.event_name,
          event_date: event.event_date,
          first_name: attendee.first_name,
          last_name: attendee.last_name,
          time: attendee.time || '-'
        });
      });
    });

    if (records.length === 0) {
      alert('No present members to export');
      return;
    }

    const periodLabel = records.length > 0 && records[0].event_date
      ? new Date(records[0].event_date).toLocaleString('default', { month: 'long', year: 'numeric' })
      : selectedMonth;

    exportToCSV(records, {
      viewMode: 'present',
      selectedMonth: periodLabel,
      stats: {
        totalPresent: totalAttendees,
        totalAbsent: totalExpected - totalAttendees,
        attendanceRate: attendanceRate
      }
    });
  }

  async function handleExportPresentPDF() {
    const records: ExportRecord[] = [];
    
    filteredEvents.forEach(event => {
      (event.attendees || []).forEach(attendee => {
        records.push({
          member_id: attendee.member_id,
          care_group: attendee.care_group,
          event_name: event.event_name,
          event_date: event.event_date,
          first_name: attendee.first_name,
          last_name: attendee.last_name,
          time: attendee.time || '-'
        });
      });
    });

    if (records.length === 0) {
      alert('No present members to export');
      return;
    }

    const periodLabel = records.length > 0 && records[0].event_date
      ? new Date(records[0].event_date).toLocaleString('default', { month: 'long', year: 'numeric' })
      : selectedMonth;

    try {
      await exportToPDF(records, {
        viewMode: 'present',
        selectedMonth: periodLabel,
        stats: {
          totalPresent: totalAttendees,
          totalAbsent: totalExpected - totalAttendees,
          attendanceRate: attendanceRate
        }
      });
    } catch (err) {
      console.error('PDF export error:', err);
      alert('PDF export requires jsPDF and jspdf-autotable packages. Please install them: npm install jspdf jspdf-autotable');
    }
  }

  function handleExportAbsentCSV() {
    const records: ExportRecord[] = [];
    
    filteredEvents.forEach(event => {
      (event.absent || []).forEach(member => {
        records.push({
          member_id: member.member_id,
          care_group: member.care_group,
          event_name: event.event_name,
          event_date: event.event_date,
          first_name: member.first_name,
          last_name: member.last_name
        });
      });
    });

    if (records.length === 0) {
      alert('No absent members to export');
      return;
    }

    const periodLabel = records.length > 0 && records[0].event_date
      ? new Date(records[0].event_date).toLocaleString('default', { month: 'long', year: 'numeric' })
      : selectedMonth;

    exportToCSV(records, {
      viewMode: 'absent',
      selectedMonth: periodLabel,
      stats: {
        totalPresent: totalAttendees,
        totalAbsent: totalExpected - totalAttendees,
        attendanceRate: attendanceRate
      }
    });
  }

  async function handleExportAbsentPDF() {
    const records: ExportRecord[] = [];
    
    filteredEvents.forEach(event => {
      (event.absent || []).forEach(member => {
        records.push({
          member_id: member.member_id,
          care_group: member.care_group,
          event_name: event.event_name,
          event_date: event.event_date,
          first_name: member.first_name,
          last_name: member.last_name
        });
      });
    });

    if (records.length === 0) {
      alert('No absent members to export');
      return;
    }

    const periodLabel = records.length > 0 && records[0].event_date
      ? new Date(records[0].event_date).toLocaleString('default', { month: 'long', year: 'numeric' })
      : selectedMonth;

    try {
      await exportToPDF(records, {
        viewMode: 'absent',
        selectedMonth: periodLabel,
        stats: {
          totalPresent: totalAttendees,
          totalAbsent: totalExpected - totalAttendees,
          attendanceRate: attendanceRate
        }
      });
    } catch (err) {
      console.error('PDF export error:', err);
      alert('PDF export requires jsPDF and jspdf-autotable packages. Please install them: npm install jspdf jspdf-autotable');
    }
  }

  // Individual event export functions
  function handleExportEventCSV(event: Event) {
    const records: ExportRecord[] = [];
    
    if (filterPresent) {
      (event.attendees || []).forEach(attendee => {
        records.push({
          member_id: attendee.member_id,
          care_group: attendee.care_group,
          event_name: event.event_name,
          event_date: event.event_date,
          first_name: attendee.first_name,
          last_name: attendee.last_name,
          time: attendee.time || '-'
        });
      });
    } else {
      (event.absent || []).forEach(member => {
        records.push({
          member_id: member.member_id,
          care_group: member.care_group,
          event_name: event.event_name,
          event_date: event.event_date,
          first_name: member.first_name,
          last_name: member.last_name
        });
      });
    }

    if (records.length === 0) {
      alert('No data to export for this event');
      return;
    }

    const evPresent = event.attendees?.length || 0;
    const evAbsent = event.absent?.length || 0;
    const evTotal = evPresent + evAbsent;
    const evRate = evTotal > 0 ? Math.round((evPresent / evTotal) * 100) : 0;
    const periodLabel = new Date(event.event_date).toLocaleString('default', { month: 'long', year: 'numeric' });

    exportToCSV(records, {
      viewMode: filterPresent ? 'present' : 'absent',
      selectedMonth: periodLabel,
      stats: {
        totalPresent: evPresent,
        totalAbsent: evAbsent,
        attendanceRate: evRate
      }
    });
  }

  async function handleExportEventPDF(event: Event) {
    const records: ExportRecord[] = [];
    
    if (filterPresent) {
      (event.attendees || []).forEach(attendee => {
        records.push({
          member_id: attendee.member_id,
          care_group: attendee.care_group,
          event_name: event.event_name,
          event_date: event.event_date,
          first_name: attendee.first_name,
          last_name: attendee.last_name,
          time: attendee.time || '-'
        });
      });
    } else {
      (event.absent || []).forEach(member => {
        records.push({
          member_id: member.member_id,
          care_group: member.care_group,
          event_name: event.event_name,
          event_date: event.event_date,
          first_name: member.first_name,
          last_name: member.last_name
        });
      });
    }

    if (records.length === 0) {
      alert('No data to export for this event');
      return;
    }

    const evPresent = event.attendees?.length || 0;
    const evAbsent = event.absent?.length || 0;
    const evTotal = evPresent + evAbsent;
    const evRate = evTotal > 0 ? Math.round((evPresent / evTotal) * 100) : 0;
    const periodLabel = new Date(event.event_date).toLocaleString('default', { month: 'long', year: 'numeric' });

    try {
      await exportToPDF(records, {
        viewMode: filterPresent ? 'present' : 'absent',
        selectedMonth: periodLabel,
        stats: {
          totalPresent: evPresent,
          totalAbsent: evAbsent,
          attendanceRate: evRate
        }
      });
    } catch (err) {
      console.error('PDF export error:', err);
      alert('PDF export requires jsPDF and jspdf-autotable packages. Please install them: npm install jspdf jspdf-autotable');
    }
  }
</script>

{#if isLoading}
	<FullPageLoading message="Loading attendance history..." />
{:else}
	<div class="flex flex-col gap-4 md:gap-6 p-4 md:px-12 md:py-10 lg:px-16 lg:py-12">

  <Card>
    <CardHeader>
      <CardTitle>Total Attendance</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="flex items-center justify-between">
        <div class="text-4xl font-black">{attendanceRate}<small class="text-primary">%</small></div>
        <div class="text-sm text-muted-foreground">{selectedMonth}</div>
      </div>
      <div class="mt-4">
        <Progress value={attendanceRate} max={100} />
      </div>
    </CardContent>
  </Card>

  <div class="grid grid-cols-2 gap-4 md:gap-6">
    <div class="rounded-2xl border border-border/20 bg-card p-4">
      <div class="text-xs text-muted-foreground uppercase">Events</div>
      <div class="text-xl font-bold mt-2">{filteredEvents.length}</div>
      <div class="text-sm text-muted-foreground">This month</div>
    </div>
    <div class="rounded-2xl border border-border/20 bg-card p-4">
      <div class="text-xs text-muted-foreground uppercase">Average</div>
      <div class="text-xl font-bold mt-2">{averageSize}</div>
      <div class="text-sm text-muted-foreground">Members</div>
    </div>
  </div>

  <div class="flex flex-col items-center md:flex-row md:justify-between md:items-center mt-2 md:mt-4">
    <div class="flex items-center gap-2 mb-2 md:mb-0">
      <button class="p-2 rounded-full bg-card/30 text-muted-foreground hover:bg-card/50 disabled:opacity-50" disabled={!hasPrev} onclick={() => monthPage--}>
        <ChevronLeft class="h-4 w-4" />
      </button>
      {#each visibleMonths as m}
        <button class="rounded-full px-4 py-2 md:px-6 md:py-3 text-sm font-bold {m === selectedMonth ? 'bg-primary text-primary-foreground' : 'bg-card/30 text-muted-foreground'}" onclick={() => selectedMonth = m}>{m}</button>
      {/each}
      <button class="p-2 rounded-full bg-card/30 text-muted-foreground hover:bg-card/50 disabled:opacity-50" disabled={!hasNext} onclick={() => monthPage++}>
        <ChevronRight class="h-4 w-4" />
      </button>
    </div>
    <div class="flex flex-col items-center md:flex-row md:justify-between md:items-center gap-4">
      <div role="tablist" aria-label="Present or Absent" class="inline-flex rounded-2xl border border-border/20 bg-card/10 p-1">
        <button
          role="tab"
          aria-selected={filterPresent}
          class={"text-sm font-bold py-2 px-6 rounded-xl transition-all text-center " + (filterPresent ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")}
          onclick={() => filterPresent = true}
        >
          PRESENT
        </button>
        <button
          role="tab"
          aria-selected={!filterPresent}
          class={"text-sm font-bold py-2 px-6 rounded-xl transition-all text-center " + (!filterPresent ? "bg-destructive text-primary-foreground shadow-sm" : "text-muted-foreground")}
          onclick={() => filterPresent = false}
        >
          ABSENT
        </button>
      </div>
      {#if filterPresent}
        <DropdownMenu>
          <DropdownMenuTrigger>
            {#snippet child({ props })}
              <Button variant="outline" size="sm" class="gap-2" {...props}>
                <Download class="h-4 w-4" />
                <span class="hidden sm:inline">Export</span>
              </Button>
            {/snippet}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onclick={handleExportPresentCSV}>
              <Download class="mr-2 h-4 w-4" />
              <span>Export as CSV</span>
            </DropdownMenuItem>
            <DropdownMenuItem onclick={handleExportPresentPDF}>
              <Download class="mr-2 h-4 w-4" />
              <span>Export as PDF</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      {:else}
        <DropdownMenu>
          <DropdownMenuTrigger>
            {#snippet child({ props })}
              <Button variant="outline" size="sm" class="gap-2" {...props}>
                <Download class="h-4 w-4" />
                <span class="hidden sm:inline">Export</span>
              </Button>
            {/snippet}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onclick={handleExportAbsentCSV}>
              <Download class="mr-2 h-4 w-4" />
              <span>Export as CSV</span>
            </DropdownMenuItem>
            <DropdownMenuItem onclick={handleExportAbsentPDF}>
              <Download class="mr-2 h-4 w-4" />
              <span>Export as PDF</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      {/if}
    </div>
  </div>

  <div class="space-y-4">
      {#each filteredEvents as ev}
        <div class="rounded-2xl border border-border/20 bg-card overflow-hidden">
          <div class="flex items-center justify-between p-4 md:p-6">
          <div class="flex items-center gap-3 flex-1">
            <div class="w-1.5 h-10 rounded-l-full bg-primary/60"></div>
            <div>
              <div class="font-bold uppercase">{ev.event_name}</div>
              <div class="text-sm text-muted-foreground mt-1">{new Date(ev.event_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            </div>
          </div>
          <div class="flex items-center gap-2 md:gap-3">
            <div class="text-sm font-medium bg-muted px-3 py-1 rounded-md">{filterPresent ? (ev.attendees?.length || 0) : (ev.absent?.length || 0)}</div>
            <DropdownMenu>
              <DropdownMenuTrigger>
                {#snippet child({ props })}
                  <button 
                    class="h-8 w-8 rounded-full bg-card/10 hover:bg-card/20 flex items-center justify-center transition-colors"
                    title="Export options"
                    {...props}
                  >
                    <Download class="h-4 w-4" />
                  </button>
                {/snippet}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onclick={() => handleExportEventCSV(ev)}>
                  <Download class="mr-2 h-4 w-4" />
                  <span>CSV</span>
                </DropdownMenuItem>
                <DropdownMenuItem onclick={() => handleExportEventPDF(ev)}>
                  <Download class="mr-2 h-4 w-4" />
                  <span>PDF</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
{/if}