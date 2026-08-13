<svelte:head>
	<title>Private Key Odds | Bitcoin Simulator</title>
	<meta
		name="description"
		content="A visual explanation of why brute-forcing a Bitcoin private key is not a practical attack."
	/>
</svelte:head>

<script>
	const comparisons = [
		{
			label: 'Lightning strike this year',
			odds: 'Very unlikely',
			exponent: 6
		},
		{
			label: 'Major lottery jackpot twice',
			odds: 'Wild luck',
			exponent: 16
		},
		{
			label: 'Same deck shuffle twice',
			odds: 'Still easier',
			exponent: 68
		},
		{
			label: 'Random Bitcoin private key hit',
			odds: 'Basically never',
			exponent: Math.log10(2) * 256,
			accent: true
		}
	];

	const milestones = [
		{
			label: 'Guesses per second',
			value: '1 billion every second',
			copy: 'Already extreme.'
		},
		{
			label: 'Guesses over 1 year',
			value: '31 quadrillion',
			copy: 'Still nowhere near enough.'
		},
		{
			label: 'Guesses over the age of the universe',
			value: '43 septillion',
			copy: 'Still basically zero of the full keyspace.'
		}
	];

	const attackPaths = [
		{
			title: 'Seed phrases exposed by malware or screenshots.',
			copy: 'Most losses happen because the secret leaks.'
		},
		{
			title: 'Passwords reused on wallet software or exchange accounts.',
			copy: 'Weak account security fails long before brute force matters.'
		},
		{
			title: 'Fake wallet apps, clipboard hijacking, and social engineering.',
			copy: 'The practical attack is getting you to reveal it.'
		}
	];

	const highestExponent = Math.max(...comparisons.map((item) => item.exponent));
	const lowestExponent = Math.min(...comparisons.map((item) => item.exponent));
	const exponentRange = highestExponent - lowestExponent;
	const privateKeySpaceLog10 = Math.log10(2) * 256;
	const secondsPerYearLog10 = Math.log10(60 * 60 * 24 * 365.25);

	const presets = [
		{
			label: 'Laptop',
			machineExponent: 0,
			guessExponent: 6,
			yearsExponent: 2,
			walletExponent: 8
		},
		{
			label: 'Warehouse',
			machineExponent: 6,
			guessExponent: 9,
			yearsExponent: 4,
			walletExponent: 8
		},
		{
			label: 'Planet Scale',
			machineExponent: 12,
			guessExponent: 12,
			yearsExponent: 6,
			walletExponent: 8
		},
		{
			label: 'Sci-Fi',
			machineExponent: 18,
			guessExponent: 18,
			yearsExponent: 12,
			walletExponent: 8
		}
	];

	let machineExponent = 6;
	let guessExponent = 9;
	let yearsExponent = 10;
	let walletExponent = 8;
	let graphMode = 'actual';

	function lineWidth(exponent) {
		const normalized = (highestExponent - exponent) / exponentRange;
		return Math.max(0.24, Math.pow(normalized, 1.08) * 100);
	}

	function trimNumber(value) {
		return value.replace(/\.0+$|(\.\d*[1-9])0+$/, '$1');
	}

	function scientificLabel(log10Value, decimals = 2) {
		const exponent = Math.floor(log10Value);
		const mantissa = 10 ** (log10Value - exponent);
		return `${trimNumber(mantissa.toFixed(decimals))} x 10^${exponent}`;
	}

	const namedPowers = {
		0: '1',
		1: '10',
		2: '100',
		3: '1 thousand',
		4: '10 thousand',
		5: '100 thousand',
		6: '1 million',
		7: '10 million',
		8: '100 million',
		9: '1 billion',
		10: '10 billion',
		11: '100 billion',
		12: '1 trillion',
		13: '10 trillion',
		14: '100 trillion',
		15: '1 quadrillion',
		16: '10 quadrillion',
		17: '100 quadrillion',
		18: '1 quintillion'
	};

	function friendlyCount(exponent, noun) {
		const base = namedPowers[exponent] || `10^${exponent}`;
		return `${base} ${noun}`;
	}

	function friendlyYears(exponent) {
		const base = namedPowers[exponent] || `10^${exponent}`;
		return `${base} years`;
	}

	function simplePercent(log10Value) {
		if (log10Value >= -4) {
			return `${trimNumber((10 ** log10Value * 100).toPrecision(2))}%`;
		}

		return 'So close to 0% that it may as well be 0%.';
	}

	function simpleChance(log10Probability) {
		if (log10Probability >= -6) {
			return 'Tiny, but not impossible.';
		}

		return 'Still basically zero.';
	}

	function overallVerdict(log10Probability) {
		if (log10Probability >= -6) {
			return 'You made it less impossible, but still wildly unlikely.';
		}

		if (log10Probability >= -20) {
			return 'Still nowhere close.';
		}

		return 'Still basically impossible.';
	}

	function applyPreset(preset) {
		machineExponent = preset.machineExponent;
		guessExponent = preset.guessExponent;
		yearsExponent = preset.yearsExponent;
		walletExponent = preset.walletExponent;
	}

	function isPresetActive(preset) {
		return (
			machineExponent === preset.machineExponent &&
			guessExponent === preset.guessExponent &&
			yearsExponent === preset.yearsExponent &&
			walletExponent === preset.walletExponent
		);
	}

	function nudgeControl(control, delta) {
		if (control === 'machine') {
			machineExponent = Math.max(0, Math.min(18, machineExponent + delta));
			return;
		}

		if (control === 'guess') {
			guessExponent = Math.max(3, Math.min(18, guessExponent + delta));
			return;
		}

		if (control === 'years') {
			yearsExponent = Math.max(0, Math.min(12, yearsExponent + delta));
			return;
		}

		walletExponent = Math.max(0, Math.min(12, walletExponent + delta));
	}

	function controlProgress(value, min, max) {
		return `${((value - min) / (max - min)) * 100}%`;
	}

	function powerLabel(log10Value) {
		return `10^${trimNumber(log10Value.toFixed(1))}`;
	}

	function oneInLabel(log10Probability) {
		if (log10Probability >= 0) {
			return '1 in 1';
		}

		return `1 in ${powerLabel(-log10Probability)}`;
	}

	$: totalGuessLog10 = machineExponent + guessExponent + yearsExponent + secondsPerYearLog10;
	$: keyspaceShareLog10 = totalGuessLog10 - privateKeySpaceLog10;
	$: fundedWalletHitLog10 = totalGuessLog10 + walletExponent - privateKeySpaceLog10;
	$: shortfallLog10 = privateKeySpaceLog10 - totalGuessLog10;
	$: plainKeyspaceShareText = simplePercent(keyspaceShareLog10);
	$: plainVerdict = overallVerdict(fundedWalletHitLog10);
	$: machineLabel = friendlyCount(machineExponent, machineExponent === 0 ? 'machine' : 'machines');
	$: guessLabel = `${namedPowers[guessExponent] || `10^${guessExponent}`} guesses per second`;
	$: yearLabel = friendlyYears(yearsExponent);
	$: walletLabel = friendlyCount(walletExponent, walletExponent === 0 ? 'wallet' : 'wallets');
	$: activePresetLabel = presets.find((preset) => isPresetActive(preset))?.label || 'Custom';
	$: totalGuessesText = scientificLabel(totalGuessLog10, 1);
	$: searchWidthPct = Math.min(100, (totalGuessLog10 / privateKeySpaceLog10) * 100);
	$: combinedReachPct = Math.min(100, ((totalGuessLog10 + walletExponent) / privateKeySpaceLog10) * 100);
	$: targetWidthPct = Math.max(0, combinedReachPct - searchWidthPct);
	$: combinedReachText = `10^${trimNumber((totalGuessLog10 + walletExponent).toFixed(1))}`;
	$: combinedReachPowerText = powerLabel(totalGuessLog10 + walletExponent);
	$: shortfallOrders = Math.max(0, privateKeySpaceLog10 - (totalGuessLog10 + walletExponent));
	$: actualCoveragePct = Math.min(100, Math.max(0, 10 ** keyspaceShareLog10 * 100));
	$: actualCoverageVisible = actualCoveragePct >= 0.35;
	$: keyspaceCoverageText =
		keyspaceShareLog10 >= 0 ? '100% of the keyspace' : oneInLabel(keyspaceShareLog10);
	$: fundedWalletOddsText =
		fundedWalletHitLog10 >= 0 ? 'Better than 1 in 1' : oneInLabel(fundedWalletHitLog10);
	$: searchPowerText = powerLabel(totalGuessLog10);
	$: keyspacePowerText = powerLabel(privateKeySpaceLog10);
	$: roundedShortfallOrders = Math.max(0, Math.ceil(shortfallOrders));
	$: missingOrderSteps = Array.from({ length: roundedShortfallOrders }, (_, index) => index);
	$: shortfallText =
		shortfallLog10 > 0
			? `You are still missing roughly ${Math.max(1, Math.round(shortfallLog10))} extra zeroes of search power.`
			: 'On paper you have crossed the whole keyspace.';
