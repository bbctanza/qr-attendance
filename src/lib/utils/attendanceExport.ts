/**
 * Attendance Export Utility
 * Supports CSV and PDF export matches visual style of qr-attendance-bbct
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let jsPDFModule: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let autoTableModule: any = null;

export interface ExportOptions {
	viewMode: 'present' | 'absent';
	selectedMonth: string;
	stats: {
		totalPresent: number;
		totalAbsent: number;
		attendanceRate: number;
	};
	generatedBy?: string;
}

export interface ExportRecord {
	member_id?: string;
	first_name: string;
	last_name: string;
	care_group?: string;
	event_name: string;
	event_date: string; // Service Date
	time?: string;      // Scan Time
}

// Helper for formatting date strings
function formatExportDate(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
        return dateStr;
    }
}

/**
 * Export attendance data to CSV format
 */
export function exportToCSV(
	records: ExportRecord[],
	options: ExportOptions
): void {
	try {
        let csv = '';
        let filename = '';

        if (options.viewMode === 'present') {
            // Header for Present
            csv = 'ID,Member Name,Group,Event Name,Service Date,Scan Time\n';
            records.forEach(record => {
                const name = `"${record.first_name} ${record.last_name}"`;
                const mid = record.member_id || '-';
                const cg = record.care_group || '-';
                const evt = `"${record.event_name}"`;
                const date = formatExportDate(record.event_date);
                const time = record.time || '-';
                csv += `${mid},${name},${cg},${evt},${date},${time}\n`;
            });
            filename = `attendance-present-${options.selectedMonth || 'all'}.csv`;
        } else {
            // Header for Absent
            csv = 'ID,Member Name,Group,Event Name,Service Date\n';
            records.forEach(record => {
                const name = `"${record.first_name} ${record.last_name}"`;
                const mid = record.member_id || '-';
                const cg = record.care_group || '-';
                const evt = `"${record.event_name}"`;
                const date = formatExportDate(record.event_date);
                csv += `${mid},${name},${cg},${evt},${date}\n`;
            });
            filename = `attendance-absent-${options.selectedMonth || 'all'}.csv`;
        }

		// Download CSV
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.style.display = 'none';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);

		const count = records.length;
		alert(`Successfully exported ${count} records to CSV!`);
	} catch (err) {
		console.error('Error exporting CSV:', err);
		alert('Failed to export CSV.');
	}
}

/**
 * Export attendance data to PDF format
 */
