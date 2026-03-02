<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import type { PageData } from './$types';

	export let data: PageData;

	let currentLocale = 'de';

	// Subscribe to locale changes
	locale.subscribe(value => {
		if (value) {
			currentLocale = value;
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

	<div class="mt-40 flex flex-col items-center gap-8">
		<!-- Hero Title -->
 		<h1 class="text-5xl md:text-6xl lg:text-7xl font-bold text-white max-w-2xl">{$_('landing.hero.title')}</h1>
		<p class="text-lg md:text-xl text-white/80 max-w-2xl">{$_('landing.hero.subtitle')}</p> 

		<!-- Start Now Button -->
		<a
			href="https://app.trainaa.com"
			class="flex items-center justify-center h-16 w-48 rounded-lg bg-white text-black font-semibold shadow-lg transition-all duration-300 hover:scale-105 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
		>
			<span class="uppercase tracking-wide text-lg">{$_('landing.cta.start')}</span>
		</a>

		<!-- App Store Badges -->
		<div class="flex flex-col sm:flex-row items-center justify-center gap-4">
			<!-- Apple App Store -->
			<a href="https://apps.apple.com/de/app/trainaa/id6758528495" target="_blank" rel="noopener noreferrer" class="h-16 w-48 flex items-center justify-center transition-transform duration-300 hover:scale-102">
				<img src="/appstore/apple-badge.svg" alt="Download on the App Store" class="h-16 w-full object-contain" />
			</a>
			<!-- Google Play Store with Coming Soon overlay -->
			<div class="relative h-16">
				<img src="/appstore/google-badge.png" alt="Get it on Google Play" class="h-16 w-auto" />
				<div class="absolute inset-0 bg-black/60 flex items-center justify-center rounded-md">
					<span class="uppercase tracking-wide text-lg text-white ">Coming Soon</span>
				</div>
			</div>
		</div>
	</div>

</main>
