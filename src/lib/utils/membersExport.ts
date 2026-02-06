// Utilities to export member lists to CSV/PDF and generate QR+Details PDF

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let jsPDFModule: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let autoTableModule: any = null;

// Member record structure used for export
export interface MemberExportRecord {
	member_id: string;
	first_name: string;
	last_name: string;
	group?: string;
	email?: string;
	status?: string;
	created_at?: string;
}


function formatDate(dateStr?: string) {
	if (!dateStr) return '-';
	try {
		const d = new Date(dateStr);
		return d.toLocaleDateString();
	} catch { return dateStr; }
}

export function exportMembersToCSV(records: MemberExportRecord[]) {
	try {
		let csv = 'ID,First Name,Last Name,Group,Email,Status,Created At\n';
		records.forEach(r => {
			const id = r.member_id || '-';
			const fn = `"${r.first_name}"`;
			const ln = `"${r.last_name}"`;
			const grp = `"${r.group || '-'}"`;
			const email = `"${r.email || '-'}"`;
			const st = r.status || '-';
			const created = formatDate(r.created_at);
			csv += `${id},${fn},${ln},${grp},${email},${st},${created}\n`;
		});

		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `members-${new Date().toISOString().slice(0,10)}.csv`;
		a.style.display = 'none';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);
		alert(`Successfully exported ${records.length} records to CSV!`);
	} catch (err) {
		console.error('Error exporting members CSV', err);
		alert('Failed to export CSV');
	}
}

