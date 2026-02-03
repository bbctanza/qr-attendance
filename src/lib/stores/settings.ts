import { writable } from 'svelte/store';
import { supabase } from '$lib/supabase';
import { browser } from '$app/environment';

export const systemSettings = writable({
    siteName: 'Scan-in System',
    primaryColor: '#275032', // Default green
    qrHeaderTitle: 'Organization Name',
    qrSubheaderTitle: 'Tagline or Subtitle',
    qrCardColor: '#275032',
    qrBackgroundImage: ''
});

export const loadSettings = async () => {
    if (!browser) return;

    try {
        const { data, error } = await supabase
            .from('system_settings')
            .select('*')
            .eq('id', 1)
            .maybeSingle();

        if (error) {
            console.error('Error loading settings:', error);
            return;
        }

        if (data) {
            systemSettings.set({
                siteName: data.site_name,
                primaryColor: data.primary_color,
                qrHeaderTitle: data.qr_header_title,
                qrSubheaderTitle: data.qr_subheader_title,
                qrCardColor: data.qr_card_color,
                qrBackgroundImage: data.qr_background_image || ''
            });
            
            // Apply immediately
            applySettings(data);
        }
    } catch (e) {
        console.error('Exception loading settings:', e);
    }
};

export const applySettings = (settings: { 
    site_name: string, 
    primary_color: string,
    qr_header_title: string,
    qr_subheader_title: string,
    qr_card_color: string,
    qr_background_image?: string
}) => {
    if (!browser) return;

    // Apply document title
    document.title = settings.site_name;

    // Apply CSS variables
    document.documentElement.style.setProperty('--color-primary', settings.primary_color);
    document.documentElement.style.setProperty('--qr-card-font-color', settings.qr_card_color);
};
