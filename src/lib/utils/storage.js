/**
 * Utility functions for local storage operations in the Bitcoin simulator
 * Only used for user authentication, blockchain data is stored in the database
 */

// Save user data to local storage
export function saveUser(user) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`user_${user.blockchainId}`, JSON.stringify(user));
  }
}

// Get user data from local storage
export function getUser(blockchainId) {
  if (typeof window !== 'undefined') {
    const userData = localStorage.getItem(`user_${blockchainId}`);
    return userData ? JSON.parse(userData) : null;
  }
  return null;
}

// Remove user data from local storage
export function removeUser(blockchainId) {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(`user_${blockchainId}`);
  }
}

// These functions are kept for backward compatibility but use sessionStorage instead
// to avoid persisting blockchain data in localStorage

// Save current blockchain ID to session storage (temporary, only for current session)
export function saveCurrentBlockchain(blockchainId) {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('current_blockchain', blockchainId);
  }
}

// Get current blockchain ID from session storage
export function getCurrentBlockchain() {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('current_blockchain');
  }
  return null;
}
