<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import type { PageData } from './$types';

	export let data: PageData;

	let currentLocale = 'de';
	let platform: 'ios' | 'android' | 'desktop' = 'desktop';

	// Subscribe to locale changes
	locale.subscribe(value => {
		if (value) {
			currentLocale = value;
		}
	});

	let appleLoaded = false;
	let googleLoaded = false;

	onMount(() => {
		const ua = navigator.userAgent.toLowerCase();
		if (/iphone|ipad|ipod/.test(ua)) {
			platform = 'ios';
		} else if (/android/.test(ua)) {
			platform = 'android';
		}
	});

	// Reactive meta data based on current locale
	$: seoTitle = $_('seo.title');
	$: seoDescription = $_('seo.description');
	$: seoKeywords = $_('seo.keywords');
	$: ogTitle = $_('seo.ogTitle');
	$: ogDescription = $_('seo.ogDescription');
	$: twitterTitle = $_('seo.twitterTitle');
	$: twitterDescription = $_('seo.twitterDescription');
</script>

<svelte:head>
	<!-- Primary Meta Tags -->
	<title>{seoTitle}</title>
	<meta name="title" content={seoTitle} />
	<meta name="description" content={seoDescription} />
	<meta name="keywords" content={seoKeywords} />
	<meta name="robots" content="index, follow" />
	<meta name="language" content={currentLocale} />
	<meta name="author" content="TRAINAA" />
	<link rel="canonical" href={data.meta.url} />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content={data.meta.type} />
	<meta property="og:url" content={data.meta.url} />
	<meta property="og:title" content={ogTitle} />
	<meta property="og:description" content={ogDescription} />
	<meta property="og:image" content={data.meta.image} />
	<meta property="og:site_name" content={data.meta.siteName} />
	<meta property="og:locale" content={currentLocale === 'en' ? 'en_US' : currentLocale + '_' + currentLocale.toUpperCase()} />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content={data.meta.url} />
	<meta property="twitter:title" content={twitterTitle} />
	<meta property="twitter:description" content={twitterDescription} />
	<meta property="twitter:image" content={data.meta.image} />
	<meta name="twitter:creator" content="@trainaa" />

	<!-- Additional SEO -->
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="theme-color" content="#000000" />
	<meta name="msapplication-TileColor" content="#000000" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

	<!-- Favicon -->
	<link rel="icon" type="image/x-icon" href={data.meta.favicon} />
	<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
	<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
	<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
	<link rel="manifest" href="/site.webmanifest" />

	<!-- Preload app store badges -->
	<link rel="preload" href="/appstore/apple-badge.svg" as="image" type="image/svg+xml" />
	<link rel="preload" href="/appstore/google-badge.png" as="image" type="image/png" />

	<!-- Preconnect for performance -->
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" />

	<!-- Alternative language versions -->
	<link rel="alternate" hreflang="de" href="{data.meta.baseUrl}/?lang=de" />
	<link rel="alternate" hreflang="en" href="{data.meta.baseUrl}/?lang=en" />
	<link rel="alternate" hreflang="fr" href="{data.meta.baseUrl}/?lang=fr" />
	<link rel="alternate" hreflang="es" href="{data.meta.baseUrl}/?lang=es" />
	<link rel="alternate" hreflang="it" href="{data.meta.baseUrl}/?lang=it" />
	<link rel="alternate" hreflang="x-default" href={data.meta.baseUrl} />

	<!-- Structured Data (JSON-LD) for SEO -->
	{@html `<script type="application/ld+json">
	{
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		"name": "TRAINAA",
		"description": "${seoDescription}",
		"url": "${data.meta.url}",
		"applicationCategory": "HealthApplication",
		"operatingSystem": "Web",
		"offers": {
			"@type": "Offer",
			"price": "40",
			"priceCurrency": "${currentLocale === 'en' ? 'USD' : 'EUR'}",
			"availability": "https://schema.org/InStock",
			"priceValidUntil": "2025-12-31"
		},
		"provider": {
			"@type": "Organization",
			"name": "TRAINAA",
			"url": "${data.meta.baseUrl}",
			"logo": "${data.meta.baseUrl}/logo-white.png"
		},
		"aggregateRating": {
			"@type": "AggregateRating",
			"ratingValue": "4.8",
			"reviewCount": "150",
			"bestRating": "5",
			"worstRating": "1"
		},
		"featureList": [
			"AI-powered training plans",
			"24/7 personal trainer",
			"Progress tracking",
			"Custom workout generation"
		],
		"screenshot": "${data.meta.image}",
		"inLanguage": ["${currentLocale}"],
		"audience": {
			"@type": "Audience",
			"audienceType": "Athletes, Fitness Enthusiasts"
		}
	}
	</script>`}