export async function exportMembersToPDF(records: MemberExportRecord[]) {
	try {
		if (!jsPDFModule) jsPDFModule = await import('jspdf');
		if (!autoTableModule) {
			const mod = await import('jspdf-autotable');
			autoTableModule = mod.default;
		}
		const { jsPDF } = jsPDFModule;
		const doc = new jsPDF();

		doc.setFontSize(18);
		doc.text('Members Export', doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
		doc.setFontSize(10);
		doc.text(`Generated: ${new Date().toLocaleString()}`, doc.internal.pageSize.getWidth() / 2, 28, { align: 'center' });

		const headers = [['No.', 'ID', 'Name', 'Group', 'Email', 'Status', 'Created']];
		const body = records.map((r, i) => [
			i + 1,
			r.member_id || '-',
			`${r.first_name} ${r.last_name}`,
			r.group || '-',
			r.email || '-',
			r.status || '-',
			formatDate(r.created_at)
		]);

		autoTableModule(doc, {
			startY: 36,
			head: headers,
			body,
			theme: 'grid',
			headStyles: { fillColor: [45,136,0], textColor: [255,255,255] }
		});

		doc.save(`members-${new Date().toISOString().slice(0,10)}.pdf`);
		alert(`Saved PDF with ${records.length} members`);
	} catch (err) {
		console.error('Error exporting members PDF', err);
		alert('Failed to export PDF');
	}
}

export async function exportMembersQRPDF(records: MemberExportRecord[], siteName?: string) {
	try {
		if (!jsPDFModule) jsPDFModule = await import('jspdf');
		const qrcode = await import('qrcode');
		const { jsPDF } = jsPDFModule;
		const doc = new jsPDF({ unit: 'pt', format: 'a4' });

		for (let i = 0; i < records.length; i++) {
			const r = records[i];
			if (i > 0) doc.addPage();

			doc.setFontSize(20);
			doc.setTextColor(45,136,0);
			doc.text(siteName || 'Organization', doc.internal.pageSize.getWidth() / 2, 40, { align: 'center' });

			// Generate QR Data URL
			const qrData = await qrcode.toDataURL(r.member_id || '');
			const x = (doc.internal.pageSize.getWidth() - 210) / 2;
			doc.addImage(qrData, 'PNG', x, 70, 210, 210);

			doc.setFontSize(16);
			doc.setTextColor(0,0,0);
			doc.text(`${r.first_name} ${r.last_name}`, doc.internal.pageSize.getWidth() / 2, 300, { align: 'center' });
			doc.setFontSize(12);
			doc.text(`${r.member_id}`, doc.internal.pageSize.getWidth() / 2, 320, { align: 'center' });
			doc.setFontSize(10);
			doc.text(`Group: ${r.group || '-'}`, doc.internal.pageSize.getWidth() / 2, 340, { align: 'center' });
		}

		doc.save(`members-qr-${new Date().toISOString().slice(0,10)}.pdf`);
		alert(`Saved QR PDF with ${records.length} members`);
	} catch (err) {
		console.error('Error exporting QR PDF', err);
		alert('Failed to export QR PDF');
	}
}

// Export QR+Details as PNG files compressed into a ZIP
export async function exportMembersQRZip(records: MemberExportRecord[], options?: { siteName?: string; subheader?: string; qrCardColor?: string; qrBackgroundImage?: string }) {
	try {
		// Lazy-load libraries
		/* eslint-disable @typescript-eslint/no-explicit-any */
		const JSZipModule = await import('jszip');
		const JSZip = (JSZipModule as any)?.default || JSZipModule;
		const qrcode = await import('qrcode');
		/* eslint-enable @typescript-eslint/no-explicit-any */

		/* eslint-disable @typescript-eslint/no-explicit-any */
		const zip: any = new (JSZip as unknown as { new(): unknown })();
		/* eslint-enable @typescript-eslint/no-explicit-any */
		const folderName = `members-qr-${new Date().toISOString().slice(0,10)}`;
		const folder = zip.folder(folderName) || zip;

		function sanitizeFileName(s: string) {
			return s.replace(/[^a-z0-9-_.]/gi, '_');
		}

		// manifest CSV header
		let manifest = 'filename,member_id,first_name,last_name,group\n';

		for (let i = 0; i < records.length; i++) {
			const r = records[i];
			// Create canvas 1080x1080 based on existing QR generation style
			const canvas = document.createElement('canvas');
			canvas.width = 1080;
			canvas.height = 1080;
			const ctx = canvas.getContext('2d');
			if (!ctx) continue;

			// Fill background (try image if provided)
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			if (options?.qrBackgroundImage) {
				try {
					const bgImg = new Image();
					bgImg.src = options.qrBackgroundImage; // Can be URL or data URL
					await new Promise((resolve, reject) => {
						bgImg.onload = resolve;
						bgImg.onerror = reject;
					});
					const scale = Math.max(canvas.width / bgImg.width, canvas.height / bgImg.height);
					const x = (canvas.width / 2) - (bgImg.width / 2) * scale;
					const y = (canvas.height / 2) - (bgImg.height / 2) * scale;
					ctx.drawImage(bgImg, x, y, bgImg.width * scale, bgImg.height * scale);
				} catch {
					// fallback gradient
					const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
					grad.addColorStop(0, '#e2e8f0');
					grad.addColorStop(1, '#94a3b8');
					ctx.fillStyle = grad;
					ctx.fillRect(0, 0, canvas.width, canvas.height);
				}
			} else {
				const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
				grad.addColorStop(0, '#e2e8f0');
				grad.addColorStop(1, '#94a3b8');
				ctx.fillStyle = grad;
				ctx.fillRect(0, 0, canvas.width, canvas.height);
			}

			// Header Text
			const headerColor = options?.qrCardColor || '#275032';
			ctx.textAlign = 'center';
			ctx.font = 'bold 60px Inter, sans-serif';
			ctx.fillStyle = headerColor;
			ctx.fillText(options?.siteName || 'Organization Name', canvas.width / 2, 100);

			ctx.font = 'italic 36px Times New Roman, serif';
			ctx.fillStyle = headerColor;
			if (options?.subheader) ctx.fillText(options.subheader, canvas.width / 2, 150);

			// Prepare sizes
			const containerSize = 650;
			const containerX = (canvas.width - containerSize) / 2;
			const containerY = 220;
			const containerRadius = 30;
			const qrSize = 520; // final draw size for QR

			// Generate QR at higher resolution to keep it sharp when drawn
			const qrDataUrl = await qrcode.toDataURL(r.member_id || '', { errorCorrectionLevel: 'H', margin: 0, width: qrSize * 2 });
			const qrImg = new Image();
			qrImg.src = qrDataUrl;
			await new Promise((resolve) => { qrImg.onload = resolve; });

			// rounded rect background
			ctx.save();
			ctx.beginPath();
			// rounded rect helper
			const rR = containerRadius;
			ctx.moveTo(containerX + rR, containerY);
			ctx.arcTo(containerX + containerSize, containerY, containerX + containerSize, containerY + containerSize, rR);
			ctx.arcTo(containerX + containerSize, containerY + containerSize, containerX, containerY + containerSize, rR);
			ctx.arcTo(containerX, containerY + containerSize, containerX, containerY, rR);
			ctx.arcTo(containerX, containerY, containerX + containerSize, containerY, rR);
			ctx.closePath();

			ctx.fillStyle = '#ffffff';
			ctx.fill();
			ctx.lineWidth = 4;
			ctx.strokeStyle = headerColor;
			ctx.stroke();

			// draw QR inside (disable smoothing for crisp edges)
			const qrPadding = (containerSize - qrSize) / 2;
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(qrImg, containerX + qrPadding, containerY + qrPadding, qrSize, qrSize);
			ctx.imageSmoothingEnabled = true;

			ctx.restore();

			// Footer - Name and ID with fit/wrap behavior
			ctx.textAlign = 'center';
			ctx.fillStyle = headerColor;

			// Draw name (fit to width, allow two lines if necessary)
			const rawName = `${(r.first_name || '').trim()} ${(r.last_name || '').trim()}`.trim().toUpperCase();
			let nameFontSize = 72;
			ctx.font = `bold ${nameFontSize}px Inter, sans-serif`;
			const maxTextWidth = canvas.width - 160; // side padding
			const measured = ctx.measureText(rawName).width;
			if (measured > maxTextWidth) {
				// Try decreasing font size
				while (nameFontSize > 38 && ctx.measureText(rawName).width > maxTextWidth) {
					nameFontSize -= 2;
					ctx.font = `bold ${nameFontSize}px Inter, sans-serif`;
				}
			}

			if (ctx.measureText(rawName).width <= maxTextWidth) {
				ctx.fillText(rawName, canvas.width / 2, containerY + containerSize + 100);
			} else {
				// fallback: split into two lines near the middle space
				const parts = rawName.split(' ');
				const mid = Math.ceil(parts.length / 2);
				const firstLine = parts.slice(0, mid).join(' ');
				const secondLine = parts.slice(mid).join(' ');
				ctx.fillText(firstLine, canvas.width / 2, containerY + containerSize + 85);
				ctx.fillText(secondLine, canvas.width / 2, containerY + containerSize + 125);
			}

			// ID (slightly lower)
			ctx.font = 'bold 40px Inter, sans-serif';
			ctx.fillText(`${r.member_id}`, canvas.width / 2, containerY + containerSize + 165);

			// Convert to blob
			const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/png'));

			const filename = sanitizeFileName(`${r.first_name}_${r.group || 'unassigned'}_${r.member_id}.png`);
			folder.file(filename, blob);

			manifest += `${filename},${r.member_id},${r.first_name},${r.last_name},${r.group || ''}\n`;
		}

		// Add manifest
		folder.file('members-manifest.csv', manifest);

		// Generate ZIP
		const content = await zip.generateAsync({ type: 'blob' });
		const url = URL.createObjectURL(content);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${folderName}.zip`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		alert(`Downloaded ZIP with ${records.length} images.`);
	} catch (err) {
		console.error('Error exporting QR ZIP', err);
		alert('Failed to export QR ZIP');
	}
}
