<script>
	import '../app.css';
	import { page } from '$app/stores';
	import { removeUser } from '$lib/utils/storage.js';
	import { goto } from '$app/navigation';
	
	let { children } = $props();
	
	// Logout function
	function logout() {
		const blockchainId = $page.params.id;
		removeUser(blockchainId);
		goto(`/`);
	}
</script>

<div class="app-shell">
	<header
		class="shell-header"
		class:shell-header--immersive={$page.url.pathname === '/' || $page.url.pathname === '/odds' || $page.url.pathname === '/osint'}
	>
		<div class="shell-header__inner">
			<a href="/" class="brand-link">
				<span class="brand-mark" aria-hidden="true"></span>
				<span class="brand-copy">
					<span class="brand-name">Bitcoin Simulator</span>
				</span>
			</a>

			<nav class="shell-nav">
				<a href="/" class="nav-link" class:is-active={$page.url.pathname === '/'}>Home</a>
				<a href="/odds" class="nav-link" class:is-active={$page.url.pathname === '/odds'}>
					Odds
				</a>
				<a href="/osint" class="nav-link" class:is-active={$page.url.pathname === '/osint'}>
					OSINT
				</a>
				<a
					href="/changelog"
					class="nav-link"
					class:is-active={$page.url.pathname.startsWith('/changelog')}
				>
					Changelog
				</a>

				{#if $page.url.pathname.startsWith('/blockchain/') || $page.url.pathname.startsWith('/wallet/')}
					<button aria-label="Logout" onclick={logout} class="nav-button">
						Logout
					</button>
				{/if}
			</nav>
		</div>
	</header>

	{#if $page.url.pathname.startsWith('/blockchain/') || $page.url.pathname.startsWith('/wallet/')}
		<div class="workspace-tabs">
			<div class="workspace-tabs__inner">
				<a
					href={`/blockchain/${$page.params.id}`}
					class="workspace-tab"
					class:is-active={$page.url.pathname.startsWith('/blockchain/')}
				>
					Blockchain
				</a>
				<a
					href={`/wallet/${$page.params.id}`}
					class="workspace-tab"
					class:is-active={$page.url.pathname.startsWith('/wallet/')}
				>
					Wallet
				</a>
			</div>
		</div>
	{/if}

	<main class="app-main" class:full-bleed={$page.url.pathname === '/' || $page.url.pathname === '/odds' || $page.url.pathname === '/osint'}>
		{@render children()}
	</main>

	<footer
		class="shell-footer"
		class:shell-footer--immersive={$page.url.pathname === '/' || $page.url.pathname === '/odds' || $page.url.pathname === '/osint'}
	>
		<div class="shell-footer__inner">
			<div class="shell-footer__brand">
				<p>Bitcoin Simulator</p>
			</div>
			<div class="shell-footer__links" aria-label="Footer">
				<a href="/">Home</a>
				<a href="/odds">Odds</a>
				<a href="/osint">OSINT</a>
				<a href="/changelog">Changelog</a>
			</div>
		</div>
	</footer>
</div>
