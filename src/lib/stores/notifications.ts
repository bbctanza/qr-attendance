import { writable, derived } from 'svelte/store';
import type { AppNotification } from '$lib/types';

function createNotificationStore() {
    // Mock initial data
    const initialNotifications: AppNotification[] = [
        {
            id: '1',
            title: 'Welcome!',
            message: 'Welcome to the Scan-In System.',
            timestamp: new Date().toISOString(),
            read: false,
            type: 'info'
        },
        {
            id: '2',
            title: 'System Update',
            message: 'The system was updated successfully.',
            timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
            read: true,
            type: 'success'
        }
    ];

    const { subscribe, update, set } = writable<AppNotification[]>(initialNotifications);

    return {
        subscribe,
        add: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
            update(n => [
                {
                    ...notification,
                    id: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                    read: false
                } as AppNotification,
                ...n
            ]);
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
