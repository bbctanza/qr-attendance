import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface DevState {
    isMockTimeActive: boolean;
    mockTime: Date | null;
}

const initialState: DevState = {
    isMockTimeActive: false,
    mockTime: null
};

function createDevStore() {
    const { subscribe, set } = writable<DevState>(initialState);

    return {
        subscribe,
        init: () => {
            if (!browser) return;
            const savedMock = localStorage.getItem('dev_mock_time');
            if (savedMock) {
                const date = new Date(savedMock);
                set({
                    isMockTimeActive: true,
                    mockTime: date
                });
            } else {
                set(initialState);
            }
        },
        setMockTime: (date: Date) => {
            if (!browser) return;
            localStorage.setItem('dev_mock_time', date.toISOString());
            set({
                isMockTimeActive: true,
                mockTime: date
            });
        },
        clearMockTime: () => {
            if (!browser) return;
            localStorage.removeItem('dev_mock_time');
            set(initialState);
        }
    };
}

export const devTools = createDevStore();
