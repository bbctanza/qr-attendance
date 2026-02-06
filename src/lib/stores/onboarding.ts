import { writable } from 'svelte/store';

export const onboardingState = writable({
    isOpen: false,
    userEmail: '',
    userId: ''
});
