<script lang="ts">
    import { Input } from "$lib/components/ui/input";
    import { Button } from "$lib/components/ui/button";
    import * as Select from "$lib/components/ui/select";
    import * as Table from "$lib/components/ui/table";
    import { Avatar, AvatarImage, AvatarFallback } from "$lib/components/ui/avatar";
    import { Badge } from "$lib/components/ui/badge";
    import { Card, CardContent } from "$lib/components/ui/card";
    import { Label } from "$lib/components/ui/label";
    import { Search, Plus, MoreHorizontal, FileDown, ArrowLeft, MoreVertical, QrCode, Filter, ChevronLeft, ChevronRight, UserPlus, Lock, X, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Grid3x3, Rows, Users, TrendingUp, Clock } from "@lucide/svelte";
    import * as Collapsible from "$lib/components/ui/collapsible";
    import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuLabel,
        DropdownMenuSeparator,
        DropdownMenuTrigger,
        DropdownMenuCheckboxItem,
    } from "$lib/components/ui/dropdown-menu";
    import {
        Drawer,
        DrawerContent,
        DrawerHeader,
        DrawerTitle,
        DrawerTrigger,
        DrawerClose,
    } from "$lib/components/ui/drawer";
    import {
        Sheet,
        SheetContent,
        SheetHeader,
        SheetTitle,
    } from "$lib/components/ui/sheet";
    import QRCode from 'qrcode';
    import { systemSettings } from "$lib/stores/settings";
    import { onMount } from "svelte";
    import { supabase } from "$lib/supabase";
    import FullPageLoading from "$lib/components/full-page-loading.svelte";
