<script>
	// Props
	export let blocks = [];
	export let blockTree = [];
	export let expandedBlockId = null;
	export let selectedPreviousBlock = null;
	export let blockchainId;

	// Functions that need to be passed from parent
	export let toggleBlock;
	export let timeAgo;
</script>

<div class="mb-8">
	<h2 class="text-2xl font-bold mb-4">Blockchain</h2>

	{#if blocks.length === 0}
		<div class="p-6 cyberpunk-box rounded-lg text-center">
			<p class="text-cyan-500">
				No blocks in the blockchain yet. Mine the first
				block!
			</p>
		</div>
	{:else}
		<div class="overflow-x-auto pb-4">
			<div class="grid-container" style="min-width: max-content;">
				<!-- Check if blockTree is an array (old format) or object (new format) -->
				{#if Array.isArray(blockTree)}
					<!-- Old format - display chains as before -->
					<div class="flex flex-col space-y-6">
						{#each blockTree as chain}
							<div class="flex flex-col">
								<!-- Chain label -->
								<div class="mb-2 ml-2">
									{#if chain.isLongestChain}
										<span class="text-green-400 font-bold">Longest Chain</span>
									{:else}
										<span class="text-yellow-400">Fork Chain</span>
									{/if}
								</div>
								
								<!-- Chain blocks -->
								<div class="flex items-center">
									{#each chain.blocks as block, blockIndex}
										<!-- Connection line to previous block in same chain -->
										{#if blockIndex > 0}
											<div class="h-[2px] w-4 bg-cyan-600 self-center"></div>
										{/if}
										
										<!-- Block card -->
										<div
											class="cyberpunk-box rounded-lg p-4 min-w-[250px] hover:border-cyan-600 transition-colors relative"
											class:cyberpunk-box-selected={selectedPreviousBlock && selectedPreviousBlock.hash === block.hash}
											class:border-green-500={chain.isLongestChain}
											class:border-yellow-500={!chain.isLongestChain}
										>
											<div class="mb-2 flex justify-between items-center">
												<span class="font-bold text-cyan-400">Block {block.height}</span>
												<span class="text-xs text-cyan-600">{timeAgo(block.minedAt)}</span>
											</div>

											<div class="mb-2">
												<span class="text-cyan-500">Hash:</span>
												<span class="text-xs text-cyan-300 break-all">{block.hash.substring(0, 16)}...</span>
											</div>

											<div class="mb-2">
												<span class="text-cyan-500">Previous:</span>
												<span class="text-xs text-cyan-300 break-all">
													{block.previousHash.substring(0, 16)}...
												</span>
											</div>

											<div class="mb-2">
												<span class="text-cyan-500">Miner:</span>
												<span class="text-cyan-300">{block.minerUsername || "Unknown"}</span>
											</div>

											<div class="mb-2">
												<span class="text-cyan-500">Nonce:</span>
												<span class="text-cyan-300">{block.nonce}</span>
											</div>

											<div class="flex justify-between items-center">
												<div>
													<span class="text-cyan-500">Transactions:</span>
													<span class="text-cyan-300">{block.transactions ? block.transactions.length : 0}</span>
												</div>
												<div class="flex space-x-2">
													<button
														aria-label="View transactions"
														onclick={() => toggleBlock(block.id)}
														class="text-cyan-400 hover:text-cyan-300 focus:outline-none cursor-pointer"
														title="View Transactions"
													>
														<svg
															xmlns="http://www.w3.org/2000/svg"
															class="h-5 w-5"
															viewBox="0 0 20 20"
															fill="currentColor"
														>
															<path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
															<path
																fill-rule="evenodd"
																d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
																clip-rule="evenodd"
															/>
														</svg>
													</button>
													<button
														aria-label="Select as previous block"
														onclick={() => (selectedPreviousBlock = block)}
														class="text-purple-400 hover:text-purple-300 focus:outline-none cursor-pointer"
														title="Select as Previous Block"
														disabled={selectedPreviousBlock && selectedPreviousBlock.id === block.id}
													>
														<svg
															xmlns="http://www.w3.org/2000/svg"
															class="h-5 w-5"
															viewBox="0 0 20 20"
															fill="currentColor"
														>
															<path
																fill-rule="evenodd"
																d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
																clip-rule="evenodd"
															/>
														</svg>
													</button>
												</div>
											</div>
											
											<!-- Fork connection indicator -->
											{#if !chain.isLongestChain && blockIndex === 0 && chain.forkParent}
												<div class="absolute -top-6 left-1/2 transform -translate-x-1/2 h-6 w-[2px] bg-yellow-500"></div>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{:else if blockTree && blockTree.grid}
					<!-- New format - grid layout -->
					<div class="grid" style="display: grid; grid-template-columns: repeat({blockTree.maxColumn + 1}, minmax(270px, 1fr)); gap: 1rem;">
						<!-- For each row in the grid -->
						{#each Array(blockTree.maxRow + 1) as _, rowIndex}
							<!-- For each column in the grid -->
							{#each Array(blockTree.maxColumn + 1) as _, colIndex}
								<!-- Cell for this position -->
								<div class="grid-cell" style="grid-row: {rowIndex + 1}; grid-column: {colIndex + 1}; min-height: 200px; position: relative;">
									<!-- If there's a block at this position -->
									{#if blockTree.grid[rowIndex] && blockTree.grid[rowIndex][colIndex]}
										{@const block = blockTree.grid[rowIndex][colIndex]}
										
										<!-- Horizontal connection line to previous block -->
										{#if colIndex > 0 && blockTree.grid[rowIndex] && blockTree.grid[rowIndex][colIndex - 1]}
											<div class="h-[2px] w-4 bg-cyan-600 absolute left-[-1rem] top-[100px]"></div>
										{/if}
										
										<!-- Vertical connection line to parent block if this is a fork -->
										{#if block.forkParent && rowIndex > 0}
											<div class="w-[2px] h-8 bg-yellow-500 absolute left-[50%] top-[-2rem]"></div>
										{/if}
										
										<!-- Block card -->
										<div
											class="cyberpunk-box rounded-lg p-4 hover:border-cyan-600 transition-colors max-w-80 text-sm"
											class:cyberpunk-box-selected={selectedPreviousBlock && selectedPreviousBlock.hash === block.hash}
											class:border-green-500={block.isInLongestChain}
											class:border-yellow-500={!block.isInLongestChain}
										>
										<div class="mb-2 flex justify-between items-center">
											<span class="font-bold text-cyan-400">Block {block.height}</span>
											<span class="text-xs text-cyan-600">{timeAgo(block.minedAt)}</span>
										</div>

										<div class="mb-2">
											<span class="text-cyan-500">Hash:</span>
											<span class="text-xs text-cyan-300 break-all">{block.hash.substring(0, 16)}...</span>
										</div>

										<div class="mb-2">
											<span class="text-cyan-500">Previous:</span>
											<span class="text-xs text-cyan-300 break-all">
												{block.previousHash.substring(0, 16)}...
											</span>
										</div>

										<div class="mb-2">
											<span class="text-cyan-500">Miner:</span>
											<span class="text-cyan-300">{block.minerUsername || "Unknown"}</span>
										</div>

										<div class="mb-2">
											<span class="text-cyan-500">Nonce:</span>
											<span class="text-cyan-300">{block.nonce}</span>
										</div>

										<div class="flex justify-between items-center">
											<div>
												<span class="text-cyan-500">Transactions:</span>
												<span class="text-cyan-300">{block.transactions ? block.transactions.length : 0}</span>
											</div>
											<div class="flex space-x-2">
												<button
													aria-label="View transactions"
													onclick={() => toggleBlock(block.id)}
													class="text-cyan-400 hover:text-cyan-300 focus:outline-none cursor-pointer"
													title="View Transactions"
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-5 w-5"
														viewBox="0 0 20 20"
														fill="currentColor"
													>
														<path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
														<path
															fill-rule="evenodd"
															d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
															clip-rule="evenodd"
														/>
													</svg>
												</button>
												<button
													aria-label="Select as previous block"
													onclick={() => (selectedPreviousBlock = block)}
													class="text-purple-400 hover:text-purple-300 focus:outline-none cursor-pointer"
													title="Select as Previous Block"
													disabled={selectedPreviousBlock && selectedPreviousBlock.id === block.id}
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-5 w-5"
														viewBox="0 0 20 20"
														fill="currentColor"
													>
														<path
															fill-rule="evenodd"
															d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
															clip-rule="evenodd"
														/>
													</svg>
												</button>
											</div>
										</div>
									</div>
									{/if}
								</div>
							{/each}
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Expanded Block Transactions -->
		{#if expandedBlockId}
			{@const expandedBlock = blocks.find(
				(b) => b.id === expandedBlockId,
			)}
			{#if expandedBlock}
				<div class="mt-4 p-4 cyberpunk-box rounded-lg">
					<h3 class="text-xl font-bold mb-4">
						Transactions in Block
					</h3>

					{#if expandedBlock.transactions && expandedBlock.transactions.length > 0}
						<div class="overflow-x-auto">
							<table class="w-full text-left">
								<thead>
									<tr
										class="border-b border-cyan-800"
									>
										<th
											class="p-2 text-cyan-500"
											>From</th
										>
										<th
											class="p-2 text-cyan-500"
											>To</th
										>
										<th
											class="p-2 text-cyan-500"
											>Amount</th
										>
									</tr>
								</thead>
								<tbody>
									{#each expandedBlock.transactions as tx (tx.id)}
										<tr
											class="border-b border-cyan-900"
										>
											<td
												class="p-2 text-cyan-300"
												>{tx.senderUsername ||
													"System"}</td
											>
											<td
												class="p-2 text-cyan-300"
												>{tx.recipientUsername ||
													"Unknown"}</td
											>
											<td
												class="p-2 text-cyan-300"
												>{tx.amount} BTC</td
											>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<p class="text-cyan-500">
							No transactions in this block.
						</p>
					{/if}
				</div>
			{/if}
		{/if}
	{/if}
</div>
