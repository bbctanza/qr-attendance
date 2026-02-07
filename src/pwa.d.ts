declare module 'virtual:pwa-info' {
	export const pwaInfo: {
		webManifest: {
			href: string;
			linkTag: string;
		};
	} | undefined;
}

declare module 'virtual:pwa-register/svelte' {
	import type { Writable } from 'svelte/store';

	export type RegisterSWOptions = {
		immediate?: boolean;
		onNeedRefresh?: () => void;
		onOfflineReady?: () => void;
		onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
		onRegisterError?: (error: any) => void;
	};

	export function useRegisterSW(options?: RegisterSWOptions): {
		needRefresh: Writable<boolean>;
		offlineReady: Writable<boolean>;
		updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
	};
}
