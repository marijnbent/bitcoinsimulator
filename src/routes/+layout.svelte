<script>
	import '../app.css';
	import { page } from '$app/stores';
	import { removeUser } from '$lib/utils/storage.js';
	
	let { children } = $props();
	
	// Check if we're on a blockchain or wallet page
	$effect(() => {
		const path = $page.url.pathname;
		const isBlockchainPage = path.startsWith('/blockchain/');
		const isWalletPage = path.startsWith('/wallet/');
		const isConnectedToBlockchain = isBlockchainPage || isWalletPage;
	});
	
	// Logout function
	function logout() {
		if ($page.params.id) {
			removeUser($page.params.id);
		}
		window.location.href = '/';
	}
</script>

<div class="min-h-screen bg-gray-900 text-cyan-400 font-mono">
	<header class="bg-gray-800 border-b border-cyan-700 p-4">
		<div class="container mx-auto flex justify-between items-center">
			<a href="/" class="text-2xl font-bold text-cyan-500 hover:text-cyan-400 transition-colors">
				Bitcoin Simulator
			</a>
			
			<nav class="flex space-x-6 text-sm">
				{#if $page.url.pathname !== '/'}
					<a 
						href="/" 
						class="text-cyan-400 hover:text-cyan-300 transition-colors"
					>
						Home
					</a>
				{/if}
				
				{#if $page.url.pathname.startsWith('/blockchain/') || $page.url.pathname.startsWith('/wallet/')}
					<button 
						aria-label="Logout"
						onclick={logout}
						class="text-cyan-400 hover:text-cyan-300 transition-colors"
					>
						Logout
					</button>
				{/if}
			</nav>
		</div>
	</header>
	
	<!-- Blockchain Navigation - Only shown when connected to a blockchain -->
	{#if $page.url.pathname.startsWith('/blockchain/') || $page.url.pathname.startsWith('/wallet/')}
		<div class="bg-gray-800 border-b border-cyan-700">
			<div class="container mx-auto flex justify-center">
				<nav class="flex">
					<a 
						href={`/blockchain/${$page.params.id}`} 
						class="py-3 px-6 text-center border-b-2 {$page.url.pathname.startsWith('/blockchain/') ? 'border-cyan-500 text-cyan-300' : 'border-transparent text-cyan-600 hover:text-cyan-400'} transition-colors"
					>
						Blockchain View
					</a>
					<a 
						href={`/wallet/${$page.params.id}`} 
						class="py-3 px-6 text-center border-b-2 {$page.url.pathname.startsWith('/wallet/') ? 'border-cyan-500 text-cyan-300' : 'border-transparent text-cyan-600 hover:text-cyan-400'} transition-colors"
					>
						Wallet View
					</a>
				</nav>
			</div>
		</div>
	{/if}
	
	<main class="container mx-auto p-4">
		{@render children()}
	</main>
	
	<footer class="bg-gray-800 border-t border-cyan-700 p-4 mt-8">
		<div class="container mx-auto text-center text-cyan-600">
			<p>Bitcoin Simulator - ©️ Marijn Bent</p>
		</div>
	</footer>
</div>

<style>
	:global(body) {
		background-color: #111827; /* bg-gray-900 */
		color: #22d3ee; /* text-cyan-400 */
		font-family: 'Courier New', monospace;
	}
	
	:global(.cyberpunk-glow) {
		text-shadow: 0 0 5px #22d3ee, 0 0 6px #22d3ee;
	}
	
	:global(.cyberpunk-box) {
		border: 1px solid #0e7490; /* border-cyan-700 */
		background-color: rgba(17, 24, 39, 0.8); /* bg-gray-900 with opacity */
		box-shadow: 0 0 10px #0e7490, inset 0 0 5px #0e7490;
	}
	
	:global(.cyberpunk-box-selected) {
		border: 1px solid #7e22ce !important; /* border-purple-700 */
		box-shadow: 0 0 10px #7e22ce, inset 0 0 5px #7e22ce !important;
	}
</style>
