/**
 * Avatar URL utility for ensuring proper image loading
 * Converts expired signed URLs to public URLs
 */

export function ensureAvatarDownloadParam(url: string | null | undefined): string | undefined {
	if (!url) return undefined;
	
	// If it's a signed URL (contains /sign/), convert to public URL
	if (url.includes('/sign/')) {
		// Extract the file path from the signed URL
		// Format: https://xxx.supabase.co/storage/v1/object/sign/user-profile/avatar-xxx.jpg?token=...
		const match = url.match(/\/storage\/v1\/object\/sign\/(.*?)(\?|$)/);
		if (match && match[1]) {
			const filePath = match[1];
			// Get the Supabase URL from the original URL
			const supabaseUrl = url.split('/storage/')[0];
			// Return public URL format
			return `${supabaseUrl}/storage/v1/object/public/${filePath}`;
		}
	}
	
	// Public URLs from Supabase storage already work fine for image loading
	return url;
}
