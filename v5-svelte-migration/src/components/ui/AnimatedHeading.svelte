<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';

  export let text: string;
  export let tag: 'h1' | 'h2' = 'h1';
  export let className: string = '';

  let container: HTMLElement;

  onMount(() => {
    // Word split logic
    const words = text.split(' ');
    container.innerHTML = words
      .map(word => `<span class="inline-block overflow-hidden"><span class="word inline-block">${word}</span></span>`)
      .join(' ');

    const wordElements = container.querySelectorAll('.word');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          gsap.fromTo(wordElements, 
            { y: 60, opacity: 0 },
            { 
              y: 0, 
              opacity: 1, 
              duration: 1, 
              stagger: 0.08, 
              ease: 'power4.out',
              delay: 0.1
            }
          );
          observer.unobserve(container);
        }
      });
    }, { threshold: 0.1 });

    observer.observe(container);
    return () => observer.disconnect();
  });
</script>

<svelte:element 
  this={tag} 
  bind:this={container}
  class="{className} leading-none font-black tracking-tighter uppercase"
>
  {text}
</svelte:element>

<style>
  :global(.word) {
    display: inline-block;
    opacity: 0;
  }
</style>