</svelte:head>

<!-- Hero Section -->
<main class="mx-auto flex flex-col items-center text-center flex-grow">

	<div class="mt-20 md:mt-40 flex flex-col items-center gap-8 px-6">
		<!-- Hero Title -->
 		<h1 class="text-5xl md:text-6xl lg:text-7xl font-bold text-white max-w-2xl">{$_('landing.hero.title')}</h1>
		<p class="text-lg md:text-xl text-white/80 max-w-2xl">{$_('landing.hero.subtitle')}</p> 

		<!-- Web App Button -->
		<a
			href="https://app.trainaa.com"
			class="h-14 w-44 flex items-center justify-center rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white text-sm font-medium gap-2 transition-transform duration-300 hover:scale-102 {platform !== 'desktop' ? 'order-2' : ''}"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A8.966 8.966 0 013 12c0-1.264.26-2.466.727-3.558" /></svg>
			Web App
		</a>

		<!-- App Store Badges (order based on device platform) -->
		<div class="flex flex-col sm:flex-row items-center justify-center gap-4 {platform !== 'desktop' ? 'order-1' : ''}">
			<!-- Apple App Store -->
			<a href="https://apps.apple.com/de/app/trainaa/id6758528495" target="_blank" rel="noopener noreferrer" class="h-14 w-44 relative flex items-center justify-center transition-transform duration-300 hover:scale-102 {platform === 'android' ? 'order-2 sm:order-2' : 'order-1 sm:order-1'}">
				{#if !appleLoaded}
					<span class="flex items-center justify-center h-14 w-44 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white text-sm font-medium gap-2">
						<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
						App Store
					</span>
				{/if}
				<img
					src="/appstore/apple-badge.svg"
					alt="Download on the App Store"
					class="h-14 w-44 object-contain {appleLoaded ? '' : 'absolute inset-0 opacity-0'}"
					loading="eager"
					fetchpriority="high"
					on:load={() => appleLoaded = true}
				/>
			</a>
			<!-- Google Play Store -->
			<a href="https://play.google.com/store/apps/details?id=com.pacerchat.app" target="_blank" rel="noopener noreferrer" class="h-14 w-44 relative flex items-center justify-center transition-transform duration-300 hover:scale-102 {platform === 'android' ? 'order-1 sm:order-1' : 'order-2 sm:order-2'}">
				{#if !googleLoaded}
					<span class="flex items-center justify-center h-14 w-44 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white text-sm font-medium gap-2">
						<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 2.302a1 1 0 010 1.38l-2.302 2.302L15.396 13l2.302-2.492zM5.864 2.658L16.8 8.99l-2.302 2.302L5.864 2.658z"/></svg>
						Google Play
					</span>
				{/if}
				<img
					src="/appstore/google-badge.png"
					alt="Get it on Google Play"
					class="h-14 w-44 object-contain {googleLoaded ? '' : 'absolute inset-0 opacity-0'}"
					loading="eager"
					fetchpriority="high"
					on:load={() => googleLoaded = true}
				/>
			</a>
		</div>
	</div>

	<!-- Open Source Section -->
	<div class="mt-24 mb-16 flex flex-col items-center gap-6 px-4">
		<h2 class="text-3xl md:text-4xl font-bold text-white">{$_('landing.openSource.title')}</h2>
		<p class="text-base md:text-lg text-white/70 max-w-xl">{$_('landing.openSource.subtitle')}</p>
		<a
			href="https://github.com/jnkue/open-trainaa"
			target="_blank"
			rel="noopener noreferrer"
			class="flex items-center gap-3 h-14 px-6 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white font-semibold transition-all duration-300 hover:scale-105 hover:bg-white/20"
		>
			<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd" />
			</svg>
			<span class="text-lg">{$_('landing.openSource.cta')}</span>
		</a>
	</div>

</main>
