<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';

	const CONSENT_KEY = 'cookie-consent';
	const GTAG_ID = 'AW-17988287591';

	let showBanner = $state(false);
	let showSettings = $state(false);
	let analyticsEnabled = $state(false);
	let advertisingEnabled = $state(false);

	interface ConsentState {
		analytics: 'granted' | 'denied';
		advertising: 'granted' | 'denied';
	}

	onMount(() => {
		const stored = localStorage.getItem(CONSENT_KEY);
		if (stored === null) {
			showBanner = true;
		} else {
			try {
				const parsed: ConsentState = JSON.parse(stored);
				applyConsent(parsed);
			} catch {
				// Legacy format migration: old 'granted'/'denied' string
				if (stored === 'granted') {
					const consent: ConsentState = { analytics: 'granted', advertising: 'granted' };
					localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
					applyConsent(consent);
				} else {
					localStorage.removeItem(CONSENT_KEY);
					showBanner = true;
				}
			}
		}
	});

	function loadGtagScript() {
		if (document.querySelector(`script[src*="googletagmanager"]`)) return;
		const script = document.createElement('script');
		script.async = true;
		script.src = `https://www.googletagmanager.com/gtag/js?id=${GTAG_ID}`;
		document.head.appendChild(script);
		window.dataLayer = window.dataLayer || [];
		window.gtag = function () {
			// eslint-disable-next-line prefer-rest-params
			window.dataLayer.push(arguments);
		};
		window.gtag('js', new Date());
		window.gtag('config', GTAG_ID);
	}

	function applyConsent(consent: ConsentState) {
		const hasAnyGranted = consent.analytics === 'granted' || consent.advertising === 'granted';

		if (hasAnyGranted) {
			loadGtagScript();
		}

		if (typeof window.gtag === 'function') {
			window.gtag('consent', 'update', {
				analytics_storage: consent.analytics,
				ad_storage: consent.advertising,
				ad_user_data: consent.advertising,
				ad_personalization: consent.advertising
			});
		}
	}

	function acceptAll() {
		const consent: ConsentState = { analytics: 'granted', advertising: 'granted' };
		localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
		applyConsent(consent);
		showBanner = false;
	}

	function confirmSelection() {
		const consent: ConsentState = {
			analytics: analyticsEnabled ? 'granted' : 'denied',
			advertising: advertisingEnabled ? 'granted' : 'denied'
		};
		localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
		applyConsent(consent);
		showBanner = false;
	}

	function declineAll() {
		const consent: ConsentState = { analytics: 'denied', advertising: 'denied' };
		localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
		applyConsent(consent);
		showBanner = false;
	}
</script>

{#if showBanner}
	<div
		class="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6"
		role="dialog"
		aria-label={$_('consent.ariaLabel')}
		transition:fly={{ y: 100, duration: 300 }}
	>
		<div
			class="mx-auto max-w-2xl rounded-xl border border-white/10 bg-black/80 p-5 shadow-2xl backdrop-blur-md sm:p-6"
		>
			<p class="text-sm leading-relaxed text-white/80">
				{$_('consent.message')}
				{' '}
				<a
					href="/privacy"
					class="text-white underline underline-offset-2 hover:text-white/90"
				>
					{$_('consent.privacyLink')}
				</a>
			</p>

			{#if showSettings}
				<div class="mt-4 space-y-3">
					<label class="flex items-start gap-3 cursor-pointer">
						<input
							type="checkbox"
							bind:checked={analyticsEnabled}
							class="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/10 accent-white"
						/>
						<div>
							<span class="text-sm font-medium text-white">{$_('consent.analyticsLabel')}</span>
							<p class="text-xs text-white/60">{$_('consent.analyticsDescription')}</p>
						</div>
					</label>
					<label class="flex items-start gap-3 cursor-pointer">
						<input
							type="checkbox"
							bind:checked={advertisingEnabled}
							class="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/10 accent-white"
						/>
						<div>
							<span class="text-sm font-medium text-white">{$_('consent.advertisingLabel')}</span>
							<p class="text-xs text-white/60">{$_('consent.advertisingDescription')}</p>
						</div>
					</label>
				</div>
				<div class="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
					<button
						onclick={declineAll}
						class="rounded-lg border border-white/10 px-5 py-2.5 text-sm font-medium text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white"
					>
						{$_('consent.decline')}
					</button>
					<button
						onclick={confirmSelection}
						class="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition-all duration-200 hover:bg-gray-200"
					>
						{$_('consent.confirmSelection')}
					</button>
				</div>
			{:else}
				<div class="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
					<button
						onclick={declineAll}
						class="rounded-lg border border-white/10 px-5 py-2.5 text-sm font-medium text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white"
					>
						{$_('consent.decline')}
					</button>
					<button
						onclick={() => (showSettings = true)}
						class="rounded-lg border border-white/10 px-5 py-2.5 text-sm font-medium text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white"
					>
						{$_('consent.settings')}
					</button>
					<button
						onclick={acceptAll}
						class="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition-all duration-200 hover:bg-gray-200"
					>
						{$_('consent.acceptAll')}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
