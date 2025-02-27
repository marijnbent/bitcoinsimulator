/**
 * Utility functions for real-time updates in the Bitcoin simulator
 */

// Set up polling for blockchain updates
export function setupPolling(blockchainId, callback, interval = 5000) {
  if (typeof window === 'undefined') {
    return () => {};
  }
  
  // Set up interval for polling
  const intervalId = setInterval(async () => {
    try {
      // Fetch updates from the server
      const response = await fetch(`/api/blockchain/${blockchainId}/updates`);
      
      // Check if the response is ok
      if (!response.ok) {
        throw new Error(`Failed to fetch updates: ${response.statusText}`);
      }
      
      // Parse the response
      const data = await response.json();
      
      // Call the callback with the updates
      callback(data);
    } catch (error) {
      console.error('Error polling for updates:', error);
    }
  }, interval);
  
  // Return a cleanup function
  return () => clearInterval(intervalId);
}

// Create a store for real-time updates
export function createUpdateStore(blockchainId, initialData) {
  // Create a store with the initial data
  let data = { ...initialData };
  let subscribers = [];
  
  // Set up polling
  let cleanup = () => {};
  
  // Start polling
  function start() {
    cleanup = setupPolling(blockchainId, (updates) => {
      // Update the data
      data = { ...data, ...updates };
      
      // Notify subscribers
      subscribers.forEach(subscriber => subscriber(data));
    });
  }
  
  // Stop polling
  function stop() {
    cleanup();
  }
  
  // Subscribe to updates
  function subscribe(subscriber) {
    subscribers.push(subscriber);
    subscriber(data);
    
    // Return unsubscribe function
    return () => {
      subscribers = subscribers.filter(s => s !== subscriber);
    };
  }
  
  // Update the data
  function update(newData) {
    data = { ...data, ...newData };
    subscribers.forEach(subscriber => subscriber(data));
  }
  
  return {
    subscribe,
    update,
    start,
    stop
  };
}
