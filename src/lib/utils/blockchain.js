export function getLongestChainBlocks(blocks) {
  if (!blocks || blocks.length === 0) {
    return [];
  }

  let maxHeight = 0;
  for (const block of blocks) {
    if (block.height > maxHeight) {
      maxHeight = block.height;
    }
  }

  const highestBlocks = blocks.filter(block => block.height === maxHeight);

  const blockIds = [];
  for (const highestBlock of highestBlocks) {
    let currentBlock = highestBlock;
    while (currentBlock) {
      blockIds.push(currentBlock.id);
      const previousHash = currentBlock.previousHash;

      currentBlock = blocks.find(block => block.hash === previousHash);

      if (!currentBlock) {
        break;
      }
    }
  }

  return [...new Set(blockIds)];
}