import { toast } from 'svelte-sonner';
import { exportMembersToCSV, exportMembersToPDF, exportMembersQRPDF, type MemberExportRecord } from '$lib/utils/membersExport';
import { getErrorMessage, getErrorTitle } from '$lib/utils';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogFooter
} from '$lib/components/ui/alert-dialog';

    // Modal state
    let showAddMemberModal = $state(false);
    // Drawer (mobile) state - drawer uses portal so we keep a separate mobile state
    let showAddMemberDrawer = $state(false);
    let showEditMemberModal = $state(false);
    let showEditMemberDrawer = $state(false);
    let selectedMemberForEdit = $state<any | null>(null);
    let showQrModal = $state(false);
    let selectedMemberForQr = $state<any | null>(null);
    let isMobileView = $state(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
    let qrCodeDataUrl = $state<string>("");
    let isLoading = $state(true);
    let formData = $state({
        lastName: "",
        firstName: "",
        middleInitial: "",
        group: ""
    });

    // Mobile collapsible state for group groupings
    let collapsedGroups = $state(new Set<string>());

    // Web view toggle (table or card)
    let webViewMode = $state<"table" | "card">("table");

    // Real Data
    let members = $state<any[]>([]);
    let groupOptions = $state<string[]>([]);
    let groupsMap = $state<Record<string, any>>({});

    // Selection state for exports / batch operations
    let selectedMemberIds = $state<Set<string>>(new Set());
    let selectAllFiltered = $state(false);

    function toggleSelectMember(id: string) {
        const newSet = new Set(selectedMemberIds);
        if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
        selectedMemberIds = newSet;
        // update selectAllFiltered flag
        selectAllFiltered = filteredMembers().every(m => newSet.has(m.id));
    }

    function toggleSelectAllFiltered() {
        if (selectAllFiltered) {
            // unselect all filtered
            const newSet = new Set(selectedMemberIds);
            filteredMembers().forEach(m => newSet.delete(m.id));
            selectedMemberIds = newSet;
            selectAllFiltered = false;
        } else {
            const newSet = new Set(selectedMemberIds);
            filteredMembers().forEach(m => newSet.add(m.id));
            selectedMemberIds = newSet;
            selectAllFiltered = true;
        }
    }

    // Delete dialog state
    let showDeleteDialog = $state(false);
    let memberToDelete: string | null = $state(null);
    let memberToDeleteName: string | null = $state(null);

    function openDeleteDialog(member: any) {
        memberToDelete = member.id;
        memberToDeleteName = member.name;
        showDeleteDialog = true;
    }

    async function confirmDeleteMember() {
        if (!memberToDelete) return;
        const id = memberToDelete;
        const name = memberToDeleteName || id;

        const { error } = await supabase.from('members').delete().eq('member_id', id);
        if (error) {
            console.error('Delete error:', error);
            const msg = getErrorMessage(error);
            const title = getErrorTitle(error);
            toast.error(`${title}: ${msg}`);
            showDeleteDialog = false;
            memberToDelete = null;
            memberToDeleteName = null;
            return;
        }

        await fetchMembers();
        toast.success(`Deleted ${name}`);
        showDeleteDialog = false;
        memberToDelete = null;
        memberToDeleteName = null;
    }

    let groupItems = $derived(groupOptions.map(group => ({
        value: group,
        label: group
    })));

    const groupTriggerContent = $derived(
        groupItems.find((g) => g.value === formData.group)?.label ?? "Select Group..."
    );

    let searchQuery = $state("");

    // Group filter state
    let selectedGroups = $state(new Set<string>());

    onMount(async () => {
        isLoading = true;
        try {
            await fetchGroups();
            await fetchMembers();
        } finally {
            isLoading = false;
        }
    });

    async function fetchGroups() {
        const { data, error } = await supabase.from('groups').select('*');
        if (data) {
            // Sort groups alphabetically
            const sortedGroups = data.sort((a, b) => a.group_code.localeCompare(b.group_code));
            
            groupOptions = sortedGroups.map(g => g.group_code);
            groupsMap = sortedGroups.reduce((acc, g) => ({...acc, [g.group_code]: g}), {});
            
            // Add 'Unassigned' if not present (handled dynamically in fetchMembers)
            selectedGroups = new Set(groupOptions);
        }
    }

    async function fetchMembers() {
        const { data, error } = await supabase.from('members').select('*, groups(*)');
        if (data) {
            let hasUnassigned = false;
            
            members = data.map(m => {
                const grp = m.groups?.group_code || "Unassigned";
                if (grp === "Unassigned") hasUnassigned = true;
                
                return {
                    id: m.member_id, // Use string ID for internal ref
                    firstName: m.first_name,
                    lastName: m.last_name,
                    name: `${m.first_name} ${m.last_name}`,
                    email: m.metadata?.email || "No email",
                    role: m.metadata?.role || "Member",
                    group: grp,
                    qrId: m.member_id,
                    status: m.metadata?.status || "Active",
                    avatar: m.metadata?.avatar || ""
                };
            });

            // Dynamically add Unassigned to filters if needed
            if (hasUnassigned && !groupOptions.includes("Unassigned")) {
                groupOptions = [...groupOptions, "Unassigned"];
                selectedGroups.add("Unassigned");
                selectedGroups = new Set(selectedGroups); // Trigger reactivity
            }
        } else if (error) {
            console.error("Error fetching members:", error);
        }
    }


    // Sort state
    let sortColumn = $state("name");
    let sortDirection = $state<"asc" | "desc">("asc");

    let filteredMembers = $derived(() => {
        let filtered = members.filter(m => 
            (m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (m.email && m.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
            m.group.toLowerCase().includes(searchQuery.toLowerCase())) &&
            selectedGroups.has(m.group)
        );

        // Sort the filtered results
        return filtered.sort((a, b) => {
            let aValue: string | number;
            let bValue: string | number;

            switch (sortColumn) {
                case "name":
                    aValue = a.name.toLowerCase();
                    bValue = b.name.toLowerCase();
                    break;
                case "group":
                    aValue = a.group.toLowerCase();
                    bValue = b.group.toLowerCase();
                    break;
                case "id":
                    aValue = a.qrId.toLowerCase();
                    bValue = b.qrId.toLowerCase();
                    break;
                case "status":
                    aValue = a.status.toLowerCase();
                    bValue = b.status.toLowerCase();
                    break;
                default:
                    return 0;
            }

            if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
            if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
            return 0;
        });
    });

    // Statistics for web
    let statistics = $derived({
        total: members.length,
        active: members.filter(m => m.status === "Active").length,
        byGroup: groupOptions.map(g => ({
            name: g,
            count: members.filter(m => m.group === g).length
        }))
    });

    // Group members by their group
    let groupedMembers = $derived(() => {
        const groups: Record<string, typeof members> = {};
        filteredMembers().forEach(m => {
            if (!groups[m.group]) groups[m.group] = [];
            groups[m.group].push(m);
        });
        return groups;
    });

    // Track window size for mobile view
    $effect.pre(() => {
        if (typeof window !== 'undefined') {
            const handleResize = () => {
                isMobileView = window.innerWidth < 768;
            };
            window.addEventListener('resize', handleResize);
            return () => window.removeEventListener('resize', handleResize);
        }
    });

    // Generate QR code when member is selected
    $effect.pre(() => {
        if (selectedMemberForQr) {
            QRCode.toDataURL(selectedMemberForQr.qrId, {
                errorCorrectionLevel: 'H',
                margin: 1,
                width: 300,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            }).then(dataUrl => {
                qrCodeDataUrl = dataUrl;
            }).catch(error => {
                console.error('Error generating QR code:', error);
            });
        }
    });

    const groupColors: Record<string, string> = {
        "ENGINEERING": "border-primary",
        "PRODUCT DESIGN": "border-orange-500",
        "MARKETING": "border-purple-500"
    };

    async function handleAddMember() {
        // Validate form
        if (!formData.lastName || !formData.firstName || !formData.group) {
            alert("Please fill in all required fields");
            return;
        }

        // 1. Get Group Info
        const groupObj = groupsMap[formData.group];
        if (!groupObj) {
            alert("Invalid Group");
            return;
        }
        
        // 2. Generate Unique ID in format: BBCT-{groupId}-{overallSequentialNumber}
        const groupId = groupObj.group_id;
        let qrId: string | null = null;
        let attempt = 0;

        while (attempt < 5) {
            // Find all members and get the highest overall number (third segment)
            const { data: allMembers, error: fetchErr } = await supabase
                .from('members')
                .select('member_id');

            if (fetchErr) {
                console.error(fetchErr);
                alert('Failed to generate member id');
                return;
            }

            let candidate: string | null = null;

            // Extract the highest number from BBCT-{any}-{number} format
            let maxNumber = 0;
            (allMembers || []).forEach((m: any) => {
                const match = (m.member_id || '').match(/^BBCT-\d+-(\d+)$/);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (!isNaN(num) && num > maxNumber) maxNumber = num;
                }
            });

            const nextNumber = maxNumber + 1;
            candidate = `BBCT-${groupId}-${nextNumber}`;

            if (!candidate) {
                alert('Failed to allocate a member id');
                return;
            }

            // Try insert
            const { error: insertErr } = await supabase.from('members').insert({
                member_id: candidate,
                first_name: formData.firstName,
                last_name: formData.lastName,
                middle_name: formData.middleInitial,
                group_id: groupObj.group_id,
                metadata: {
                    role: 'Member',
                    status: 'Active',
                    email: ''
                }
            });

            if (!insertErr) {
                qrId = candidate;
                break;
            }

            // On duplicate, increment attempt and retry
            const msg = (insertErr as any).message || '';
            if ((insertErr as any).code === '23505' || /duplicate/.test(msg)) {
                attempt++;
                continue;
            } else {
                console.error(insertErr);
                alert('Failed to add member');
                return;
            }
        }

        if (!qrId) {
            alert('Failed to allocate a unique member id; please try again');
            return;
        }

        // 4. Refresh List
        await fetchMembers();

        // Reset form and close modal/drawer
        formData = {
            lastName: "",
            firstName: "",
            middleInitial: "",
            group: ""
        };
        showAddMemberModal = false;
        showAddMemberDrawer = false;
    }

    function handleMiddleInitialChange(e: Event) {
        const input = e.target as HTMLInputElement;
        formData.middleInitial = input.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1);
    }

    function getInitials(name: string) {
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }

    function handleSort(column: string) {
        if (sortColumn === column) {
            sortDirection = sortDirection === "asc" ? "desc" : "asc";
        } else {
            sortColumn = column;
            sortDirection = "asc";
        }
    }

    function openQrModal(member: typeof members[0]) {
        selectedMemberForQr = member;
        showQrModal = true;
    }

    function openAddMemberModal() {
        formData = {
            lastName: "",
            firstName: "",
            middleInitial: "",
            group: ""
        };
        selectedMemberForEdit = null;
        showAddMemberModal = true;
        // Ensure inputs are cleared and focus first field to prevent browser autofill popups
        requestAnimationFrame(() => {
            const input = document.getElementById('lastName') as HTMLInputElement | null;
            if (input) {
                input.value = '';
                input.focus();
            }
        });
    }

    function openAddMemberDrawer() {
        formData = {
            lastName: "",
            firstName: "",
            middleInitial: "",
            group: ""
        };
        selectedMemberForEdit = null;
        showAddMemberDrawer = true;
        // Clear and focus first input to avoid autofill/persistence
        requestAnimationFrame(() => {
            const input = document.getElementById('lastNameMobile') as HTMLInputElement | null;
            if (input) {
                input.value = '';
                input.focus();
            }
        });
    }

    function openEditModal(member: typeof members[0]) {
        selectedMemberForEdit = member;
        // Use stored parts if available, else split name
        formData = {
            firstName: member.firstName || member.name.split(' ')[0],
            lastName: member.lastName || member.name.split(' ').slice(1).join(' '),
            middleInitial: "",
            group: member.group
        };
        showEditMemberModal = true;
    }

    function openEditDrawer(member: typeof members[0]) {
        selectedMemberForEdit = member;
        formData = {
            firstName: member.firstName || member.name.split(' ')[0],
            lastName: member.lastName || member.name.split(' ').slice(1).join(' '),
            middleInitial: "",
            group: member.group
        };
        showEditMemberDrawer = true;
    }

    // Reset edit state (clear form and selected member)
    function resetEditState() {
        selectedMemberForEdit = null;
        formData = {
            lastName: "",
            firstName: "",
            middleInitial: "",
            group: ""
        };
    }

    // Ensure edit state is cleared when edit modal/drawer closes without saving
    $effect(() => {
        if (!showEditMemberModal && !showEditMemberDrawer) {
            // Use a microtask to allow other state changes to settle
            Promise.resolve().then(() => resetEditState());
        }
    });

    async function handleEditMember() {
        if (!formData.lastName || !formData.firstName || !formData.group) {
            alert("Please fill in all required fields");
            return;
        }

        if (!selectedMemberForEdit) return;

        const groupObj = groupsMap[formData.group];
        
        const { error } = await supabase
            .from('members')
            .update({
                first_name: formData.firstName,
                last_name: formData.lastName,
                middle_name: formData.middleInitial,
                group_id: groupObj?.group_id
            })
            .eq('member_id', selectedMemberForEdit.id);

        if (error) {
            console.error(error);
            alert("Failed to update member");
            return;
        }

        await fetchMembers();

        // Reset form and close modals
        formData = {
            lastName: "",
            firstName: "",
            middleInitial: "",
            group: ""
        };
        selectedMemberForEdit = null;
        showEditMemberModal = false;
        showEditMemberDrawer = false;
    }

    async function downloadQr(type: "qr-only" | "qr-details") {
        if (!selectedMemberForQr) return;

        try {
            // Get current settings
            const settings = {
                qrHeaderTitle: $systemSettings.qrHeaderTitle || 'Organization Name',
                qrSubheaderTitle: $systemSettings.qrSubheaderTitle || 'Tagline or Subtitle',
                qrCardColor: $systemSettings.qrCardColor || '#275032',
                qrBackgroundImage: $systemSettings.qrBackgroundImage || ''
            };

            // Generate QR Code Data URL
            const qrDataUrl = await QRCode.toDataURL(selectedMemberForQr.qrId, {
                errorCorrectionLevel: 'H',
                margin: 0,
                width: 500,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            });

            const filename = `${selectedMemberForQr.qrId}${type === "qr-details" ? "-details" : ""}.png`;

            if (type === "qr-only") {
                const a = document.createElement('a');
                a.href = qrDataUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                return;
            }
            
            // Create a canvas to draw the QR code with details
            const canvas = document.createElement('canvas');
             // Card Dimensions (1080x1080)
            canvas.width = 1080;
            canvas.height = 1080;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // 1. Draw Background Information
            // Try to load the background image from settings or fallback to a color
            const padding = 40;
            
            // Fill white first
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Try loading background image from settings
            if (settings.qrBackgroundImage) {
                try {
                    // Extract filename from URL
                    const fileName = settings.qrBackgroundImage.split('/').pop();
                    if (!fileName) throw new Error('Invalid image URL');
                    
                    // Download from Supabase using authenticated client
                    const { data, error: dlError } = await supabase.storage
                        .from('qr-background')
                        .download(fileName);
                    
                    if (dlError || !data) throw new Error(dlError?.message || 'Failed to download');
                    
                    // Convert blob to data URL
                    const dataUrl = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(data);
                    });
                    
                    const bgImg = new Image();
                    bgImg.src = dataUrl;
                    await new Promise((resolve, reject) => {
                        bgImg.onload = resolve;
                        bgImg.onerror = reject;
                    });
                    
                    // Draw Image (Cover)
                    const scale = Math.max(canvas.width / bgImg.width, canvas.height / bgImg.height);
                    const x = (canvas.width / 2) - (bgImg.width / 2) * scale;
                    const y = (canvas.height / 2) - (bgImg.height / 2) * scale;
                    ctx.drawImage(bgImg, x, y, bgImg.width * scale, bgImg.height * scale);
                } catch (e) {
                    console.warn('Failed to load background image, using fallback', e);
                    // Fallback background if image fails
                    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
                    grad.addColorStop(0, '#e2e8f0');
                    grad.addColorStop(1, '#94a3b8');
                    ctx.fillStyle = grad;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
            } else {
                // Default gradient when no background image
                const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
                grad.addColorStop(0, '#e2e8f0');
                grad.addColorStop(1, '#94a3b8');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            // 1.5 Draw Header Text
            const fontColor = settings.qrCardColor;
            ctx.textAlign = 'center';
            
            // Main Header
            ctx.font = 'bold 60px Inter, sans-serif';
            ctx.fillStyle = fontColor;
            ctx.fillText(settings.qrHeaderTitle, canvas.width / 2, 100);

            // Subheader
            ctx.font = 'italic 500 36px "Times New Roman", Times, serif';
            ctx.fillStyle = fontColor;
            ctx.fillText(settings.qrSubheaderTitle, canvas.width / 2, 150);

            // 2. Draw QR Code Container
            // Container size
            const containerSize = 650;
            const containerX = (canvas.width - containerSize) / 2;
            const containerY = 220;
            const containerRadius = 30;

            // Save context for rounded border
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(containerX, containerY, containerSize, containerSize, containerRadius);
            
            // Draw white background
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            
            // Draw green border
            ctx.lineWidth = 4;
            ctx.strokeStyle = fontColor;
            ctx.stroke();

            // Load QR Image
            const qrImg = new Image();
            qrImg.src = qrDataUrl;
            await new Promise(resolve => qrImg.onload = resolve);

            // Draw QR Code centered in the container
            // QR should be slightly smaller than container
            const qrSize = 520; // 650 - (2 * 65 padding)
            const qrPadding = (containerSize - qrSize) / 2;
            
            ctx.drawImage(qrImg, containerX + qrPadding, containerY + qrPadding, qrSize, qrSize);
            
            ctx.restore();


            // 3. Draw Footer Text (Bottom)
            ctx.textAlign = 'center';
            
            // Name (Bigger, Uppercase)
            ctx.font = 'bold 72px Inter, sans-serif'; 
            ctx.fillStyle = settings.qrCardColor;
            ctx.fillText(selectedMemberForQr.name.toUpperCase(), canvas.width / 2, 970);

            // ID (Smaller)
            ctx.font = 'bold 40px Inter, sans-serif';
            ctx.fillStyle = settings.qrCardColor;
            ctx.fillText(selectedMemberForQr.qrId, canvas.width / 2, 1030);


            // Download
            canvas.toBlob((blob) => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
            });
        } catch (err) {
            console.error("Failed to generate QR", err);
            alert("Could not generate QR code. Please try again.");
        }
    }

    // --- Export helpers ---
    function getExportRecords() {
        const chosen = selectedMemberIds && selectedMemberIds.size > 0
            ? members.filter(m => selectedMemberIds.has(m.id))
            : filteredMembers();

        return chosen.map(m => ({
            member_id: m.qrId || m.id,
            first_name: m.firstName || m.name.split(' ')[0],
            last_name: m.lastName || m.name.split(' ').slice(1).join(' '),
            group: m.group,
            email: m.email,
            status: m.status,
            created_at: m.created_at
        }));
    }

    function exportMembersCSVHandler() {
        const recs = getExportRecords();
        if (recs.length === 0) return alert('No members to export');
        exportMembersToCSV(recs);
    }

    function exportMembersPDFHandler() {
        const recs = getExportRecords();
        if (recs.length === 0) return alert('No members to export');
        exportMembersToPDF(recs);
    }

    async function exportMembersQRZipHandler() {
        const recs = getExportRecords();
        if (recs.length === 0) return alert('No members to export');
        // show temporary toast/loading
        const id = toast.loading('Preparing ZIP...');
        try {
            // Pre-fetch and convert background image to data URL to avoid fetch issues in utility
            let bgDataUrl: string | undefined;
            if ($systemSettings.qrBackgroundImage) {
                try {
                    const fileName = $systemSettings.qrBackgroundImage.split('/').pop();
                    if (fileName) {
                        const { data, error } = await supabase.storage
                            .from('qr-background')
                            .download(fileName);
                        if (!error && data) {
                            bgDataUrl = await new Promise<string>((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onload = () => resolve(reader.result as string);
                                reader.onerror = reject;
                                reader.readAsDataURL(data);
                            });
                        }
                    }
                } catch (e) {
                    console.warn('Could not pre-fetch background image for ZIP', e);
                }
            }

            const mod: any = await import('$lib/utils/membersExport');
            await mod.exportMembersQRZip(recs, {
                siteName: $systemSettings.qrHeaderTitle || $systemSettings.siteName,
                subheader: $systemSettings.qrSubheaderTitle,
                qrCardColor: $systemSettings.qrCardColor,
                qrBackgroundImage: bgDataUrl || $systemSettings.qrBackgroundImage
            });
            toast.success('ZIP ready', { id });
        } catch (err) {
            toast.error('Failed to create ZIP', { id });
        }
    }
