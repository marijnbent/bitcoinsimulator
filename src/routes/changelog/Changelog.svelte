<script>
  import { page } from '$app/stores';
</script>

<svelte:head>
  <title>Changelog</title>
  <meta name="description" content="Bitcoin Simulator Changelog" />
</svelte:head>

<section class="container mx-auto mt-8 p-4">
  <h1 class="text-2xl font-bold mb-8 cyberpunk-glow">Changelog</h1>

  <div class="mb-6">
    <h2 class="text-xl font-semibold mb-2 cyberpunk-glow">Version 1.0.1</h2>
     <ul class="list-disc pl-5">
      <li><strong>Bug fix:</strong> Fixed logout bug.</li>
      <li><strong>Enhancement:</strong> Added scrollbar styling.</li>
      <li><strong>Enhancement:</strong> Transaction handling improvements, mostly related to transactions to the same user.</li>
    </ul>
  </div>

  <div class="mb-6">
    <h2 class="text-xl font-semibold mb-2 cyberpunk-glow">Version 1.0</h2>
    <ul class="list-disc pl-5">
      <li><strong>Blockchain Simulation:</strong> Core engine for simulating blockchain operations</li>
      <li><strong>Wallet Management:</strong> Create, manage, and interact with multiple wallets</li>
      <li><strong>Transaction System:</strong> Send and receive Bitcoin transactions within the simulation</li>
      <li><strong>Mining Capability:</strong> Mine new blocks and add them to the blockchain</li>
    </ul>
  </div>
</section>