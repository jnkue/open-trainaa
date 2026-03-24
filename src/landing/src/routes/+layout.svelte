<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';
	import { isLoading, locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import '../lib/i18n';
	import '../app.css';
	import Footer from '$lib/components/footer/Footer.svelte';
	import CookieConsentBanner from '$lib/components/consent/CookieConsentBanner.svelte';

	let { children } = $props();
	let background = "video";

	const languages = [
		{ code: 'de', name: 'Deutsch', flag: '🇩🇪', nativeName: 'Deutsch' },
		{ code: 'en', name: 'English', flag: '🇺🇸', nativeName: 'English' },
	];

	let currentLocale = $state('de');
	let isDropdownOpen = $state(false);
	let dropdownRef: HTMLDivElement;
	let videoElement: HTMLVideoElement;
	let videoLoaded = $state(false);

	// Subscribe to locale changes
	locale.subscribe(value => {
		if (value) {
			currentLocale = value;
		}
	});

	function switchLanguage(lang: string) {
		locale.set(lang);
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('locale', lang);
		}
		isDropdownOpen = false;
	}

	function toggleDropdown() {
		isDropdownOpen = !isDropdownOpen;
	}

	function handleClickOutside(event: MouseEvent) {
		if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
			isDropdownOpen = false;
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);

		// Lazy load video after page is interactive
		const loadVideo = () => {
			if (videoElement && !videoLoaded) {
				videoElement.load();
				videoElement.play().catch(err => {
					console.log('Video autoplay prevented:', err);
				});
				videoLoaded = true;
			}
		};

		// Use requestIdleCallback if available, otherwise setTimeout
		// This delays video loading to prioritize critical content
		if ('requestIdleCallback' in window) {
			requestIdleCallback(loadVideo, { timeout: 2000 });
		} else {
			setTimeout(loadVideo, 100);
		}

		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});

	let currentLanguage = $derived(languages.find(lang => lang.code === currentLocale) || languages[0]);
</script>

<ModeWatcher defaultMode={'dark'}></ModeWatcher>

{#if $isLoading}
	<div class="flex items-center justify-center min-h-screen">
		<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
	</div>
{:else}
	<section class="relative h-max overflow-y-wrap flex flex-col">

			<!-- Background video with optimizations -->
			<video
				bind:this={videoElement}
				autoplay
				loop
				muted
				playsinline
				preload="none"
				poster="/background.avif"
				class="fixed  -z-10 h-lvh w-full object-cover {videoLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-1000"
			>
				<!-- WebM for better compression (when available) -->
				<source src="/background.webm" type="video/webm" />
				<!-- MP4 fallback -->
				<source src="/background.mp4" type="video/mp4" />
			</video>

		<!-- Dark overlay for readability (extended for iOS Safari transparent address bar) -->
		<div class="fixed -z-10 top-[-50px] left-0 right-0 bottom-[-50px] min-h-lvh bg-black/50"></div>

		<!-- Language Switcher Dropdown -->
		<div class="absolute top-4 right-4 z-50" bind:this={dropdownRef}>
			<div class="relative">
				<!-- Trigger Button -->
				<button
					on:click={toggleDropdown}
					class="flex items-center gap-2 px-3 py-2 bg-black/20 backdrop-blur-sm rounded-lg text-white/90 hover:text-white hover:bg-black/30 transition-all duration-200 border border-white/10"
					aria-label="Select language"
				>
					<span class="text-sm font-medium">{currentLanguage.code.toUpperCase()}</span>
					<svg
						class="w-4 h-4 transition-transform duration-200 {isDropdownOpen ? 'rotate-180' : ''}"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</button>

				<!-- Dropdown Menu -->
				{#if isDropdownOpen}
					<div class="absolute top-full right-0 mt-2 w-48 bg-black/80 backdrop-blur-md rounded-lg border border-white/10 shadow-xl overflow-hidden">
						{#each languages as lang}
							<button
								on:click={() => switchLanguage(lang.code)}
								class="w-full flex items-center gap-3 px-4 py-3 text-left text-white/90 hover:text-white hover:bg-white/10 transition-all duration-150 {currentLocale === lang.code ? 'bg-white/5' : ''}"
							>
								<div class="flex flex-col">
									<span class="text-sm font-medium">{lang.nativeName}</span>
									<span class="text-xs text-white/60">{lang.name}</span>
								</div>
								{#if currentLocale === lang.code}
									<svg class="w-4 h-4 ml-auto text-green-400" fill="currentColor" viewBox="0 0 20 20">
										<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
									</svg>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Logo -->
		<header class="flex justify-center pt-10">
			<a href="/" class="transition-opacity hover:opacity-80">
				<img src="/logo-white.png" alt="TRAINAA" class="h-12 sm:h-12 w-auto" />
			</a>
		</header>

		<div class="flex-grow min-h-[100vh]">
			{@render children()}
		</div>
	</section>

	<Footer />
	<CookieConsentBanner />
{/if}