</script>

{#if isLoading}
    <FullPageLoading message="Synchronizing members list..." />
{:else}
<!-- Mobile View -->
<div class="md:hidden flex flex-col min-h-screen bg-background pb-20 mt-2">

    <!-- Search & Add -->
    <div class="px-4 py-2 flex items-center gap-3">
        <div class="relative flex-1">
            <Search class="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground-mobile" size={20} />
            <input 
                type="text" 
                placeholder="Search members..." 
                bind:value={searchQuery}
                class="w-full bg-card/20 border-2 border-border/20 rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:border-primary ring-primary/20 outline-none placeholder-muted-foreground-mobile"
            />
        </div>
        <button aria-label="Add member" onclick={() => showAddMemberDrawer = true} class="bg-primary aspect-square h-14 flex items-center justify-center rounded-[22px] shadow-lg shadow-primary/10 active:scale-95 transition-all">
            <UserPlus size={26} class="text-primary-foreground" />
        </button>
    </div>

    <!-- Stats & Filter -->
    <div class="px-4 py-6 flex items-end justify-between">
        <div>
            <span class="text-[10px] font-black tracking-[0.15em] text-muted-foreground/60 uppercase">Total Members</span>
            <div class="flex items-baseline gap-2 mt-1">
                <span class="text-4xl font-black tracking-tight">{members.length}</span>
                <span class="text-[13px] font-bold" style="color: var(--stat-accent)">+12 this week</span>
            </div>
        </div>
        <button class="flex items-center gap-2 bg-card/40 border border-border/10 px-5 py-3 rounded-2xl text-sm font-bold text-muted-foreground/80 active:scale-95 transition-all">
            <Filter size={18} />
            <span>Filter</span>
        </button>
    </div>

    <!-- Grouped List -->
    <div class="flex-1 px-4 py-4 space-y-8">
        {#each Object.entries(groupedMembers()) as [groupName, groupMembers]}
            <Collapsible.Root open={!collapsedGroups.has(groupName)} onOpenChange={(open) => {
                if (open) {
                    collapsedGroups.delete(groupName);
                } else {
                    collapsedGroups.add(groupName);
                }
                collapsedGroups = new Set(collapsedGroups);
            }}>
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2 mb-4">
                        <div class="w-1 h-4 rounded-full {groupColors[groupName] || 'bg-muted'} border-l-4"></div>
                        <h2 class="text-xs font-bold tracking-wider text-muted-foreground uppercase">{groupName}</h2>
                        <span class="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground/70">{groupMembers.length}</span>
                    </div>
                    <Collapsible.Trigger class="p-1 text-muted-foreground hover:text-foreground active:scale-75 transition-all duration-150">
                        <ChevronRight class="h-4 w-4 transform transition-transform {!collapsedGroups.has(groupName) ? 'rotate-90' : ''}" />
                    </Collapsible.Trigger>
                </div>

                <Collapsible.Content class="space-y-3">
                    {#each groupMembers as member}
                        <button 
                            onclick={() => openEditDrawer(member)} 
                            class="w-full bg-card/40 border border-border/40 rounded-2xl p-4 flex items-center justify-between group active:scale-[0.98] hover:bg-card/60 hover:border-border/60 transition-all text-left"
                        >
                            <div class="flex items-center gap-4 flex-1">
                                <div class="relative">
                                    {#if member.avatar}
                                        <img src={member.avatar} alt={member.name} class="w-12 h-12 rounded-2xl object-cover" />
                                    {:else}
                                        <div class="w-12 h-12 rounded-2xl bg-linear-to-br from-primary/10 to-primary/30 flex items-center justify-center text-primary font-bold text-lg border border-primary/20">
                                            {getInitials(member.name)}
                                        </div>
                                    {/if}
                                    <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-background rounded-full flex items-center justify-center">
                                        <div class="w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background"></div>
                                    </div>
                                </div>
                                
                                <div class="min-w-0">
                                    <h3 class="font-bold text-foreground leading-tight truncate">{member.name}</h3>
                                    <div class="flex items-center gap-2 mt-0.5">

                                        <span class="text-[10px] text-primary font-mono bg-primary/5 px-1.5 py-0.5 rounded shrink-0">{member.qrId}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div 
                                role="button"
                                tabindex="0"
                                onclick={(e) => {
                                    e.stopPropagation();
                                    openQrModal(member);
                                }}
                                onkeydown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        openQrModal(member);
                                    }
                                }}
                                class="p-2 text-muted-foreground hover:text-foreground active:scale-90 transition-transform shrink-0 cursor-pointer"
                            >
                                <QrCode size={18} />
                            </div>
                        </button>
                    {/each}
                </Collapsible.Content>
            </Collapsible.Root>
        {:else}
            <div class="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <div class="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 opacity-20">
                    <Search size={32} />
                </div>
                <p>No members found matching "{searchQuery}"</p>
            </div>
        {/each}
    </div>
</div>

<!-- Desktop View -->
<div class="hidden md:flex flex-col gap-6 p-6 lg:p-8 max-w-7xl mx-auto">
    <!-- Page Header -->
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-3xl font-bold tracking-tight">Members</h1>
            <p class="text-muted-foreground mt-1">Manage your congregation and attendees.</p>
        </div>
        <div class="flex gap-2">
            <DropdownMenu>
                <DropdownMenuTrigger>
                    <Button variant="outline" size="sm" class="hidden sm:flex">
                        <FileDown class="mr-2 h-4 w-4" /> Export
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Export Members</DropdownMenuLabel>
                    <DropdownMenuItem onclick={() => exportMembersCSVHandler()}>CSV</DropdownMenuItem>
                    <DropdownMenuItem onclick={() => exportMembersPDFHandler()}>PDF</DropdownMenuItem>
                    <DropdownMenuItem onclick={() => exportMembersQRZipHandler()}>QR + Details (ZIP)</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onclick={openAddMemberModal}>
                <Plus class="mr-2 h-4 w-4" /> Add Member
            </Button>
        </div>
    </div>

    <!-- Statistics Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
            <CardContent class="p-6">
                <div class="flex items-start justify-between">
                    <div>
                        <p class="text-sm text-muted-foreground font-medium">Total Members</p>
                        <p class="text-3xl font-bold mt-2">{statistics.total}</p>
                        <p class="text-xs text-green-600 mt-2">+12% from last month</p>
                    </div>
                    <div class="p-3 bg-primary/10 rounded-lg">
                        <Users class="h-6 w-6 text-primary" />
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card>
            <CardContent class="p-6">
                <div class="flex items-start justify-between">
                    <div>
                        <p class="text-sm text-muted-foreground font-medium">Active Members</p>
                        <p class="text-3xl font-bold mt-2">{statistics.active}</p>
                        <p class="text-xs text-green-600 mt-2">{Math.round((statistics.active / statistics.total) * 100)}% active</p>
                    </div>
                    <div class="p-3 bg-green-500/10 rounded-lg">
                        <TrendingUp class="h-6 w-6 text-green-600" />
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card>
            <CardContent class="p-6">
                <div class="flex items-start justify-between">
                    <div>
                        <p class="text-sm text-muted-foreground font-medium">Groups</p>
                        <p class="text-3xl font-bold mt-2">{groupOptions.length}</p>
                        <p class="text-xs text-muted-foreground mt-2">Teams organized</p>
                    </div>
                    <div class="p-3 bg-blue-500/10 rounded-lg">
                        <Clock class="h-6 w-6 text-blue-600" />
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>

    <!-- Search, Filters & View Toggle -->
    <div class="flex items-center gap-4">
        <div class="relative flex-1 max-w-sm">
            <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
                type="search"
                placeholder="Search members..."
                class="pl-8 border-2 border-border/20 rounded-lg focus:ring-2 focus:border-primary ring-primary/20"
                bind:value={searchQuery}
            />
        </div>

        <!-- Filter Chips -->
        <div class="flex items-center gap-2">
            {#each groupOptions as group}
                <button
                    onclick={() => {
                        if (selectedGroups.has(group)) {
                            selectedGroups.delete(group);
                        } else {
                            selectedGroups.add(group);
                        }
                        selectedGroups = new Set(selectedGroups);
                    }}
                    class="px-3 py-1.5 rounded-full text-sm font-medium transition-all {selectedGroups.has(group) 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'}"
                >
                    {group}
                </button>
            {/each}
        </div>

        <!-- View Toggle -->
        <div class="flex items-center gap-2 border border-border/20 rounded-lg p-1 ml-auto">
            <button
                onclick={() => (webViewMode = "table")}
                class="p-2 rounded transition-all {webViewMode === 'table' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}"
                title="Table view"
            >
                <Rows class="h-4 w-4" />
            </button>
            <button
                onclick={() => (webViewMode = "card")}
                class="p-2 rounded transition-all {webViewMode === 'card' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}"
                title="Card view"
            >
                <Grid3x3 class="h-4 w-4" />
            </button>
        </div>
    </div>

    <!-- Table View -->
    {#if webViewMode === "table"}
        <div class="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
            <Table.Root class="table-fixed w-full">
                <Table.Header>
                    <Table.Row class="border-b">
                        <Table.Head class="w-12">
                            <input type="checkbox" checked={selectAllFiltered} onchange={toggleSelectAllFiltered} aria-label="Select all filtered" />
                        </Table.Head>
                        <Table.Head class="w-12"></Table.Head>
                        <Table.Head class="w-40">
                            <Button variant="ghost" class="h-auto p-0 font-semibold hover:bg-transparent" onclick={() => handleSort("name")}>
                                Name
                                {#if sortColumn === "name"}
                                    {#if sortDirection === "asc"}
                                        <ArrowUp class="ml-2 h-4 w-4" />
                                    {:else}
                                        <ArrowDown class="ml-2 h-4 w-4" />
                                    {/if}
                                {:else}
                                    <ArrowUpDown class="ml-2 h-4 w-4 opacity-40" />
                                {/if}
                            </Button>
                        </Table.Head>
                        <Table.Head class="w-32">
                            <Button variant="ghost" class="h-auto p-0 font-semibold hover:bg-transparent" onclick={() => handleSort("group")}>
                                Group
                                {#if sortColumn === "group"}
                                    {#if sortDirection === "asc"}
                                        <ArrowUp class="ml-2 h-4 w-4" />
                                    {:else}
                                        <ArrowDown class="ml-2 h-4 w-4" />
                                    {/if}
                                {:else}
                                    <ArrowUpDown class="ml-2 h-4 w-4 opacity-40" />
                                {/if}
                            </Button>
                        </Table.Head>
                        <Table.Head class="w-24">ID</Table.Head>
                        <Table.Head class="w-20">Status</Table.Head>
                        <Table.Head class="w-16 text-right">Actions</Table.Head>
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {#if filteredMembers().length === 0}
                        <Table.Row>
                            <Table.Cell colspan={6} class="h-24 text-center text-muted-foreground">
                                <div class="flex flex-col items-center justify-center">
                                    <Search class="h-8 w-8 mb-2 opacity-20" />
                                    No members found. Try adjusting your filters.
                                </div>
                            </Table.Cell>
                        </Table.Row>
                    {:else}
                        {#each filteredMembers() as member (member.id)}
                            <Table.Row class="hover:bg-muted/50 transition-colors">
                                <Table.Cell>
                                    <input type="checkbox" checked={selectedMemberIds.has(member.id)} onchange={() => toggleSelectMember(member.id)} aria-label={`Select ${member.name}`} />
                                </Table.Cell>
                                <Table.Cell>
                                    <Avatar class="h-8 w-8">
                                        <AvatarImage src={member.avatar} alt={member.name} />
                                        <AvatarFallback class="text-xs">{getInitials(member.name)}</AvatarFallback>
                                    </Avatar>
                                </Table.Cell>
                                <Table.Cell class="font-medium">{member.name}</Table.Cell>
                                <Table.Cell>
                                    <div class="flex items-center gap-2">
                                        <div class="w-2 h-2 rounded-full {groupColors[member.group] || 'bg-muted'}"></div>
                                        <span class="text-sm font-medium">{member.group}</span>
                                    </div>
                                </Table.Cell>
                                <Table.Cell>
                                    <Badge variant="outline" class="font-mono text-xs">{member.qrId}</Badge>
                                </Table.Cell>
                                <Table.Cell>
                                    <Badge class={member.status === "Active" ? "bg-green-500/10 text-green-700 border-green-200" : "bg-muted"}>
                                        {member.status}
                                    </Badge>
                                </Table.Cell>
                                <Table.Cell class="text-right">
                                    <div class="flex items-center justify-end gap-2">
                                        <Button variant="ghost" size="sm" class="h-8 w-8 p-0" onclick={() => openQrModal(member)}>
                                            <QrCode class="h-4 w-4" />
                                        </Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger>
                                                {#snippet child({ props })}
                                                    <Button {...props} variant="ghost" size="sm" class="h-8 w-8 p-0">
                                                        <MoreHorizontal class="h-4 w-4" />
                                                    </Button>
                                                {/snippet}
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                <DropdownMenuItem onclick={() => openEditModal(member)}>Edit</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem class="text-red-500" onclick={() => openDeleteDialog(member)}>Delete</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </Table.Cell>
                            </Table.Row>
                        {/each}
                    {/if}
                </Table.Body>
            </Table.Root>
        </div>
    {/if}

    <!-- Card View -->
    {#if webViewMode === "card"}
        {#if filteredMembers().length === 0}
            <div class="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Search class="h-12 w-12 mb-4 opacity-20" />
                <p class="font-medium">No members found</p>
                <p class="text-sm">Try adjusting your search or filters</p>
            </div>
        {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {#each filteredMembers() as member (member.id)}
                    <Card class="hover:shadow-md hover:border-primary/50 transition-all">
                        <CardContent class="p-6">
                            <div class="flex items-start justify-between mb-4">
                                <Avatar class="h-12 w-12">
                                    <AvatarImage src={member.avatar} alt={member.name} />
                                    <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                                </Avatar>
                                <div class="flex gap-1">
                                    <Button variant="ghost" size="sm" class="h-8 w-8 p-0" onclick={() => openQrModal(member)}>
                                        <QrCode class="h-4 w-4" />
                                    </Button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger>
                                            {#snippet child({ props })}
                                                <Button {...props} variant="ghost" size="sm" class="h-8 w-8 p-0">
                                                    <MoreHorizontal class="h-4 w-4" />
                                                </Button>
                                            {/snippet}
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                            <DropdownMenuItem onclick={() => openEditModal(member)}>Edit</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem class="text-red-500" onclick={() => openDeleteDialog(member)}>Delete</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                            <h3 class="font-semibold text-lg">{member.name}</h3>
                            <p class="text-sm text-muted-foreground">{member.role}</p>
                            <div class="flex items-center gap-2 mt-3">
                                <div class="w-2 h-2 rounded-full {groupColors[member.group] || 'bg-muted'}"></div>
                                <span class="text-xs font-medium">{member.group}</span>
                            </div>
                            <p class="text-xs text-muted-foreground mt-2">{member.email}</p>
                            <div class="flex items-center justify-between mt-4 pt-4 border-t">
                                <Badge variant="outline" class="font-mono text-xs">{member.qrId}</Badge>
                                <Badge class={member.status === "Active" ? "bg-green-500/10 text-green-700 border-green-200" : "bg-muted"}>
                                    {member.status}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                {/each}
            </div>
        {/if}
    {/if}
</div>

<!-- Add Member Modal - Desktop -->
<div class="hidden md:block">
    <Sheet bind:open={showAddMemberModal}>
        <SheetContent class="sm:max-w-md">
            <SheetHeader>
                <SheetTitle class="flex items-center gap-3">
                    <div class="p-2 bg-primary/10 rounded-lg">
                        <UserPlus size={20} class="text-primary" />
                    </div>
                    ADD MEMBER
                </SheetTitle>
            </SheetHeader>

            <div class="px-4 pb-4">
                <p class="text-sm text-muted-foreground mb-6">Enter details to generate a unique QR ID.</p>

                <!-- Form Fields -->
                <div class="space-y-5">
                    <!-- Last Name -->
                    <div>
                        <Label for="lastName" class="text-xs font-bold tracking-wider uppercase">Last Name</Label>
                        <Input
                            id="lastName"
                            type="text"
                            placeholder="e.g. Doe"
                            bind:value={formData.lastName}
                            class="mt-2 rounded-xl py-3 placeholder-muted-foreground-mobile border-input"
                        />
                    </div>

                    <!-- First Name -->
                    <div>
                        <Label for="firstName" class="text-xs font-bold tracking-wider uppercase">First Name</Label>
                        <Input
                            id="firstName"
                            type="text"
                            placeholder="e.g. John"
                            bind:value={formData.firstName}
                            class="mt-2 rounded-xl py-3 placeholder-muted-foreground-mobile border-input"
                        />
                    </div>

                    <!-- Middle Initial & Group -->
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <Label for="middleInitial" class="text-xs font-bold tracking-wider uppercase">M.I.</Label>
                            <Input
                                id="middleInitial"
                                type="text"
                                placeholder="A"
                                value={formData.middleInitial}
                                onchange={handleMiddleInitialChange}
                                class="mt-2 rounded-xl py-3 text-center font-bold placeholder-muted-foreground-mobile border-input"
                            />
                        </div>
                        <div>
                            <Label for="groupSelect" class="text-xs font-bold tracking-wider uppercase">Group</Label>
                            <div class="mt-2">
                                <Select.Root type="single" bind:value={formData.group}>
                                    <Select.Trigger id="groupSelect" class="w-full h-12 rounded-xl px-4 font-medium flex items-center justify-between">
                                        {groupTriggerContent}
                                    </Select.Trigger>
                                    <Select.Content class="bg-popover border-border/40 rounded-xl">
                                        <Select.Group>
                                            <Select.Label class="text-xs font-bold tracking-wider uppercase px-2 py-1.5 text-muted-foreground/60">Groups</Select.Label>
                                            {#each groupItems as group}
                                                <Select.Item
                                                    value={group.value}
                                                    label={group.label}
                                                    class="rounded-lg focus:bg-primary/10 focus:text-primary transition-colors cursor-pointer"
                                                >
                                                    {group.label}
                                                </Select.Item>
                                            {/each}
                                        </Select.Group>
                                    </Select.Content>
                                </Select.Root>
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex gap-3 mt-8">
                        <Button
                            size="lg"
                            class="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-base"
                            onclick={handleAddMember}
                        >
                            SAVE MEMBER <ChevronRight size={18} class="ml-2" />
                        </Button>
                    </div>
                </div>
            </div>
        </SheetContent>
    </Sheet>
</div>

<!-- Add Member Drawer - Mobile -->
<div class="md:hidden">
    <Drawer bind:open={showAddMemberDrawer}>
        <DrawerContent>
            <DrawerHeader class="flex flex-row items-center justify-between">
                <DrawerTitle class="flex items-center gap-3">
                    <div class="p-2 bg-primary/10 rounded-lg">
                        <UserPlus size={20} class="text-primary" />
                    </div>
                    ADD MEMBER
                </DrawerTitle>
                <DrawerClose>
                    <Button variant="ghost" size="sm" class="h-8 w-8 p-0">
                        <X class="h-4 w-4" />
                    </Button>
                </DrawerClose>
            </DrawerHeader>

            <div class="px-4 pb-4">
                <p class="text-sm text-muted-foreground mb-6">Enter details to generate a unique QR ID.</p>

                <!-- Form Fields -->
                <div class="space-y-5">
                    <!-- Last Name -->
                    <div>
                        <Label for="lastNameMobile" class="text-xs font-bold tracking-wider uppercase">Last Name</Label>
                        <Input
                            id="lastNameMobile"
                            type="text"
                            placeholder="e.g. Doe"
                            bind:value={formData.lastName}
                            class="mt-2 rounded-xl py-3 placeholder-muted-foreground-mobile border-input"
                        />
                    </div>

                    <!-- First Name -->
                    <div>
                        <Label for="firstNameMobile" class="text-xs font-bold tracking-wider uppercase">First Name</Label>
                        <Input
                            id="firstNameMobile"
                            type="text"
                            placeholder="e.g. John"
                            bind:value={formData.firstName}
                            class="mt-2 rounded-xl py-3 placeholder-muted-foreground-mobile border-input"
                        />
                    </div>

                    <!-- Middle Initial & Group -->
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <Label for="middleInitialMobile" class="text-xs font-bold tracking-wider uppercase">M.I.</Label>
                            <Input
                                id="middleInitialMobile"
                                type="text"
                                placeholder="A"
                                value={formData.middleInitial}
                                onchange={handleMiddleInitialChange}
                                class="mt-2 rounded-xl py-3 text-center font-bold placeholder-muted-foreground-mobile border-input"
                            />
                        </div>
                        <div>
                            <Label for="groupSelectMobile" class="text-xs font-bold tracking-wider uppercase">Group</Label>
                            <div class="mt-2">
                                <Select.Root type="single" bind:value={formData.group}>
                                    <Select.Trigger id="groupSelectMobile" class="w-full h-12 rounded-xl px-4 font-medium flex items-center justify-between">
                                        {groupTriggerContent}
                                    </Select.Trigger>
                                    <Select.Content class="bg-popover border-border/40 rounded-xl">
                                        <Select.Group>
                                            <Select.Label class="text-xs font-bold tracking-wider uppercase px-2 py-1.5 text-muted-foreground/60">Groups</Select.Label>
                                            {#each groupItems as group}
                                                <Select.Item
                                                    value={group.value}
                                                    label={group.label}
                                                    class="rounded-lg focus:bg-primary/10 focus:text-primary transition-colors cursor-pointer"
                                                >
                                                    {group.label}
                                                </Select.Item>
                                            {/each}
                                        </Select.Group>
                                    </Select.Content>
                                </Select.Root>
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex gap-3 mt-8">
                        <Button
                            size="lg"
                            class="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-base"
                            onclick={handleAddMember}
                        >
                            SAVE MEMBER <ChevronRight size={18} class="ml-2" />
                        </Button>
                    </div>
                </div>
            </div>
        </DrawerContent>
    </Drawer>
</div>

<!-- Edit Member Sheet - Desktop -->
<div class="hidden md:block">
    <Sheet bind:open={showEditMemberModal}>
        <SheetContent class="sm:max-w-md">
            <SheetHeader>
                <SheetTitle class="flex items-center gap-3">
                    <div class="p-2 bg-primary/10 rounded-lg">
                        <UserPlus size={20} class="text-primary" />
                    </div>
                    EDIT MEMBER
                </SheetTitle>
            </SheetHeader>

            <div class="px-4 pb-4">
                <p class="text-sm text-muted-foreground mb-6">Update member details.</p>

                <!-- Form Fields -->
                <div class="space-y-5">
                    <!-- Last Name -->
                    <div>
                        <Label for="editLastName" class="text-xs font-bold tracking-wider uppercase">Last Name</Label>
                        <Input
                            id="editLastName"
                            type="text"
                            placeholder="e.g. Doe"
                            bind:value={formData.lastName}
                            class="mt-2 rounded-xl py-3 placeholder-muted-foreground-mobile border-input"
                        />
                    </div>

                    <!-- First Name -->
                    <div>
                        <Label for="editFirstName" class="text-xs font-bold tracking-wider uppercase">First Name</Label>
                        <Input
                            id="editFirstName"
                            type="text"
                            placeholder="e.g. John"
                            bind:value={formData.firstName}
                            class="mt-2 rounded-xl py-3 placeholder-muted-foreground-mobile border-input"
                        />
                    </div>

                    <!-- Middle Initial & Group -->
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <Label for="editMiddleInitial" class="text-xs font-bold tracking-wider uppercase">M.I.</Label>
                            <Input
                                id="editMiddleInitial"
                                type="text"
                                placeholder="A"
                                value={formData.middleInitial}
                                onchange={handleMiddleInitialChange}
                                class="mt-2 rounded-xl py-3 text-center font-bold placeholder-muted-foreground-mobile border-input"
                            />
                        </div>
                        <div>
                            <Label for="editGroupSelect" class="text-xs font-bold tracking-wider uppercase">Group</Label>
                            <div class="mt-2">
                                <Select.Root type="single" bind:value={formData.group}>
                                    <Select.Trigger id="editGroupSelect" class="w-full h-12 rounded-xl px-4 font-medium flex items-center justify-between">
                                        {groupTriggerContent}
                                    </Select.Trigger>
                                    <Select.Content class="bg-popover border-border/40 rounded-xl">
                                        <Select.Group>
                                            <Select.Label class="text-xs font-bold tracking-wider uppercase px-2 py-1.5 text-muted-foreground/60">Groups</Select.Label>
                                            {#each groupItems as group}
                                                <Select.Item
                                                    value={group.value}
                                                    label={group.label}
                                                    class="rounded-lg focus:bg-primary/10 focus:text-primary transition-colors cursor-pointer"
                                                >
                                                    {group.label}
                                                </Select.Item>
                                            {/each}
                                        </Select.Group>
                                    </Select.Content>
                                </Select.Root>
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex gap-3 mt-8">
                        <Button
                            size="lg"
                            class="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-base"
                            onclick={handleEditMember}
                        >
                            SAVE CHANGES <ChevronRight size={18} class="ml-2" />
                        </Button>
                    </div>
                </div>
            </div>
        </SheetContent>
    </Sheet>
</div>

<!-- Edit Member Drawer - Mobile -->
<div class="md:hidden">
    <Drawer bind:open={showEditMemberDrawer}>
        <DrawerContent>
            <DrawerHeader class="flex flex-row items-center justify-between">
                <DrawerTitle class="flex items-center gap-3">
                    <div class="p-2 bg-primary/10 rounded-lg">
                        <UserPlus size={20} class="text-primary" />
                    </div>
                    EDIT MEMBER
                </DrawerTitle>
                <div class="flex items-center gap-2">
                    {#if selectedMemberForEdit}
                        <Button variant="ghost" size="sm" class="h-8 w-8 p-0 text-destructive" aria-label="Delete member" onclick={() => openDeleteDialog(selectedMemberForEdit)}>
                            <Trash2 class="h-4 w-4" />
                        </Button>
                    {/if}
                    <DrawerClose>
                        <Button variant="ghost" size="sm" class="h-8 w-8 p-0">
                            <X class="h-4 w-4" />
                        </Button>
                    </DrawerClose>
                </div>
            </DrawerHeader>

            <div class="px-4 pb-4">
                <p class="text-sm text-muted-foreground mb-6">Update member details.</p>

                <!-- Form Fields -->
                <div class="space-y-5">
                    <!-- Last Name -->
                    <div>
                        <Label for="editLastNameMobile" class="text-xs font-bold tracking-wider uppercase">Last Name</Label>
                        <Input
                            id="editLastNameMobile"
                            type="text"
                            placeholder="e.g. Doe"
                            bind:value={formData.lastName}
                            class="mt-2 rounded-xl py-3 placeholder-muted-foreground-mobile border-input"
                        />
                    </div>

                    <!-- First Name -->
                    <div>
                        <Label for="editFirstNameMobile" class="text-xs font-bold tracking-wider uppercase">First Name</Label>
                        <Input
                            id="editFirstNameMobile"
                            type="text"
                            placeholder="e.g. John"
                            bind:value={formData.firstName}
                            class="mt-2 rounded-xl py-3 placeholder-muted-foreground-mobile border-input"
                        />
                    </div>

                    <!-- Middle Initial -->
                    <div>
                        <Label for="editMiddleInitialMobile" class="text-xs font-bold tracking-wider uppercase">M.I.</Label>
                        <Input
                            id="editMiddleInitialMobile"
                            type="text"
                            placeholder="A"
                            value={formData.middleInitial}
                            onchange={handleMiddleInitialChange}
                            class="mt-2 rounded-xl py-3 text-center font-bold placeholder-muted-foreground-mobile border-input"
                        />
                    </div>

                    <!-- Group -->
                    <div>
                        <Label for="editGroupSelectMobile" class="text-xs font-bold tracking-wider uppercase">Group</Label>
                        <div class="mt-2">
                            <Select.Root type="single" bind:value={formData.group}>
                                <Select.Trigger id="editGroupSelectMobile" class="w-full h-12 rounded-xl px-4 font-medium flex items-center justify-between">
                                    {groupTriggerContent}
                                </Select.Trigger>
                                <Select.Content class="bg-popover border-border/40 rounded-xl">
                                    <Select.Group>
                                        <Select.Label class="text-xs font-bold tracking-wider uppercase px-2 py-1.5 text-muted-foreground/60">Groups</Select.Label>
                                        {#each groupItems as group}
                                            <Select.Item
                                                value={group.value}
                                                label={group.label}
                                                class="rounded-lg focus:bg-primary/10 focus:text-primary transition-colors cursor-pointer"
                                            >
                                                {group.label}
                                            </Select.Item>
                                        {/each}
                                    </Select.Group>
                                </Select.Content>
                            </Select.Root>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex gap-3 mt-8">
                        <Button
                            size="lg"
                            class="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-base"
                            onclick={handleEditMember}
                        >
                            SAVE CHANGES <ChevronRight size={18} class="ml-2" />
                        </Button>
                    </div>
                </div>
            </div>
        </DrawerContent>
    </Drawer>
</div>

<!-- QR Modal - Desktop -->
<div class="hidden md:block">
    {#if showQrModal && selectedMemberForQr}
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div class="bg-card rounded-lg shadow-lg p-6 w-full max-w-sm mx-4">
                <!-- Header -->
                <div class="flex items-center justify-between mb-6">
                    <h2 class="text-xl font-bold">QR Code</h2>
                    <button 
                        onclick={() => {
                            showQrModal = false;
                            selectedMemberForQr = null;
                        }}
                        class="p-1 text-muted-foreground hover:text-foreground"
                    >
                        <X class="h-5 w-5" />
                    </button>
                </div>

                <!-- QR Code -->
                <div class="flex justify-center mb-6">
                    {#if qrCodeDataUrl}
                        <img src={qrCodeDataUrl} alt="QR Code" class="w-40 h-40 rounded-lg" />
                    {:else}
                        <div class="w-40 h-40 bg-muted border-4 border-primary/20 rounded-lg flex items-center justify-center">
                            <div class="text-center text-muted-foreground">
                                <QrCode class="h-16 w-16 mx-auto mb-2" />
                                <p class="text-xs">Generating...</p>
                            </div>
                        </div>
                    {/if}
                </div>

                <!-- Member Details -->
                <div class="space-y-3 mb-6 p-4 bg-muted/50 rounded-lg">
                    <div>
                        <p class="text-xs text-muted-foreground uppercase tracking-wide">Name</p>
                        <p class="font-semibold text-foreground">{selectedMemberForQr.name}</p>
                    </div>
                    <div>
                        <p class="text-xs text-muted-foreground uppercase tracking-wide">Group</p>
                        <p class="font-semibold text-foreground">{selectedMemberForQr.group}</p>
                    </div>
                    <div>
                        <p class="text-xs text-muted-foreground uppercase tracking-wide">ID</p>
                        <p class="font-mono font-semibold text-primary">{selectedMemberForQr.qrId}</p>
                    </div>
                </div>

                <!-- Download Section -->
                <div class="space-y-3">
                    <p class="text-sm font-semibold text-muted-foreground">Download</p>
                    <DropdownMenu>
                        <DropdownMenuTrigger>
                            {#snippet child({ props })}
                                <Button 
                                    {...props} 
                                    class="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                    <FileDown class="mr-2 h-4 w-4" />
                                    Download QR
                                </Button>
                            {/snippet}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" class="w-48">
                            <DropdownMenuLabel>Download Format</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onclick={() => downloadQr("qr-only")}>
                                QR Code Only
                            </DropdownMenuItem>
                            <DropdownMenuItem onclick={() => downloadQr("qr-details")}>
                                QR Code + Details
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <!-- Close Button -->
                <Button 
                    variant="outline" 
                    class="w-full mt-4"
                    onclick={() => {
                        showQrModal = false;
                        selectedMemberForQr = null;
                    }}
                >
                    Close
                </Button>
            </div>
        </div>
    {/if}
</div>

<!-- QR Drawer - Mobile Only -->
{#if showQrModal && isMobileView}
    <Drawer bind:open={showQrModal}>
        <DrawerContent>
            <DrawerHeader class="flex flex-row items-center justify-between">
                <DrawerTitle class="flex items-center gap-3">
                    <div class="p-2 bg-primary/10 rounded-lg">
                        <QrCode size={20} class="text-primary" />
                    </div>
                    QR CODE
                </DrawerTitle>
                <DrawerClose>
                    <Button variant="ghost" size="sm" class="h-8 w-8 p-0">
                        <X class="h-4 w-4" />
                    </Button>
                </DrawerClose>
            </DrawerHeader>

            {#if selectedMemberForQr}
                <div class="px-4 pb-4">
                    <!-- QR Code -->
                    <div class="flex justify-center mb-6">
                        {#if qrCodeDataUrl}
                            <img src={qrCodeDataUrl} alt="QR Code" class="w-48 h-48 rounded-lg" />
                        {:else}
                            <div class="w-48 h-48 bg-muted border-4 border-primary/20 rounded-lg flex items-center justify-center">
                                <div class="text-center text-muted-foreground">
                                    <QrCode class="h-20 w-20 mx-auto mb-2" />
                                    <p class="text-xs">Generating...</p>
                                </div>
                            </div>
                        {/if}
                    </div>

                    <!-- Member Details -->
                    <div class="space-y-3 mb-6 p-4 bg-muted/50 rounded-lg">
                        <div>
                            <p class="text-xs text-muted-foreground uppercase tracking-wide">Name</p>
                            <p class="font-semibold text-foreground">{selectedMemberForQr.name}</p>
                        </div>
                        <div>
                            <p class="text-xs text-muted-foreground uppercase tracking-wide">Group</p>
                            <p class="font-semibold text-foreground">{selectedMemberForQr.group}</p>
                        </div>
                        <div>
                            <p class="text-xs text-muted-foreground uppercase tracking-wide">ID</p>
                            <p class="font-mono font-semibold text-primary">{selectedMemberForQr.qrId}</p>
                        </div>
                    </div>

                    <!-- Download Section -->
                    <div class="space-y-3">
                        <p class="text-sm font-semibold text-muted-foreground">Download</p>
                        <DropdownMenu>
                            <DropdownMenuTrigger>
                                {#snippet child({ props })}
                                    <Button 
                                        {...props} 
                                        class="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                                    >
                                        <FileDown class="mr-2 h-4 w-4" />
                                        Download QR
                                    </Button>
                                {/snippet}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center" class="w-48">
                                <DropdownMenuLabel>Download Format</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onclick={() => downloadQr("qr-only")}>
                                    QR Code Only
                                </DropdownMenuItem>
                                <DropdownMenuItem onclick={() => downloadQr("qr-details")}>
                                    QR Code + Details
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <!-- Close Button -->
                    <Button 
                        variant="outline" 
                        class="w-full mt-4"
                        onclick={() => {
                            showQrModal = false;
                            selectedMemberForQr = null;
                        }}
                    >
                        Close
                    </Button>
                </div>
            {/if}
        </DrawerContent>
    </Drawer>
{/if}

<!-- Delete Confirmation -->
<AlertDialog bind:open={showDeleteDialog}>
    <AlertDialogContent>
        <AlertDialogHeader>
            <AlertDialogTitle>Delete Member</AlertDialogTitle>
            <AlertDialogDescription>
                Are you sure you want to permanently delete "{memberToDeleteName}"? This action cannot be undone.
            </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction class="bg-destructive hover:bg-destructive/90" onclick={confirmDeleteMember}>Delete</AlertDialogAction>
        </AlertDialogFooter>
    </AlertDialogContent>
</AlertDialog>
{/if}
