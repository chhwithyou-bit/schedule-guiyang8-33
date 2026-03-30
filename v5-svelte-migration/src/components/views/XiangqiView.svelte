<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import AnimatedHeading from '../ui/AnimatedHeading.svelte';

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let board: (string | null)[][] = Array(10).fill(null).map(() => Array(9).fill(null));
  let selected: { r: number, c: number } | null = null;
  let turn: 'r' | 'b' = 'r';
  let history: any[] = [];
  let status = "红方先行";

  // Initial setup (Red is bottom)
  const initial = [
    ['bc','bn','bm','ba','bs','ba','bm','bn','bc'],
    [],
    [null,'bp',null,null,null,null,null,'bp',null],
    ['bz',null,'bz',null,'bz',null,'bz',null,'bz'],
    [], [],
    ['rz',null,'rz',null,'rz',null,'rz',null,'rz'],
    [null,'rp',null,null,null,null,null,'rp',null],
    [],
    ['rc','rn','rm','ra','rs','ra','rm','rn','rc']
  ];

  onMount(() => {
    ctx = canvas.getContext('2d')!;
    resetGame();
    resizeBoard();
    window.addEventListener('resize', resizeBoard);
    return () => window.removeEventListener('resize', resizeBoard);
  });

  function resetGame() {
    board = JSON.parse(JSON.stringify(initial));
    turn = 'r';
    selected = null;
    history = [];
    status = "红方先行";
    draw();
  }

  function resizeBoard() {
    const parent = canvas.parentElement;
    if (!parent) return;
    const size = Math.min(parent.offsetWidth, 600);
    canvas.width = size;
    canvas.height = size * 1.1;
    draw();
  }

  function draw() {
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    const cw = w / 9, ch = h / 10;
    ctx.clearRect(0,0,w,h);

    // Grid lines
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
    for(let i=0; i<10; i++) { ctx.beginPath(); ctx.moveTo(cw/2, ch/2+i*ch); ctx.lineTo(w-cw/2, ch/2+i*ch); ctx.stroke(); }
    for(let j=0; j<9; j++) {
      ctx.beginPath(); ctx.moveTo(cw/2+j*cw, ch/2); ctx.lineTo(cw/2+j*cw, ch/2+4*ch); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cw/2+j*cw, ch/2+5*ch); ctx.lineTo(cw/2+j*cw, ch/2+9*ch); ctx.stroke();
    }
    // Cross lines for palace
    ctx.beginPath(); ctx.moveTo(3.5*cw, 0.5*ch); ctx.lineTo(5.5*cw, 2.5*ch); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5.5*cw, 0.5*ch); ctx.lineTo(3.5*cw, 2.5*ch); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3.5*cw, 7.5*ch); ctx.lineTo(5.5*cw, 9.5*ch); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5.5*cw, 7.5*ch); ctx.lineTo(3.5*cw, 9.5*ch); ctx.stroke();

    // Pieces
    const NAMES: any = { rz:'兵', rp:'炮', rc:'车', rn:'马', rm:'相', ra:'仕', rs:'帅', bz:'卒', bp:'炮', bc:'车', bn:'马', bm:'象', ba:'士', bs:'将' };
    board.forEach((row, r) => {
      row.forEach((p, c) => {
        if (!p) return;
        const x = cw/2 + c*cw, y = ch/2 + r*ch;
        const isSelected = selected && selected.r === r && selected.c === c;
        
        ctx.beginPath();
        ctx.arc(x, y, cw*0.42, 0, 7);
        ctx.fillStyle = '#f5efe0'; ctx.fill();
        ctx.strokeStyle = isSelected ? 'var(--color-primary)' : '#333';
        ctx.lineWidth = isSelected ? 4 : 1.5; ctx.stroke();

        ctx.font = `bold ${cw*0.5}px "PingFang SC"`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = p.startsWith('r') ? '#e05050' : '#222';
        ctx.fillText(NAMES[p] || '', x, y);
      });
    });
  }

  function handleClick(e: MouseEvent) {
    const r0 = canvas.getBoundingClientRect();
    const x = e.clientX - r0.left, y = e.clientY - r0.top;
    const cw = canvas.width/9, ch = canvas.height/10;
    const c = Math.round((x - cw/2)/cw), r = Math.round((y - ch/2)/ch);
    if(r<0||r>9||c<0||c>8) return;

    const p = board[r][c];
    if (selected) {
      if (p && p.startsWith(turn)) {
        selected = { r, c };
      } else {
        move(selected.r, selected.c, r, c);
      }
    } else if (p && p.startsWith(turn)) {
      selected = { r, c };
    }
    draw();
  }

  function move(r1: number, c1: number, r2: number, c2: number) {
    if (!canMove(r1, c1, r2, c2)) return;
    
    // Save to history for undo
    history = [...history, JSON.parse(JSON.stringify(board))];
    
    board[r2][c2] = board[r1][c1];
    board[r1][c1] = null;
    turn = (turn === 'r' ? 'b' : 'r');
    selected = null;
    status = turn === 'r' ? "红方走子" : "黑方走子";

    // Win condition check (king capture)
    checkWin();
  }

  function countPieces(r1:number, c1:number, r2:number, c2:number) {
    let count = 0;
    if (r1 === r2) {
      let min = Math.min(c1, c2), max = Math.max(c1, c2);
      for (let i = min + 1; i < max; i++) if (board[r1][i]) count++;
    } else if (c1 === c2) {
      let min = Math.min(r1, r2), max = Math.max(r1, r2);
      for (let i = min + 1; i < max; i++) if (board[i][c1]) count++;
    }
    return count;
  }

  function canMove(r1:number, c1:number, r2:number, c2:number) {
    const p = board[r1][c1];
    const target = board[r2][c2];
    if (!p) return false;
    if (target && target.startsWith(p[0])) return false; // Cannot capture own

    const dr = Math.abs(r1 - r2), dc = Math.abs(c1 - c2);
    const kind = p.slice(1);

    switch(kind) {
      case 's': // King
        if (dc > 2 && r1 === r2) { // Flying General rule
          if (target && target.endsWith('s') && countPieces(r1, c1, r2, c2) === 0) return true;
        }
        if (dc + dr !== 1) return false;
        if (c2 < 3 || c2 > 5) return false;
        if (p[0] === 'r' && r2 < 7) return false;
        if (p[0] === 'b' && r2 > 2) return false;
        break;
      case 'a': // Advisor
        if (dr !== 1 || dc !== 1) return false;
        if (c2 < 3 || c2 > 5) return false;
        if (p[0] === 'r' && r2 < 7) return false;
        if (p[0] === 'b' && r2 > 2) return false;
        break;
      case 'm': // Elephant
        if (dr !== 2 || dc !== 2) return false;
        if (board[(r1+r2)/2][(c1+c2)/2]) return false; // Blocked
        if (p[0] === 'r' && r2 < 5) return false;
        if (p[0] === 'b' && r2 > 4) return false;
        break;
      case 'n': // Horse
        if (!((dr === 1 && dc === 2) || (dr === 2 && dc === 1))) return false;
        if (dr === 2) { if (board[(r1+r2)/2][c1]) return false; }
        else { if (board[r1][(c1+c2)/2]) return false; }
        break;
      case 'c': // Chariot
        if (r1 !== r2 && c1 !== c2) return false;
        if (countPieces(r1, c1, r2, c2) !== 0) return false;
        break;
      case 'p': // Cannon
        if (r1 !== r2 && c1 !== c2) return false;
        let count = countPieces(r1, c1, r2, c2);
        if (target) { if (count !== 1) return false; }
        else { if (count !== 0) return false; }
        break;
      case 'z': // Soldier
        if (p[0] === 'r') {
          if (r2 > r1) return false;
          if (r1 >= 5 && dc !== 0) return false;
          if (dr + dc !== 1) return false;
        } else {
          if (r2 < r1) return false;
          if (r1 <= 4 && dc !== 0) return false;
          if (dr + dc !== 1) return false;
        }
        break;
    }
    return true;
  }

  function checkWin() {
    let rs = false, bs = false;
    board.forEach(row => row.forEach(p => {
      if (p === 'rs') rs = true;
      if (p === 'bs') bs = true;
    }));
    if (!rs) status = "黑方胜！";
    if (!bs) status = "红方胜！";
  }

  function undo() {
    if (history.length === 0) return;
    board = history[history.length - 1];
    history = history.slice(0, -1);
    turn = (turn === 'r' ? 'b' : 'r');
    status = turn === 'r' ? "红方走子" : "黑方走子";
    draw();
  }