export async function exportToPDF(
	records: ExportRecord[],
	options: ExportOptions
): Promise<void> {
	try {
		// Lazy load jsPDF modules if not loaded
		if (!jsPDFModule) {
			jsPDFModule = await import('jspdf');
		}
		if (!autoTableModule) {
			const mod = await import('jspdf-autotable');
			autoTableModule = mod.default;
		}

		const { jsPDF } = jsPDFModule;
		const doc = new jsPDF();
        
        const recordCount = records.length;
        const viewType = options.viewMode === 'present' ? 'Present' : 'Absent';
        
        // Format period text "Month Year" (e.g., February 2026)
        let monthText = options.selectedMonth || 'All Time';
        if (options.selectedMonth && /^\d{4}-\d{2}$/.test(options.selectedMonth)) {
            const [year, month] = options.selectedMonth.split('-');
            const date = new Date(parseInt(year), parseInt(month) - 1);
            monthText = date.toLocaleString('default', { month: 'long', year: 'numeric' });
        }

        const exportDate = new Date().toLocaleDateString();

		// Set title
		doc.setFontSize(18);
		doc.setTextColor(45, 136, 0); // #2d8800
		doc.text(`Attendance ${viewType} Report`, doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });

		// Add metadata
		doc.setFontSize(10);
		doc.setTextColor(102, 102, 102); // #666
		doc.text(`Period: ${monthText}`, doc.internal.pageSize.getWidth() / 2, 30, { align: 'center' });
		doc.text(`Generated: ${exportDate}`, doc.internal.pageSize.getWidth() / 2, 36, { align: 'center' });
		doc.text(`Total Records: ${recordCount}`, doc.internal.pageSize.getWidth() / 2, 42, { align: 'center' });

		// Add statistics boxes
		doc.setFontSize(9);
		const startY = 52;
		const boxWidth = 50;
		const boxHeight = 20;
		const spacing = 10;
		const totalWidth = (boxWidth * 3) + (spacing * 2);
		const startX = (doc.internal.pageSize.getWidth() - totalWidth) / 2;

		// Present box
		doc.setDrawColor(229, 231, 235);
		doc.setLineWidth(0.5);
		doc.rect(startX, startY, boxWidth, boxHeight);
		doc.setTextColor(102, 102, 102);
		doc.text('Total Present', startX + boxWidth / 2, startY + 8, { align: 'center' });
		doc.setFontSize(14);
		doc.setTextColor(45, 136, 0); // Green
		doc.text(options.stats.totalPresent.toString(), startX + boxWidth / 2, startY + 16, { align: 'center' });

		// Absent box
		doc.setFontSize(9);
		doc.rect(startX + boxWidth + spacing, startY, boxWidth, boxHeight);
		doc.setTextColor(102, 102, 102);
		doc.text('Total Absent', startX + boxWidth + spacing + boxWidth / 2, startY + 8, { align: 'center' });
		doc.setFontSize(14);
		doc.setTextColor(220, 38, 38); // Red
		doc.text(options.stats.totalAbsent.toString(), startX + boxWidth + spacing + boxWidth / 2, startY + 16, { align: 'center' });

		// Rate box
		doc.setFontSize(9);
		doc.rect(startX + (boxWidth + spacing) * 2, startY, boxWidth, boxHeight);
		doc.setTextColor(102, 102, 102);
        doc.text('Attendance Rate', startX + (boxWidth + spacing) * 2 + boxWidth / 2, startY + 8, { align: 'center' });
		doc.setFontSize(14);
		doc.setTextColor(37, 99, 235); // Blue
		doc.text(`${options.stats.attendanceRate}%`, startX + (boxWidth + spacing) * 2 + boxWidth / 2, startY + 16, { align: 'center' });

		// Prepare table data
        let tableHeaders: string[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let tableData: any[][];

        if (options.viewMode === 'present') {
            tableHeaders = ['No.', 'ID', 'Member Name', 'Group', 'Event Name', 'Service Date', 'Scan Time'];
            tableData = records.map((r, i) => [
                i + 1,
                r.member_id || '-',
                `${r.first_name} ${r.last_name}`,
                r.care_group || '-',
                r.event_name,
                formatExportDate(r.event_date),
                r.time || '-'
            ]);
        } else {
            tableHeaders = ['No.', 'ID', 'Member Name', 'Group', 'Event Name', 'Service Date'];
            tableData = records.map((r, i) => [
                i + 1,
                r.member_id || '-',
                `${r.first_name} ${r.last_name}`,
                r.care_group || '-',
                r.event_name,
                formatExportDate(r.event_date)
            ]);
        }

		// Add table
        if (autoTableModule) {
            autoTableModule(doc, {
                startY: startY + boxHeight + 10,
                head: [tableHeaders],
                body: tableData,
                theme: 'grid',
                headStyles: {
                    fillColor: [45, 136, 0],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 9
                },
                bodyStyles: {
                    fontSize: 8,
                    textColor: [41, 41, 41]
                },
                alternateRowStyles: {
                    fillColor: [249, 250, 251]
                },
                margin: { top: 10, left: 10, right: 10 },
                styles: {
                    cellPadding: 3,
                    lineColor: [229, 231, 235],
                    lineWidth: 0.1
                }
            });
        } else {
            console.warn('autoTable not available, falling back to simple text');
            // Fallback simplistic rendering
            let y = startY + boxHeight + 15;
            doc.setFontSize(8);
            doc.setTextColor(0,0,0);
            tableData.forEach(row => {
                doc.text(row.join(' | '), 10, y);
                y += 5;
            });
        }

        // Add page footer
        const pageCount = doc.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(153, 153, 153);
        const generatedBy = options.generatedBy || 'System User';
        const systemText = `QR Attendance System • ${new Date().toLocaleString()}`;

        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            const w = doc.internal.pageSize.getWidth();
            const h = doc.internal.pageSize.getHeight();
            const footerY = h - 10;
            
            doc.text(generatedBy, 10, footerY, { align: 'left'});
            doc.text(systemText, w / 2, footerY, { align: 'center' });
            doc.text(`Page ${i} / ${pageCount}`, w - 10, footerY, { align: 'right' });
        }

		// Save PDF
        const filename = `attendance-${options.viewMode}-${options.selectedMonth || 'all'}.pdf`;
		doc.save(filename);

	} catch (err) {
		console.error('Error exporting PDF:', err);
		alert('Failed to generate PDF. Check console for details.');
		throw err;
	}
}