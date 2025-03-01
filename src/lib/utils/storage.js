/**
 * Utility functions for local storage operations in the Bitcoin simulator
 * Only used for user authentication, blockchain data is stored in the database
 */

// Save user data to local storage
export function saveUser(user) {
  if (typeof window !== 'undefined') {
    if (!user || !user.blockchainId) {
      console.error('Invalid user data:', user);
      return;
    }
    
    // Ensure the user has all required fields
    if (!user.privateKey) {
      console.error('User data missing privateKey:', user);
    }
    
    localStorage.setItem(`user_${user.blockchainId}`, JSON.stringify(user));
  }
}

// Get user data from local storage
export function getUser(blockchainId) {
  if (typeof window !== 'undefined') {
    const userData = localStorage.getItem(`user_${blockchainId}`);
    const user = userData ? JSON.parse(userData) : null;

    return user;
  }
  return null;
}

// Remove user data from local storage
export function removeUser(blockchainId) {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(`user_${blockchainId}`);
  }
}
