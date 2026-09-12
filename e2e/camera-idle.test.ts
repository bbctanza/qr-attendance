import { test, expect } from '@playwright/test';

test.describe('Camera Idle Tooltip', () => {
	test.use({
		// Mock local storage to set camera settings
		storageState: {
			cookies: [],
			origins: [
				{
					origin: 'http://localhost:5173',
					localStorage: [
						{ name: 'cameraGuidePosition', value: 'top' },
						{ name: 'cameraGuideIdleTime', value: '3' }
					]
				}
			]
		},
		// Fake camera feed
		launchOptions: {
			args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
		}
	});

	test('should display tooltip after idle time when setting is enabled', async ({ page }) => {
		// Mock login (if required) or go directly to scan page
		// Assuming the app has a bypass or dev mode we can leverage, or we just navigate
		// and mock the camera idle state if needed.
		await page.goto('/scan');

		// Click Start Camera if it's there
		const startCameraBtn = page.getByRole('button', { name: /Start Camera/i });
		if (await startCameraBtn.isVisible()) {
			await startCameraBtn.click();
		}

		// Wait for the video element to appear
		const video = page.locator('#reader-desktop video');
		await expect(video).toBeVisible({ timeout: 10000 });

		// Since we're using a fake static media stream, there will be no movement.
		// Wait for the idle timeout (3 seconds) + a bit of buffer
		await page.waitForTimeout(4000);

		// The tooltip should appear
		const tooltip = page.locator('text=Show your QR code here');
		await expect(tooltip).toBeVisible();
	});
});
