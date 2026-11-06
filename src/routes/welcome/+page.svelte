<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import { siteConfig } from '$lib/config/site';
	import { systemSettings } from '$lib/stores/settings';
	import { roleDefinition, roleLabel, type AccessRole } from '$lib/api/access';
	import { assessPassword, STRENGTH_LABELS, MIN_PASSWORD_LENGTH } from '$lib/utils/password';
	import { getErrorMessage, getErrorTitle } from '$lib/utils';

	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import {
		QrCode,
		Check,
		Eye,
		EyeOff,
		Loader2,
		Upload,
		ArrowRight,
		ArrowLeft,
		ShieldCheck,
		AlertCircle,
		PartyPopper,
		X
	} from '@lucide/svelte';

	/**
	 * Account setup for an invited person.
	 *
	 * This replaces a modal that appeared over the dashboard. A modal was the wrong shape
	 * for it: the app was already rendered and interactive behind a scrim the user could
	 * not dismiss, the mobile nav had to be specially suppressed to stop them navigating
	 * away mid-setup, and the one screen asked for a password with no context about what
	 * account it was for or who had invited them.
	 *
	 * A route gives setup its own place. The (protected) layout sends anyone whose profile
	 * is not yet complete here, so there is exactly one way into the app.
	 *
	 * The steps are ordered by what has to be true before the next one matters: the
	 * password is set first because until it is, the account is still reachable by anyone
	 * holding the invitation email.
	 */

	type Step = 'intro' | 'password' | 'profile' | 'done';
	const ORDER: Step[] = ['intro', 'password', 'profile', 'done'];

	let step = $state<Step>('intro');
	let isLoading = $state(true);

	let userId = $state('');
	let userEmail = $state('');
	let role = $state<AccessRole>('staff');
	let inviterName = $state<string | null>(null);

	// Password step
	let password = $state('');
	let confirmPassword = $state('');
	let showPassword = $state(false);
	let passwordError = $state('');
	let isSavingPassword = $state(false);

	// Profile step
	let fullName = $state('');
	let avatarFile = $state<File | null>(null);
	let avatarPreview = $state('');
	let avatarError = $state('');
	let profileError = $state('');
	let isSavingProfile = $state(false);

	let assessment = $derived(assessPassword(password, userEmail));
	let stepIndex = $derived(ORDER.indexOf(step));
	let definition = $derived(roleDefinition(role));

	onMount(async () => {
		document.documentElement.classList.remove('dark');

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session) {
			goto('/login');
			return;
		}

		userId = session.user.id;
		userEmail = session.user.email ?? '';

		const { data: profile } = await supabase
			.from('profiles')
			.select('full_name, email, role, invited_by, onboarding_completed')
			.eq('id', userId)
			.single();

		// Someone who has already finished has no business here; send them to the app
		// rather than letting them re-run setup and reset their own password by accident.
		if (profile?.onboarding_completed) {
			goto('/overview');
			return;
		}

		if (profile) {
			userEmail = profile.email || userEmail;
			role = profile.role ?? 'staff';
			fullName = profile.full_name ?? '';

			if (profile.invited_by) {
				const { data: inviter } = await supabase
					.from('profiles')
					.select('full_name, email')
					.eq('id', profile.invited_by)
					.single();
				inviterName = inviter?.full_name || inviter?.email || null;
			}
		}

		isLoading = false;
	});

	// -----------------------------------------------------------------------
	// Password
	// -----------------------------------------------------------------------

	async function savePassword() {
		passwordError = '';

		if (!assessment.acceptable) {
			passwordError = assessment.hint ?? `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
			return;
		}
		if (password !== confirmPassword) {
			passwordError = 'The two passwords do not match.';
			return;
		}

		isSavingPassword = true;
		try {
			const { error } = await supabase.auth.updateUser({ password });
			if (error) {
				passwordError = error.message;
				return;
			}
			step = 'profile';
		} catch (e) {
			passwordError = getErrorMessage(e);
		} finally {
			isSavingPassword = false;
		}
	}

	// -----------------------------------------------------------------------
	// Profile
	// -----------------------------------------------------------------------

	function handleAvatarChange(event: Event) {
		avatarError = '';
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		if (!file.type.startsWith('image/')) {
			avatarError = 'Choose an image file.';
			input.value = '';
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			avatarError = 'That image is larger than 5MB.';
			input.value = '';
			return;
		}

		avatarFile = file;
		const reader = new FileReader();
		reader.onload = (e) => (avatarPreview = (e.target?.result as string) ?? '');
		reader.readAsDataURL(file);
	}

	function clearAvatar() {
		avatarFile = null;
		avatarPreview = '';
		avatarError = '';
	}

	/**
	 * Returns a durable URL, or null if the upload didn't work out.
	 *
	 * Setup used to store a signed URL with a one-hour expiry in profiles.avatar_url, so
	 * every avatar silently turned into a grey initial an hour after the person joined.
	 * A public URL for a public bucket has no expiry to outlive.
	 */
	async function uploadAvatar(): Promise<string | null> {
		if (!avatarFile) return null;

		const extension = avatarFile.name.split('.').pop()?.toLowerCase() || 'jpg';
		const fileName = `avatar-${userId}-${Date.now()}.${extension}`;

		const { error: uploadError } = await supabase.storage
			.from('user-profile')
			.upload(fileName, avatarFile, { cacheControl: '3600', upsert: true });

		if (uploadError) {
			console.warn('Avatar upload failed:', uploadError);
			return null;
		}

		const { data } = supabase.storage.from('user-profile').getPublicUrl(fileName);
		return data?.publicUrl ?? null;
	}

	async function saveProfile() {
		profileError = '';
		const name = fullName.trim();

		if (name.length < 2) {
			profileError = 'Enter the name your colleagues will recognise.';
			return;
		}

		isSavingProfile = true;
		try {
			// The picture is optional, so a storage failure must not block setup - the
			// account is otherwise ready and they can add one later from Profile.
			const avatarUrl = await uploadAvatar();
			if (avatarFile && !avatarUrl) {
				toast.warning('Your picture could not be uploaded. You can add one later from Profile.');
			}

			const { error } = await supabase
				.from('profiles')
				.update({
					full_name: name,
					...(avatarUrl ? { avatar_url: avatarUrl } : {}),
					onboarding_completed: true,
					updated_at: new Date().toISOString()
				})
				.eq('id', userId);

			if (error) {
				profileError = `${getErrorTitle(error)}: ${getErrorMessage(error)}`;
				return;
			}

			step = 'done';
		} catch (e) {
			profileError = getErrorMessage(e);
		} finally {
			isSavingProfile = false;
		}
	}

	function finish() {
		// A full load rather than a client-side navigation: the sidebar, header and role
		// gating all read the profile once at startup, and they were all built before this
		// name and avatar existed.
		window.location.href = '/overview';
	}

	const strengthTone: Record<string, string> = {
		weak: 'bg-destructive',
		fair: 'bg-amber-500',
		good: 'bg-sky-500',
		strong: 'bg-primary'
	};
</script>

<svelte:head>
	<title>Welcome — {$systemSettings.siteName || siteConfig.name}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div
	class="light relative flex min-h-screen flex-col items-center justify-center p-4 font-sans text-foreground"
	style="background-image: url('/Background.png'); background-size: cover; background-position: center; background-attachment: fixed; --background: oklch(1 0 0); --foreground: oklch(0.129 0.042 264.695); --card: oklch(1 0 0); --card-foreground: oklch(0.129 0.042 264.695); --border: oklch(84.651% 0.01125 256.831); --secondary: oklch(0.968 0.007 247.896); --secondary-foreground: oklch(0.208 0.042 265.755); --muted: oklch(0.968 0.007 247.896); --muted-foreground: oklch(0.554 0.046 257.417); --input: oklch(0.929 0.013 255.508);"
>
	<div class="absolute inset-0 bg-white/60"></div>

	<div class="relative z-10 w-full max-w-md">
		{#if isLoading}
			<div class="flex min-h-[420px] items-center justify-center">
				<Loader2 class="h-7 w-7 animate-spin text-primary" />
			</div>
		{:else}
			<div class="flex flex-col items-center space-y-5">
				<!-- Brand -->
				<div class="flex flex-col items-center space-y-2 text-center">
					<div
						class="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card text-primary shadow-xl shadow-primary/20"
					>
						<QrCode class="h-7 w-7" />
					</div>
				</div>

				<!-- Progress. Named steps rather than bare dots, so "where am I and how much
				     is left" is answerable without counting. -->
				{#if step !== 'done'}
					<div class="flex w-full items-center gap-2 px-1" aria-hidden="true">
						{#each ORDER.slice(0, 3) as s, i (s)}
							<div
								class="h-1 flex-1 rounded-full transition-colors {i <= stepIndex
									? 'bg-primary'
									: 'bg-border'}"
							></div>
						{/each}
					</div>
					<p class="-mt-3 w-full px-1 text-[11px] font-medium text-muted-foreground">
						Step {stepIndex + 1} of 3
					</p>
				{/if}

				<div class="w-full rounded-xl border border-border bg-card p-6 shadow-sm">
					<!-- ------------------------------------------------ Intro -->
					{#if step === 'intro'}
						<div class="space-y-5">
							<div class="space-y-2">
								<h1 class="text-xl font-bold tracking-tight">
									Welcome to {$systemSettings.siteName || siteConfig.name}
								</h1>
								<p class="text-sm text-muted-foreground">
									{#if inviterName}
										<strong class="font-medium text-foreground">{inviterName}</strong> invited you
										to join as
										<strong class="font-medium text-foreground">{roleLabel(role)}</strong>.
									{:else}
										You've been invited to join as
										<strong class="font-medium text-foreground">{roleLabel(role)}</strong>.
									{/if}
								</p>
							</div>

							{#if definition}
								<div class="rounded-lg border bg-muted/40 p-3">
									<p class="text-xs font-semibold">What you'll be able to do</p>
									<ul class="mt-2 space-y-1.5">
										{#each definition.capabilities as capability (capability)}
											<li class="flex gap-2 text-xs text-muted-foreground">
												<Check class="mt-0.5 h-3 w-3 shrink-0 text-primary" />
												<span>{capability}</span>
											</li>
										{/each}
									</ul>
								</div>
							{/if}

							<div class="space-y-1 rounded-lg border border-border/60 p-3">
								<p class="text-[11px] text-muted-foreground">Your account</p>
								<p class="text-xs font-medium break-all">{userEmail}</p>
								<p class="text-[11px] text-muted-foreground">
									This is fixed to the address you were invited at.
								</p>
							</div>

							<Button class="w-full gap-1.5" onclick={() => (step = 'password')}>
								Get started
								<ArrowRight class="h-4 w-4" />
							</Button>
						</div>

						<!-- --------------------------------------------- Password -->
					{:else if step === 'password'}
						<form
							class="space-y-5"
							onsubmit={(e) => {
								e.preventDefault();
								savePassword();
							}}
						>
							<div class="space-y-1.5">
								<div class="flex items-center gap-2">
									<ShieldCheck class="h-4 w-4 text-primary" />
									<h1 class="text-base font-bold">Choose a password</h1>
								</div>
								<p class="text-xs text-muted-foreground">
									Your invitation link works only once. This password is how you'll sign in from now
									on.
								</p>
							</div>

							{#if passwordError}
								<div
									class="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
									role="alert"
								>
									<AlertCircle class="mt-px h-3.5 w-3.5 shrink-0" />
									<span>{passwordError}</span>
								</div>
							{/if}

							<div class="space-y-1.5">
								<Label for="new-password" class="text-xs font-medium">New password</Label>
								<div class="relative">
									<Input
										id="new-password"
										type={showPassword ? 'text' : 'password'}
										autocomplete="new-password"
										placeholder="At least {MIN_PASSWORD_LENGTH} characters"
										bind:value={password}
										disabled={isSavingPassword}
										class="pr-10"
									/>
									<button
										type="button"
										class="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:text-foreground"
										onclick={() => (showPassword = !showPassword)}
										aria-label={showPassword ? 'Hide password' : 'Show password'}
									>
										{#if showPassword}
											<EyeOff class="h-4 w-4" />
										{:else}
											<Eye class="h-4 w-4" />
										{/if}
									</button>
								</div>

								{#if password}
									<div class="space-y-1.5 pt-1">
										<div class="flex items-center gap-1" aria-hidden="true">
											{#each [0, 1, 2, 3] as segment (segment)}
												<div
													class="h-1 flex-1 rounded-full transition-colors {segment <
													assessment.score
														? strengthTone[assessment.strength]
														: 'bg-border'}"
												></div>
											{/each}
										</div>
										<p class="text-[11px] text-muted-foreground">
											<span
												class="font-medium {assessment.acceptable
													? 'text-foreground'
													: 'text-destructive'}"
											>
												{STRENGTH_LABELS[assessment.strength]}
											</span>
											{#if assessment.hint}
												· {assessment.hint}
											{/if}
										</p>
									</div>
								{/if}
							</div>

							<div class="space-y-1.5">
								<Label for="confirm-password" class="text-xs font-medium">Confirm password</Label>
								<Input
									id="confirm-password"
									type={showPassword ? 'text' : 'password'}
									autocomplete="new-password"
									placeholder="Type it again"
									bind:value={confirmPassword}
									disabled={isSavingPassword}
								/>
								{#if confirmPassword && password !== confirmPassword}
									<p class="text-[11px] text-destructive">These don't match yet.</p>
								{/if}
							</div>

							<div class="flex gap-2">
								<Button
									type="button"
									variant="outline"
									class="gap-1.5"
									onclick={() => (step = 'intro')}
									disabled={isSavingPassword}
								>
									<ArrowLeft class="h-4 w-4" />
									Back
								</Button>
								<Button
									type="submit"
									class="flex-1 gap-1.5"
									disabled={isSavingPassword ||
										!assessment.acceptable ||
										password !== confirmPassword}
								>
									{#if isSavingPassword}
										<Loader2 class="h-4 w-4 animate-spin" />
										Saving...
									{:else}
										Continue
										<ArrowRight class="h-4 w-4" />
									{/if}
								</Button>
							</div>
						</form>

						<!-- ---------------------------------------------- Profile -->
					{:else if step === 'profile'}
						<form
							class="space-y-5"
							onsubmit={(e) => {
								e.preventDefault();
								saveProfile();
							}}
						>
							<div class="space-y-1.5">
								<h1 class="text-base font-bold">How should we show you?</h1>
								<p class="text-xs text-muted-foreground">
									Your name appears next to every scan you record, so colleagues know who did what.
								</p>
							</div>

							{#if profileError}
								<div
									class="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
									role="alert"
								>
									<AlertCircle class="mt-px h-3.5 w-3.5 shrink-0" />
									<span>{profileError}</span>
								</div>
							{/if}

							<div class="flex items-center gap-4">
								<div class="relative">
									<Avatar class="h-16 w-16 border">
										{#if avatarPreview}
											<AvatarImage src={avatarPreview} alt="" />
										{:else}
											<AvatarFallback class="text-lg font-semibold">
												{(fullName.trim() || userEmail).charAt(0).toUpperCase()}
											</AvatarFallback>
										{/if}
									</Avatar>
									{#if avatarPreview}
										<button
											type="button"
											onclick={clearAvatar}
											class="absolute -top-1 -right-1 rounded-full border border-border bg-card p-0.5 text-muted-foreground shadow-sm transition hover:text-foreground"
											aria-label="Remove picture"
										>
											<X class="h-3 w-3" />
										</button>
									{/if}
								</div>
								<div class="space-y-1">
									<Label
										for="avatar"
										class="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline"
									>
										<Upload class="h-3.5 w-3.5" />
										{avatarPreview ? 'Choose a different picture' : 'Add a picture'}
									</Label>
									<input
										id="avatar"
										type="file"
										accept="image/*"
										class="hidden"
										onchange={handleAvatarChange}
									/>
									<p class="text-[11px] text-muted-foreground">Optional · JPG or PNG, up to 5MB</p>
									{#if avatarError}
										<p class="text-[11px] text-destructive">{avatarError}</p>
									{/if}
								</div>
							</div>

							<div class="space-y-1.5">
								<Label for="full-name" class="text-xs font-medium">Full name</Label>
								<Input
									id="full-name"
									type="text"
									autocomplete="name"
									placeholder="e.g. Maria Santos"
									bind:value={fullName}
									disabled={isSavingProfile}
								/>
							</div>

							<Button
								type="submit"
								class="w-full gap-1.5"
								disabled={isSavingProfile || fullName.trim().length < 2}
							>
								{#if isSavingProfile}
									<Loader2 class="h-4 w-4 animate-spin" />
									Finishing up...
								{:else}
									Finish setup
									<ArrowRight class="h-4 w-4" />
								{/if}
							</Button>

							<!-- No "skip": the password is already set, so leaving here would drop
							     someone into the app as an unnamed account that nobody can attribute
							     a scan to. The name is two seconds of work. -->
						</form>

						<!-- ------------------------------------------------- Done -->
					{:else}
						<div class="space-y-5 text-center">
							<div
								class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"
							>
								<PartyPopper class="h-6 w-6" />
							</div>
							<div class="space-y-1.5">
								<h1 class="text-lg font-bold">You're all set, {fullName.trim().split(' ')[0]}</h1>
								<p class="text-xs text-muted-foreground">
									Your account is ready. You're signed in as {roleLabel(role)}.
								</p>
							</div>

							{#if definition}
								<div class="rounded-lg border bg-muted/40 p-3 text-left">
									<p class="text-xs font-semibold">Where to start</p>
									<ul class="mt-2 space-y-1.5">
										{#each definition.capabilities as capability (capability)}
											<li class="flex gap-2 text-xs text-muted-foreground">
												<Check class="mt-0.5 h-3 w-3 shrink-0 text-primary" />
												<span>{capability}</span>
											</li>
										{/each}
									</ul>
								</div>
							{/if}

							<Button class="w-full gap-1.5" onclick={finish}>
								Go to the dashboard
								<ArrowRight class="h-4 w-4" />
							</Button>
						</div>
					{/if}
				</div>

				<div class="flex flex-col items-center space-y-1 text-center text-muted-foreground">
					<p class="text-[11px] font-medium">
						{siteConfig.organization.name} © {new Date().getFullYear()}
					</p>
					{#if step !== 'done'}
						<button
							type="button"
							class="text-[11px] underline-offset-2 hover:underline"
							onclick={async () => {
								await supabase.auth.signOut();
								goto('/login');
							}}
						>
							Not you? Sign out
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
