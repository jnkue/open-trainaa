<script lang="ts">
	import { page } from '$app/stores';
	import { _ } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	
	// Get error status
	$: status = $page.error?.status || 404;
	$: message = $page.error?.message || 'Page not found';
	
	// Define error messages for different status codes
	$: errorTitle = getErrorTitle(status);
	$: errorDescription = getErrorDescription(status);
	
	function getErrorTitle(status: number): string {
		switch (status) {
			case 404:
				return $_('error.404.title', { default: 'Seite nicht gefunden' });
			case 500:
				return $_('error.500.title', { default: 'Serverfehler' });
			case 403:
				return $_('error.403.title', { default: 'Zugriff verweigert' });
			default:
				return $_('error.general.title', { default: 'Ein Fehler ist aufgetreten' });
		}
	}
	
	function getErrorDescription(status: number): string {
		switch (status) {
			case 404:
				return $_('error.404.description', { 
					default: 'Die angeforderte Seite konnte nicht gefunden werden. Möglicherweise wurde sie verschoben oder existiert nicht mehr.' 
				});
			case 500:
				return $_('error.500.description', { 
					default: 'Es ist ein interner Serverfehler aufgetreten. Bitte versuchen Sie es später erneut.' 
				});
			case 403:
				return $_('error.403.description', { 
					default: 'Sie haben keine Berechtigung, auf diese Seite zuzugreifen.' 
				});
			default:
				return $_('error.general.description', { 
					default: 'Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut.' 
				});
		}
	}
	
	function goHome() {
		window.location.href = '/';
	}
	
	function goBack() {
		if (window.history.length > 1) {
			window.history.back();
		} else {
			goHome();
		}
	}
</script>

<svelte:head>
	<title>{status} - {errorTitle} | TRAINAA</title>
	<meta name="description" content={errorDescription} />
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<!-- Logo -->
<header class="flex justify-center pt-10">
	<img src="/logo-white.png" alt="TRAINAA" class="h-12 sm:h-12 w-auto" />
</header>

<!-- Error Section -->
<main class="mx-auto flex max-w-4xl flex-col items-center px-6 py-20 sm:py-32 text-center flex-grow min-h-[60vh] justify-center">
	<!-- Error Animation Container -->
	<div class="relative mb-8">
		<!-- Large Status Code -->
		<div class="text-8xl sm:text-9xl md:text-[12rem] font-bold text-white/20 select-none relative">
			{status}
			<!-- Animated glow effect -->
			<div class="absolute inset-0 text-8xl sm:text-9xl md:text-[12rem] font-bold text-white/5 animate-pulse">
				{status}
			</div>
		</div>
		

	</div>

	<!-- Error Title -->
	<h1 class="font-semibold text-white text-2xl sm:text-3xl md:text-4xl mb-4 [text-wrap:balance]">
		{errorTitle}
	</h1>



	<!-- Action Buttons -->
	<div class="flex flex-col sm:flex-row gap-4 items-center justify-center">
		<!-- Primary CTA - Go Home -->
	


		<button
			on:click={goHome}
			class="flex items-center justify-center h-14 px-8 rounded-lg bg-white/10 backdrop-blur-sm text-white font-semibold border border-white/20 transition-all duration-300 hover:bg-white/20 hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 group"
		>
			
			<span class="uppercase tracking-wide">
				{$_('error.cta.home', { default: 'Zur Startseite' })}
			</span>
		</button>
	</div>

	<!-- Additional Help Text -->
	<div class="mt-12 text-center">
		<p class="text-white/60 text-sm mb-2">
			{$_('error.help.text', { default: 'Wenn das Problem weiterhin besteht, kontaktieren Sie uns:' })}
		</p>
		<a
			href="mailto:support@trainaa.com"
			class="text-white/80 hover:text-white text-sm underline underline-offset-4 transition-colors duration-200"
		>
			support@trainaa.com
		</a>
	</div>

	<!-- Decorative Element -->
	<div class=" flex justify-center">
		<div class="w-px h-16 bg-gradient-to-b from-white/20 to-transparent"></div>
	</div>
</main>

<!-- Add some custom animations -->
<style>
	@keyframes float {
		0%, 100% { transform: translateY(0px); }
		50% { transform: translateY(-10px); }
	}
	
	.float {
		animation: float 3s ease-in-out infinite;
	}
	
	.float-delayed {
		animation: float 3s ease-in-out infinite;
		animation-delay: 1.5s;
	}
</style>