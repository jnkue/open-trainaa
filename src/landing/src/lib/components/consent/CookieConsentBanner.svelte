<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';

	const CONSENT_KEY = 'cookie-consent';

	let showBanner = $state(false);

	onMount(() => {
		const stored = localStorage.getItem(CONSENT_KEY);
		if (stored === null) {
			showBanner = true;
		} else if (stored === 'granted') {
			updateConsent('granted');
		}
	});

	function updateConsent(status: 'granted' | 'denied') {
		if (typeof window.gtag === 'function') {
			window.gtag('consent', 'update', {
				ad_storage: status,
				ad_user_data: status,
				ad_personalization: status,
				analytics_storage: status
			});
		}
	}

	function accept() {
		localStorage.setItem(CONSENT_KEY, 'granted');
		updateConsent('granted');
		showBanner = false;
	}

	function decline() {
		localStorage.setItem(CONSENT_KEY, 'denied');
		updateConsent('denied');
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
			<div class="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
				<button
					onclick={decline}
					class="rounded-lg border border-white/10 px-5 py-2.5 text-sm font-medium text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white"
				>
					{$_('consent.decline')}
				</button>
				<button
					onclick={accept}
					class="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition-all duration-200 hover:bg-gray-200"
				>
					{$_('consent.accept')}
				</button>
			</div>
		</div>
	</div>
{/if}
