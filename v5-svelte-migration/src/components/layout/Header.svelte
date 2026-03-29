<script lang="ts">
  import { onMount } from 'svelte';
  
  let isScrolled = false;

  onMount(() => {
    const handleScroll = () => {
      isScrolled = window.scrollY > 60;
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  });
</script>

<header 
  class="fixed top-0 left-0 right-0 z-[5000] px-6 py-4 transition-all duration-300 pointer-events-auto flex items-center justify-between"
  class:bg-opacity-85={isScrolled}
  class:backdrop-blur-md={isScrolled}
  class:shadow-sm={isScrolled}
  style="background-color: {isScrolled ? 'rgba(var(--color-bg-rgb), 0.85)' : 'transparent'};"
>
  <div class="font-black text-2xl tracking-tighter">8COMMUNITY</div>
  
  <!-- Add any top-level header actions here -->
</header>
