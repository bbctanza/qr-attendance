import { writable, derived } from 'svelte/store';
import type { AppNotification } from '$lib/types';
import { toast } from 'svelte-sonner';

function createNotificationStore() {
    // Start with empty, will persist or fetch if needed
    let initialNotifications: AppNotification[] = [];
    
    // Load from localStorage if available
    if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('app_notifications');
        if (saved) {
            try {
                initialNotifications = JSON.parse(saved);
            } catch (e) {
                console.error('Failed to parse notifications', e);
            }
        }
    }

    const { subscribe, update, set } = writable<AppNotification[]>(initialNotifications);

    // Sync to localStorage whenever it changes
    if (typeof window !== 'undefined') {
        subscribe(val => {
            localStorage.setItem('app_notifications', JSON.stringify(val));
        });
    }

    return {
        subscribe,
        add: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
            const id = crypto.randomUUID();
            const timestamp = new Date().toISOString();
            
            update(n => [
                {
                    ...notification,
                    id,
                    timestamp,
                    read: false
                } as AppNotification,
                ...n
            ]);

            // Integrated with toast
            if (notification.type === 'success') {
                toast.success(notification.title, { description: notification.message });
            } else if (notification.type === 'error') {
                toast.error(notification.title, { description: notification.message });
            } else if (notification.type === 'warning') {
                toast.warning(notification.title, { description: notification.message });
            } else {
                toast.info(notification.title, { description: notification.message });
            }
        },
        markAsRead: (id: string) => {
            update(n => n.map(item => 
                item.id === id ? { ...item, read: true } : item
            ));
        },
        markAllAsRead: () => {
            update(n => n.map(item => ({ ...item, read: true })));
        },
        remove: (id: string) => {
            update(n => n.filter(item => item.id !== id));
        },
        clear: () => set([])
    };
}

export const notifications = createNotificationStore();

export const unreadCount = derived(notifications, $notifications => 
    $notifications.filter(n => !n.read).length
);
