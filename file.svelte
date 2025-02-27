<script>
  let error; // Make sure error is defined
  
  $effect(() => {
    if (error) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
</script>

<!-- Rest of your component -->