</script>

<section class="odds-page">
	<div class="noise" aria-hidden="true"></div>
	<div class="glow glow-left" aria-hidden="true"></div>
	<div class="glow glow-right" aria-hidden="true"></div>

		<section class="hero">
			<div class="hero-copy">
				<h1>Brute force doesn't crack Bitcoin private keys.</h1>
				<p class="hero-text">Even extreme hardware barely dents the search space.</p>
			<div class="hero-actions">
				<a href="#play" class="primary-link">Open calculator</a>
				<a href="/" class="secondary-link">Open simulator</a>
			</div>
			<p class="hero-proof">2^256 possible keys. Real failures usually come from leaked secrets.</p>
		</div>

		<div class="hero-visual" aria-hidden="true">
			<div class="visual-stage">
				<div class="visual-field"></div>
				<div class="visual-stat">
					<p class="visual-label">Search space</p>
					<div class="visual-number">2<sup>256</sup></div>
					<p class="visual-copy">possible private keys</p>
				</div>
				<div class="visual-axis">
					<div class="visual-line">
						<div class="visual-line-fill"></div>
						<div class="visual-origin"></div>
						<div class="visual-window"></div>
						<div class="visual-target"></div>
					</div>
					<div class="visual-caption">
						<span>your search starts here</span>
						<span>one correct key, far away</span>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="scale-section" id="scale">
		<div class="section-intro">
			<h2>Even “crazy fast forever” is still not enough.</h2>
		</div>

		<div class="scale-layout">
			<div class="scale-sticky">
				<p>
					Start with a very generous attacker: one machine guessing one billion times every
					second for the entire age of the universe.
				</p>
			</div>

			<div class="milestone-list">
				{#each milestones as item}
					<article class="milestone">
						<p class="milestone-label">{item.label}</p>
						<p class="milestone-value">{item.value}</p>
						<p class="milestone-copy">{item.copy}</p>
					</article>
				{/each}
			</div>
		</div>
	</section>

	<section class="play-section" id="play">
		<div class="section-intro">
			<h2>Turn the sliders up. The answer is still basically “no.”</h2>
		</div>

		<div class="play-layout">
			<div class="play-controls">
				<div class="play-toolbar" aria-label="Live setup">
					<div class="play-chip">
						<span>Scenario</span>
						<strong>{activePresetLabel}</strong>
					</div>
					<div class="play-chip">
						<span>Total guesses</span>
						<strong class="mono">{totalGuessesText}</strong>
					</div>
				</div>

				<div class="preset-row" aria-label="Presets">
					{#each presets as preset}
						<button
							type="button"
							class="preset-button"
							class:is-active={isPresetActive(preset)}
							onclick={() => applyPreset(preset)}
						>
							{preset.label}
						</button>
					{/each}
				</div>

				<label class="control" style={`--control-progress: ${controlProgress(machineExponent, 0, 18)};`}>
					<div class="control-head">
						<span>Machines</span>
						<strong>{machineLabel}</strong>
					</div>
					<div class="control-row">
						<button
							type="button"
							class="control-step"
							onclick={() => nudgeControl('machine', -1)}
							disabled={machineExponent === 0}
							aria-label="Decrease machines"
						>
							−
						</button>
						<input type="range" bind:value={machineExponent} min="0" max="18" step="1" />
						<button
							type="button"
							class="control-step"
							onclick={() => nudgeControl('machine', 1)}
							disabled={machineExponent === 18}
							aria-label="Increase machines"
						>
							+
						</button>
					</div>
				</label>

				<label class="control" style={`--control-progress: ${controlProgress(guessExponent, 3, 18)};`}>
					<div class="control-head">
						<span>Guesses per second per machine</span>
						<strong>{guessLabel}</strong>
					</div>
					<div class="control-row">
						<button
							type="button"
							class="control-step"
							onclick={() => nudgeControl('guess', -1)}
							disabled={guessExponent === 3}
							aria-label="Decrease guesses per second"
						>
							−
						</button>
						<input type="range" bind:value={guessExponent} min="3" max="18" step="1" />
						<button
							type="button"
							class="control-step"
							onclick={() => nudgeControl('guess', 1)}
							disabled={guessExponent === 18}
							aria-label="Increase guesses per second"
						>
							+
						</button>
					</div>
				</label>

				<label class="control" style={`--control-progress: ${controlProgress(yearsExponent, 0, 12)};`}>
					<div class="control-head">
						<span>Run time</span>
						<strong>{yearLabel}</strong>
					</div>
					<div class="control-row">
						<button
							type="button"
							class="control-step"
							onclick={() => nudgeControl('years', -1)}
							disabled={yearsExponent === 0}
							aria-label="Decrease run time"
						>
							−
						</button>
						<input type="range" bind:value={yearsExponent} min="0" max="12" step="1" />
						<button
							type="button"
							class="control-step"
							onclick={() => nudgeControl('years', 1)}
							disabled={yearsExponent === 12}
							aria-label="Increase run time"
						>
							+
						</button>
					</div>
				</label>

				<label class="control" style={`--control-progress: ${controlProgress(walletExponent, 0, 12)};`}>
					<div class="control-head">
						<span>Funded wallets in play</span>
						<strong>{walletLabel}</strong>
					</div>
					<div class="control-row">
						<button
							type="button"
							class="control-step"
							onclick={() => nudgeControl('wallet', -1)}
							disabled={walletExponent === 0}
							aria-label="Decrease funded wallets"
						>
							−
						</button>
						<input type="range" bind:value={walletExponent} min="0" max="12" step="1" />
						<button
							type="button"
							class="control-step"
							onclick={() => nudgeControl('wallet', 1)}
							disabled={walletExponent === 12}
							aria-label="Increase funded wallets"
						>
							+
						</button>
					</div>
				</label>
			</div>

			<div class="play-output">
				<div class="play-value play-value--plain">{plainVerdict}</div>
				<p class="play-copy">
					{machineLabel}, each doing {guessLabel}, for {yearLabel}.
				</p>

				<div class="play-graph" aria-label="Probability graph">
					<div class="play-graph__top">
						<div class="play-graph__head">
							<p>{graphMode === 'actual' ? 'Actual scale' : 'Compressed log scale'}</p>
							<span
								>{graphMode === 'actual'
									? actualCoverageVisible
										? keyspaceCoverageText
										: 'Too small to draw to scale'
									: `${Math.round(shortfallOrders)} orders short`}</span
							>
						</div>
						<div class="play-graph__modes" role="tablist" aria-label="Graph mode">
							<button
								type="button"
								class="play-graph__mode"
								class:is-active={graphMode === 'actual'}
								onclick={() => (graphMode = 'actual')}
							>
								Actual scale
							</button>
							<button
								type="button"
								class="play-graph__mode"
								class:is-active={graphMode === 'log'}
								onclick={() => (graphMode = 'log')}
							>
								Log scale
							</button>
						</div>
					</div>

					{#if graphMode === 'actual'}
						<div class="play-graph__bar play-graph__bar--actual" aria-hidden="true">
							{#if actualCoverageVisible}
								<div
									class="play-graph__segment play-graph__segment--search"
									style={`width: ${actualCoveragePct}%;`}
								></div>
							{:else}
								<div class="play-graph__spark"></div>
							{/if}
							<div class="play-graph__goal"></div>
						</div>
						<div class="play-graph__ticks play-graph__ticks--actual" aria-hidden="true">
							<span>your search</span>
							<span>entire keyspace</span>
						</div>
						<p class="play-graph__note">
							On a true scale, this setup covers {keyspaceCoverageText.toLowerCase()}.
						</p>
					{:else}
						<div class="play-graph__bar" aria-hidden="true">
							<div class="play-graph__segment play-graph__segment--search" style={`width: ${searchWidthPct}%;`}></div>
							<div class="play-graph__segment play-graph__segment--targets" style={`width: ${targetWidthPct}%;`}></div>
							<div class="play-graph__goal"></div>
						</div>
						<div class="play-graph__ticks" aria-hidden="true">
							<span>{searchPowerText} searched</span>
							<span>{combinedReachText} with targets</span>
							<span>{keyspacePowerText} full space</span>
						</div>
						<p class="play-graph__note">
							This compressed view compares orders of magnitude, not real distance.
						</p>
					{/if}

					<div class="play-graph__legend">
						<div>
							<span>Your maximum reach</span>
							<strong class="mono">{combinedReachPowerText}</strong>
						</div>
						<div>
							<span>Bitcoin keyspace</span>
							<strong class="mono">{keyspacePowerText}</strong>
						</div>
						<div>
							<span>Chance to hit a funded wallet</span>
							<strong class="mono">{fundedWalletOddsText}</strong>
						</div>
					</div>

					<div class="play-gap">
						<div class="play-gap__head">
							<p>{roundedShortfallOrders} extra zeroes still missing</p>
							<span>Each block is one order of magnitude</span>
						</div>
						<div class="play-gap__blocks" aria-hidden="true">
							{#each missingOrderSteps as _, index}
								<div class="play-gap__block" style={`--delay: ${index * 35}ms;`}></div>
							{/each}
						</div>
					</div>

					<div class="play-figures">
						<div>
							<span>Coverage of the keyspace</span>
							<strong class="mono">{keyspaceCoverageText}</strong>
						</div>
						<div>
							<span>Share of the keyspace</span>
							<strong>{plainKeyspaceShareText}</strong>
						</div>
					</div>
				</div>

				<p class="play-note">{shortfallText}</p>
			</div>
		</div>
	</section>

	<section class="comparison-section">
		<div class="section-intro">
			<h2>Things that already sound impossible are still easier.</h2>
		</div>

		<div class="comparison-list" aria-label="Odds comparison">
			{#each comparisons as item, index}
				<div
					class:accent-row={item.accent}
					class="comparison-row"
					style={`--delay: ${index * 120}ms; --line-width: ${lineWidth(item.exponent)}%;`}
				>
					<div class="comparison-copy">
						<p>{item.label}</p>
						<div class="comparison-meta">
							<span>{item.odds}</span>
						</div>
					</div>
					<div class="comparison-line" aria-hidden="true">
						<div class="comparison-fill"></div>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<section class="reality-section">
		<div class="section-intro">
			<h2>Real attacks do not guess the key. They steal the secret.</h2>
		</div>

		<div class="attack-list">
			{#each attackPaths as item}
				<article class="attack-item">
					<h3>{item.title}</h3>
					<p>{item.copy}</p>
				</article>
			{/each}
		</div>

		<div class="final-cta">
			<p>Protect the seed phrase, the device, and the workflow.</p>
			<a href="/" class="primary-link">Back to simulator</a>
		</div>
	</section>
</section>

<style>
	:global(html) {
		scroll-behavior: smooth;
	}

	.odds-page {
		position: relative;
		width: 100%;
		max-width: 100%;
		overflow-x: clip;
		overflow-y: clip;
		background:
			radial-gradient(circle at top left, rgba(46, 204, 113, 0.14), transparent 30%),
			radial-gradient(circle at 80% 20%, rgba(46, 204, 113, 0.08), transparent 22%),
			linear-gradient(180deg, #030506 0%, #060b09 45%, #020403 100%);
		color: #edf2ef;
		font-family: 'IBM Plex Sans', 'Segoe UI', sans-serif;
	}

	.noise,
	.glow {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.noise {
		background-image:
			repeating-linear-gradient(
				0deg,
				rgba(255, 255, 255, 0.02) 0,
				rgba(255, 255, 255, 0.02) 1px,
				transparent 1px,
				transparent 4px
			),
			repeating-linear-gradient(
				90deg,
				rgba(255, 255, 255, 0.015) 0,
				rgba(255, 255, 255, 0.015) 1px,
				transparent 1px,
				transparent 72px
			);
		opacity: 0.24;
	}

	.glow {
		filter: blur(80px);
		animation: breathe 12s ease-in-out infinite alternate;
	}

	.glow-left {
		background: radial-gradient(circle at 20% 20%, rgba(46, 204, 113, 0.24), transparent 30%);
	}

	.glow-right {
		background: radial-gradient(circle at 80% 40%, rgba(255, 91, 91, 0.12), transparent 22%);
	}

	.hero,
	.play-section,
	.scale-section,
	.comparison-section,
	.reality-section {
		position: relative;
		z-index: 1;
		width: min(1200px, calc(100% - 2rem));
		margin: 0 auto;
	}

	.hero {
		display: grid;
		grid-template-columns: minmax(0, 34rem) minmax(0, 1fr);
		gap: clamp(2rem, 5vw, 6rem);
		align-items: center;
		min-height: calc(100svh - 5.2rem);
		padding: clamp(1.25rem, 3vw, 2.6rem) 0 clamp(4rem, 6vw, 5rem);
	}

	.hero-copy {
		display: grid;
		gap: 1.1rem;
	}

	.hero-copy > * {
		animation: rise 700ms ease both;
	}

	.hero-copy > :nth-child(1) {
		animation-delay: 0ms;
	}

	.hero-copy > :nth-child(2) {
		animation-delay: 60ms;
	}

	.hero-copy > :nth-child(3) {
		animation-delay: 120ms;
	}

	.hero-copy > :nth-child(4) {
		animation-delay: 180ms;
	}

	.hero-copy > :nth-child(5) {
		animation-delay: 240ms;
	}

	.hero-copy > :nth-child(6) {
		animation-delay: 300ms;
	}

	h1,
	h2 {
		margin: 0;
		font-weight: 700;
		letter-spacing: -0.04em;
		text-wrap: balance;
	}

	h1 {
		max-width: 11.4ch;
		font-size: clamp(2.45rem, 4.5vw, 4.4rem);
		line-height: 0.92;
	}

	h2 {
		max-width: 18ch;
		font-size: clamp(1.4rem, 2.6vw, 2rem);
		line-height: 1.12;
	}

	.hero-text,
	.scale-sticky p,
	.milestone-copy,
	.attack-list p,
	.final-cta p {
		color: rgba(237, 242, 239, 0.76);
	}

	.hero-text {
		max-width: 22rem;
		margin: 0;
		font-size: clamp(0.98rem, 1.15vw, 1.04rem);
		line-height: 1.55;
	}

	.hero-proof {
		max-width: 26rem;
		margin: 0.35rem 0 0;
		color: rgba(237, 242, 239, 0.62);
		font-size: 0.94rem;
		line-height: 1.5;
	}

	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		margin-top: 0.45rem;
	}

	.primary-link,
	.secondary-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.95rem 1.3rem;
		border-radius: 999px;
		font-size: 0.96rem;
		font-weight: 700;
		text-decoration: none;
		transition:
			transform 180ms ease,
			background-color 180ms ease,
			border-color 180ms ease,
			color 180ms ease;
	}

	.primary-link {
		background: #8ce7b2;
		color: #041108;
	}

	.secondary-link {
		border: 1px solid rgba(140, 231, 178, 0.28);
		color: #edf2ef;
	}

	.primary-link:hover,
	.secondary-link:hover {
		transform: translateY(-2px);
	}

	.hero-visual {
		position: relative;
		min-height: 24rem;
		display: grid;
		align-items: center;
	}

	.visual-label {
		margin: 0;
		color: rgba(237, 242, 239, 0.56);
		font-size: 0.88rem;
	}

	.visual-stage {
		position: relative;
		display: grid;
		grid-template-columns: minmax(10rem, 13rem) minmax(0, 1fr);
		align-items: center;
		gap: clamp(1.25rem, 3vw, 3rem);
		min-height: 22rem;
		padding: 1rem 0 1rem 1rem;
		animation: rise 900ms 120ms ease both;
	}

	.visual-field {
		position: absolute;
		inset: 0.75rem 0 0.75rem 3rem;
		border: 1px solid rgba(140, 231, 178, 0.1);
		border-radius: 48% 42% 46% 40% / 44% 50% 42% 54%;
		background:
			radial-gradient(circle at 22% 48%, rgba(140, 231, 178, 0.16), transparent 24%),
			radial-gradient(circle at 58% 48%, rgba(140, 231, 178, 0.06), transparent 30%);
	}

	.visual-stat {
		position: relative;
		z-index: 1;
		display: grid;
		align-content: start;
		gap: 0.18rem;
	}

	.visual-number {
		color: rgba(237, 242, 239, 0.92);
		font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: clamp(4rem, 7vw, 6.4rem);
		font-weight: 700;
		line-height: 0.82;
		letter-spacing: -0.08em;
		text-shadow: 0 0 32px rgba(140, 231, 178, 0.16);
	}

	.visual-number sup {
		font-size: 0.36em;
		top: -1.2em;
	}

	.visual-copy {
		margin: 0;
		color: rgba(237, 242, 239, 0.58);
		font-size: 0.9rem;
		line-height: 1.35;
	}

	.visual-axis {
		position: relative;
		z-index: 1;
		display: grid;
		align-content: center;
		gap: 0.8rem;
		padding-bottom: 0.1rem;
	}

	.visual-line {
		position: relative;
		height: 2px;
		background: rgba(237, 242, 239, 0.18);
		overflow: visible;
	}

	.visual-line-fill {
		position: absolute;
		inset: 0 auto 0 0;
		width: 100%;
		background: linear-gradient(90deg, rgba(140, 231, 178, 0.9), rgba(140, 231, 178, 0.12));
		transform-origin: left center;
		animation: reveal-line 1s 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}

	.visual-target {
		position: absolute;
		top: 50%;
		right: 0;
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: #ff5b5b;
		box-shadow: 0 0 18px rgba(255, 91, 91, 0.8);
		transform: translate(50%, -50%);
		animation: pulse 2.8s ease-in-out infinite;
	}

	.visual-origin {
		position: absolute;
		top: 50%;
		left: 0;
		width: 0.65rem;
		height: 0.65rem;
		border-radius: 999px;
		background: rgba(140, 231, 178, 0.95);
		box-shadow: 0 0 20px rgba(140, 231, 178, 0.4);
		transform: translate(-10%, -50%);
	}

	.visual-window {
		position: absolute;
		top: 50%;
		left: 0.7rem;
		width: clamp(2.8rem, 8vw, 4rem);
		height: 0.42rem;
		border-radius: 999px;
		background: linear-gradient(90deg, rgba(140, 231, 178, 0.9), rgba(140, 231, 178, 0.18));
		box-shadow: 0 0 18px rgba(140, 231, 178, 0.32);
		transform: translateY(-50%);
		animation: reveal-line 1.1s 300ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}

	.visual-caption {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 0.4rem;
		color: rgba(237, 242, 239, 0.48);
		font-size: 0.78rem;
	}

	.section-intro {
		display: grid;
		gap: 0.6rem;
		padding-top: clamp(3.5rem, 7vw, 6rem);
	}

	.play-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(19rem, 25rem);
		gap: clamp(2rem, 6vw, 6rem);
		margin-top: 2rem;
		padding-top: 1.5rem;
		border-top: 1px solid rgba(237, 242, 239, 0.16);
		align-items: start;
	}

	.play-controls {
		display: grid;
		gap: 0.9rem;
		padding-right: clamp(0rem, 2vw, 1.5rem);
	}

	.play-toolbar {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
		margin-bottom: 0.1rem;
	}

	.play-chip {
		display: grid;
		gap: 0.2rem;
		padding: 0.8rem 0.95rem;
		border: 1px solid rgba(140, 231, 178, 0.12);
		border-radius: 1rem;
		background: rgba(7, 15, 12, 0.28);
	}

	.play-chip span {
		color: rgba(237, 242, 239, 0.48);
		font-size: 0.78rem;
	}

	.play-chip strong {
		color: #edf2ef;
		font-size: 0.98rem;
		font-weight: 700;
	}

	.preset-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
	}

	.preset-button {
		padding: 0.6rem 0.95rem;
		border: 1px solid rgba(140, 231, 178, 0.18);
		border-radius: 999px;
		background: transparent;
		color: #edf2ef;
		font: inherit;
		cursor: pointer;
		transition:
			transform 180ms ease,
			border-color 180ms ease,
			background-color 180ms ease;
	}

	.preset-button:hover {
		transform: translateY(-1px);
		border-color: rgba(140, 231, 178, 0.5);
		background: rgba(140, 231, 178, 0.08);
	}

	.preset-button.is-active {
		border-color: rgba(140, 231, 178, 0.42);
		background: rgba(140, 231, 178, 0.14);
		color: #fff;
	}

	.control {
		position: relative;
		display: grid;
		gap: 0.6rem;
		padding: 1rem;
		border: 1px solid rgba(237, 242, 239, 0.1);
		border-radius: 1rem;
		background: rgba(7, 12, 10, 0.28);
		overflow: hidden;
	}

	.control:first-of-type {
		padding-top: 1rem;
	}

	.control::after {
		content: '';
		position: absolute;
		right: auto;
		bottom: 0;
		left: 0;
		width: var(--control-progress);
		height: 2px;
		background: linear-gradient(90deg, rgba(140, 231, 178, 0.9), rgba(140, 231, 178, 0.18));
	}

	.control-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	.control-row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.75rem;
	}

	.control-head span,
	.play-chip span,
	.play-copy,
	.play-figures span {
		color: rgba(237, 242, 239, 0.52);
		font-size: 0.85rem;
	}

	.control-head strong {
		color: #8ce7b2;
		font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 0.96rem;
		font-weight: 700;
	}

	.control input[type='range'] {
		width: 100%;
		accent-color: #8ce7b2;
	}

	.control-step {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border: 1px solid rgba(140, 231, 178, 0.16);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.02);
		color: #edf2ef;
		font: inherit;
		cursor: pointer;
		transition:
			transform 160ms ease,
			border-color 160ms ease,
			background-color 160ms ease,
			opacity 160ms ease;
	}

	.control-step:hover {
		transform: translateY(-1px);
		border-color: rgba(140, 231, 178, 0.38);
		background: rgba(140, 231, 178, 0.08);
	}

	.control-step:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.play-output {
		display: grid;
		align-content: start;
		gap: 1rem;
		position: sticky;
		top: 6.75rem;
		padding-left: clamp(1.1rem, 2vw, 1.6rem);
		border-left: 1px solid rgba(237, 242, 239, 0.14);
		min-height: 18rem;
	}

	.play-copy {
		margin: 0;
	}

	.play-value {
		color: #edf2ef;
		font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: clamp(2rem, 4vw, 3.8rem);
		font-weight: 700;
		line-height: 0.94;
		letter-spacing: -0.06em;
	}

	.play-value--plain {
		font-family: 'IBM Plex Sans', 'Segoe UI', sans-serif;
		font-size: clamp(1.65rem, 2.7vw, 2.5rem);
		line-height: 0.98;
		letter-spacing: -0.04em;
	}

	.play-graph {
		display: grid;
		gap: 0.75rem;
		margin-top: 0.15rem;
	}

	.play-graph__top {
		display: grid;
		gap: 0.8rem;
	}

	.play-graph__head,
	.play-graph__ticks,
	.play-graph__legend {
		display: flex;
		justify-content: space-between;
		gap: 0.8rem;
	}

	.play-graph__head p,
	.play-graph__head span,
	.play-graph__ticks span,
	.play-graph__legend span {
		margin: 0;
		color: rgba(237, 242, 239, 0.52);
		font-size: 0.8rem;
	}

	.play-graph__head span {
		color: rgba(255, 91, 91, 0.82);
	}

	.play-graph__modes {
		display: inline-flex;
		width: fit-content;
		padding: 0.24rem;
		border: 1px solid rgba(237, 242, 239, 0.12);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.02);
	}

	.play-graph__mode {
		padding: 0.45rem 0.8rem;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: rgba(237, 242, 239, 0.58);
		font: inherit;
		font-size: 0.84rem;
		cursor: pointer;
		transition:
			background-color 180ms ease,
			color 180ms ease,
			transform 180ms ease;
	}

	.play-graph__mode:hover {
		transform: translateY(-1px);
		color: #edf2ef;
	}

	.play-graph__mode.is-active {
		background: rgba(140, 231, 178, 0.14);
		color: #edf2ef;
	}

	.play-graph__bar {
		position: relative;
		display: flex;
		height: 0.9rem;
		border-radius: 999px;
		background: rgba(237, 242, 239, 0.08);
		overflow: hidden;
	}

	.play-graph__bar--actual {
		background:
			linear-gradient(90deg, rgba(140, 231, 178, 0.08), rgba(237, 242, 239, 0.05)),
			rgba(237, 242, 239, 0.06);
	}

	.play-graph__segment {
		height: 100%;
	}

	.play-graph__segment--search {
		background: linear-gradient(90deg, rgba(140, 231, 178, 0.92), rgba(140, 231, 178, 0.62));
	}

	.play-graph__segment--targets {
		background: linear-gradient(90deg, rgba(250, 204, 21, 0.92), rgba(250, 204, 21, 0.58));
	}

	.play-graph__goal {
		position: absolute;
		top: 50%;
		right: 0;
		width: 0.8rem;
		height: 0.8rem;
		border: 2px solid rgba(255, 91, 91, 0.95);
		border-radius: 999px;
		background: #060b09;
		transform: translate(40%, -50%);
	}

	.play-graph__spark {
		position: absolute;
		top: 50%;
		left: 0;
		width: 2px;
		height: 1.2rem;
		border-radius: 999px;
		background: rgba(140, 231, 178, 0.96);
		box-shadow: 0 0 18px rgba(140, 231, 178, 0.38);
		transform: translateY(-50%);
	}

	.play-graph__ticks {
		font-size: 0.78rem;
	}

	.play-graph__ticks--actual {
		display: flex;
		justify-content: space-between;
	}

	.play-graph__ticks span:nth-child(2) {
		text-align: center;
	}

	.play-graph__ticks span:last-child {
		text-align: right;
	}

	.play-graph__note {
		margin: 0;
		color: rgba(237, 242, 239, 0.68);
		font-size: 0.86rem;
		line-height: 1.5;
	}

	.play-graph__legend {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.8rem;
		padding-top: 0.95rem;
		border-top: 1px solid rgba(237, 242, 239, 0.12);
	}

	.play-graph__legend div {
		display: grid;
		gap: 0.25rem;
	}

	.play-graph__legend strong {
		color: #edf2ef;
		font-size: 0.92rem;
		font-weight: 700;
	}

	.play-gap {
		display: grid;
		gap: 0.8rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(237, 242, 239, 0.12);
	}

	.play-gap__head {
		display: flex;
		justify-content: space-between;
		gap: 0.8rem;
		align-items: baseline;
	}

	.play-gap__head p,
	.play-gap__head span {
		margin: 0;
	}

	.play-gap__head p {
		color: #edf2ef;
		font-size: 0.96rem;
		font-weight: 700;
	}

	.play-gap__head span {
		color: rgba(237, 242, 239, 0.52);
		font-size: 0.8rem;
	}

	.play-gap__blocks {
		display: grid;
		grid-template-columns: repeat(11, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.play-gap__block {
		height: 1rem;
		border: 1px solid rgba(255, 91, 91, 0.2);
		border-radius: 0.42rem;
		background: linear-gradient(180deg, rgba(255, 91, 91, 0.22), rgba(255, 91, 91, 0.06));
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.015) inset;
		animation: rise 500ms ease both;
		animation-delay: var(--delay);
	}

	.play-figures {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(237, 242, 239, 0.12);
	}

	.play-figures div {
		display: grid;
		gap: 0.4rem;
	}

	.play-figures strong {
		color: #edf2ef;
		font-size: clamp(1.2rem, 2.3vw, 1.7rem);
		font-weight: 700;
		line-height: 1.1;
	}

	.play-note {
		margin: 0.2rem 0 0;
		color: rgba(255, 91, 91, 0.82);
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.scale-layout {
		display: grid;
		grid-template-columns: minmax(0, 24rem) minmax(0, 1fr);
		gap: clamp(2rem, 7vw, 7rem);
		margin-top: 2rem;
	}

	.scale-sticky {
		position: relative;
	}

	.scale-sticky p {
		position: sticky;
		top: 2rem;
		margin: 0;
		max-width: 22rem;
		font-size: clamp(1.1rem, 1.9vw, 1.35rem);
		line-height: 1.55;
	}

	.milestone-list {
		border-top: 1px solid rgba(237, 242, 239, 0.16);
	}

	.milestone {
		padding: 1.35rem 0 1.55rem;
		border-bottom: 1px solid rgba(237, 242, 239, 0.16);
	}

	.milestone-label {
		margin: 0;
		color: #8ce7b2;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.milestone-value {
		margin: 0.4rem 0 0;
		font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: clamp(1.45rem, 2.8vw, 2.6rem);
		font-weight: 700;
		line-height: 1;
		color: #edf2ef;
	}

	.milestone-copy {
		margin: 0.55rem 0 0;
		max-width: 26rem;
		font-size: 1rem;
		line-height: 1.6;
	}

	.comparison-list {
		margin-top: 2rem;
		border-top: 1px solid rgba(237, 242, 239, 0.16);
	}

	.comparison-row {
		display: grid;
		grid-template-columns: minmax(0, 26rem) minmax(0, 1fr);
		gap: 1rem 2rem;
		align-items: center;
		padding: 1.2rem 0;
		border-bottom: 1px solid rgba(237, 242, 239, 0.16);
		animation: rise 700ms ease both;
		animation-delay: var(--delay);
	}

	.comparison-copy p {
		margin: 0;
		font-size: clamp(1rem, 1.4vw, 1.18rem);
		color: #edf2ef;
	}

	.comparison-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem 1rem;
		margin-top: 0.45rem;
		color: rgba(237, 242, 239, 0.55);
		font-size: 0.88rem;
	}

	.comparison-line {
		position: relative;
		height: 1.25rem;
		display: flex;
		align-items: center;
	}

	.comparison-line::before {
		content: '';
		position: absolute;
		inset: 50% 0 auto;
		height: 1px;
		background: rgba(237, 242, 239, 0.15);
		transform: translateY(-50%);
	}

	.comparison-fill {
		position: relative;
		z-index: 1;
		height: 0.8rem;
		width: var(--line-width);
		min-width: 3px;
		border-radius: 999px;
		background: linear-gradient(90deg, #a6f0c4 0%, #6fd79a 100%);
		transform-origin: left center;
		animation: reveal-line 850ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
		animation-delay: calc(var(--delay) + 120ms);
	}

	.accent-row .comparison-meta {
		color: rgba(255, 91, 91, 0.74);
	}

	.accent-row .comparison-fill {
		background: linear-gradient(90deg, #ff8b8b 0%, #ff5b5b 100%);
		box-shadow: 0 0 16px rgba(255, 91, 91, 0.28);
	}

	.reality-section {
		padding-bottom: clamp(3rem, 7vw, 6rem);
	}

	.attack-list {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1.1rem 1.8rem;
		margin-top: 2rem;
		padding-top: 1.2rem;
		border-top: 1px solid rgba(237, 242, 239, 0.16);
	}

	.attack-item {
		display: grid;
		align-content: start;
		gap: 0.45rem;
		padding-top: 0.35rem;
	}

	.attack-item h3 {
		margin: 0;
		max-width: 18ch;
		font-size: clamp(1.1rem, 1.8vw, 1.4rem);
		line-height: 1.18;
		letter-spacing: -0.03em;
		color: #edf2ef;
	}

	.attack-item p:last-child {
		margin: 0;
		max-width: 22rem;
		font-size: 0.98rem;
		line-height: 1.65;
	}

	.final-cta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem 2rem;
		margin-top: 2.5rem;
		padding-top: 1.35rem;
		border-top: 1px solid rgba(237, 242, 239, 0.16);
	}

	.final-cta p {
		margin: 0;
		font-size: 1rem;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(18px);
		}

		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes reveal-line {
		from {
			transform: scaleX(0);
		}

		to {
			transform: scaleX(1);
		}
	}

	@keyframes breathe {
		from {
			transform: scale(1);
		}

		to {
			transform: scale(1.08);
		}
	}

	@keyframes pulse {
		0%,
		100% {
			transform: translate(50%, -50%) scale(1);
			box-shadow: 0 0 18px rgba(255, 91, 91, 0.8);
		}

		50% {
			transform: translate(50%, -50%) scale(1.28);
			box-shadow: 0 0 26px rgba(255, 91, 91, 0.95);
		}
	}

	@media (max-width: 900px) {
		.hero,
		.play-layout,
		.scale-layout,
		.comparison-row,
		.attack-list {
			grid-template-columns: 1fr;
		}

		.hero {
			min-height: auto;
			gap: 2rem;
			padding-top: 1.5rem;
		}

		.hero-visual {
			min-height: 18rem;
		}

		.scale-sticky p {
			position: static;
			max-width: none;
		}

		.visual-stage {
			grid-template-columns: 1fr;
			gap: 1rem;
			min-height: 16rem;
			padding: 0.5rem 0;
		}

		.visual-field {
			inset: 0.4rem 0 0.4rem 0;
			border-radius: 1.6rem;
		}

		.visual-axis {
			padding-bottom: 0;
		}
		
		.play-controls {
			padding-right: 0;
		}

		.play-toolbar {
			grid-template-columns: 1fr;
		}

		.play-output {
			position: static;
			top: auto;
			padding-left: 0;
			padding-top: 1.2rem;
			border-left: 0;
			border-top: 1px solid rgba(237, 242, 239, 0.12);
			min-height: 0;
		}

		.play-graph__legend {
			grid-template-columns: 1fr;
		}

		.play-gap__blocks {
			grid-template-columns: repeat(8, minmax(0, 1fr));
		}
	}

	@media (max-width: 640px) {
		.hero,
		.play-section,
		.scale-section,
		.comparison-section,
		.reality-section {
			width: min(100% - 1rem, 1200px);
		}

		h1 {
			max-width: 10.5ch;
			font-size: clamp(2.1rem, 8vw, 3.1rem);
		}

		h2 {
			font-size: clamp(1.3rem, 6.5vw, 1.9rem);
		}

		.hero {
			gap: 1.5rem;
			padding-bottom: 3rem;
		}

		.hero-text {
			max-width: 20rem;
		}

		.hero-proof {
			max-width: 20rem;
			font-size: 0.9rem;
		}

		.hero-actions,
		.final-cta {
			flex-direction: column;
			align-items: stretch;
		}

		.control-head,
		.play-figures {
			grid-template-columns: 1fr;
		}

		.control-head {
			display: grid;
			justify-content: start;
		}

		.play-graph__head,
		.play-graph__ticks {
			display: grid;
			grid-template-columns: 1fr;
			gap: 0.35rem;
		}

		.play-graph__modes {
			width: 100%;
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.play-graph__mode {
			text-align: center;
		}

		.play-gap__head {
			display: grid;
			gap: 0.3rem;
		}

		.play-gap__blocks {
			grid-template-columns: repeat(6, minmax(0, 1fr));
			gap: 0.35rem;
		}

		.control-row {
			grid-template-columns: 1fr;
			gap: 0.6rem;
		}

		.control-step {
			display: none;
		}

		.visual-caption {
			display: grid;
			grid-template-columns: 1fr;
			gap: 0.3rem;
			font-size: 0.72rem;
		}

		.comparison-line {
			height: 1rem;
		}

		.comparison-fill {
			height: 0.62rem;
		}
	}
</style>
