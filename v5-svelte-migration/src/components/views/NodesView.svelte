<script lang="ts">
  import AnimatedHeading from '../ui/AnimatedHeading.svelte';
  import { fly } from 'svelte/transition';

  const nodes = [
    { id: 'tech', name: 'Technology', color: '#6FC994', icon: '⚡' },
    { id: 'art', name: 'Creative Arts', color: '#FAC7B7', icon: '🎨' },
    { id: 'music', name: 'Music Hub', color: '#0F6059', icon: '🎵' },
    { id: 'edu', name: 'Education', color: '#E27135', icon: '📚' },
    { id: 'life', name: 'Life Log', color: '#5D4F57', icon: '☕' },
    { id: 'lab', name: 'Future Lab', color: '#111', icon: '🧪' }
  ];
</script>

<div class="nodes-view min-h-screen">
  <AnimatedHeading text="Discover Nodes" className="text-[10vw] mb-12" />

  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
    {#each nodes as node, i}
      <div 
        in:fly={{ y: 30, delay: i * 100, duration: 800 }}
        class="group relative h-80 rounded-[48px] p-8 overflow-hidden cursor-pointer bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 shadow-sm hover:shadow-2xl transition-all duration-500"
      >
        <!-- Background Reveal -->
        <div 
          class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
          style="background: radial-gradient(circle at 70% 30%, {node.color}22 0%, transparent 70%);"
        ></div>

        <!-- Content -->
        <div class="relative z-10 h-full flex flex-col justify-between">
          <div class="text-5xl group-hover:scale-125 group-hover:-rotate-12 transition-transform duration-500 origin-left">
            {node.icon}
          </div>
          
          <div>
            <h3 class="text-3xl font-black tracking-tighter mb-2 group-hover:translate-x-2 transition-transform duration-500">
              {node.name}
            </h3>
            <p class="text-xs font-bold uppercase tracking-widest opacity-30 group-hover:opacity-100 transition-opacity">
              Explore {node.id} channel
            </p>
          </div>
        </div>

        <!-- Decorative Circle -->
        <div 
          class="absolute -right-10 -bottom-10 w-40 h-40 rounded-full blur-3xl opacity-0 group-hover:opacity-40 transition-all duration-700"
          style="background-color: {node.color};"
        ></div>
      </div>
    {/each}
  </div>
</div>