</script>

<div class="xiangqi-view flex flex-col items-center min-h-screen pb-40">
  <div class="w-full flex items-end justify-between mb-12">
    <AnimatedHeading text="Tactics Hub" className="text-[12vw]" />
    <div class="pb-2 text-right">
      <p class="text-[10px] font-black uppercase tracking-widest opacity-30">Status</p>
      <p class="text-xl font-black tracking-tighter text-[var(--color-primary)]">{status}</p>
    </div>
  </div>

  <div class="w-full max-w-2xl bg-white dark:bg-neutral-950 p-6 md:p-12 rounded-[48px] shadow-2xl border border-neutral-100 dark:border-neutral-900">
    <div class="relative aspect-[9/10] w-full mx-auto bg-[#f9f4e8] dark:bg-neutral-900 rounded-2xl overflow-hidden border-4 border-[#8b4513] dark:border-neutral-800 shadow-inner">
      <canvas 
        bind:this={canvas} 
        on:click={handleClick}
        class="w-full h-full cursor-pointer"
      ></canvas>
    </div>

    <div class="grid grid-cols-2 gap-4 mt-12">
      <button 
        on:click={resetGame}
        class="py-5 rounded-3xl bg-neutral-100 dark:bg-neutral-900 font-black text-sm uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
      >
        Reset Game
      </button>
      <button 
        on:click={undo}
        class="py-5 rounded-3xl border-2 border-[var(--color-primary)] text-[var(--color-primary)] font-black text-sm uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
      >
        Undo Move
      </button>
    </div>
  </div>

  <!-- Game Info -->
  <div class="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
    <div class="p-8 rounded-[40px] bg-neutral-100 dark:bg-neutral-900 opacity-60">
      <h4 class="text-[10px] font-black uppercase tracking-widest mb-4">Tactics Guide</h4>
      <p class="text-xs font-bold leading-relaxed">
        中国象棋，博大精深。在 V5 版本中，我们集成了全新的 Canvas 渲染引擎，为您提供丝滑的触控体验。
      </p>
    </div>
    <div class="p-8 rounded-[40px] bg-[var(--color-primary)] text-white shadow-xl">
      <h4 class="text-[10px] font-black uppercase tracking-widest mb-4 text-white/40">Next Objective</h4>
      <p class="text-xs font-bold leading-relaxed">
        我们将很快推出在线对战模式，敬请期待。
      </p>
    </div>
  </div>
</div>

<style>
  canvas {
    image-rendering: -webkit-optimize-contrast;
    -webkit-tap-highlight-color: transparent;
  }
</style>
