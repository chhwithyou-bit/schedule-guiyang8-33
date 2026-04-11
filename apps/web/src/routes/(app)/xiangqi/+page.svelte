<script lang="ts">
  import { onMount } from 'svelte';

  type Piece = string | null;
  type Board = Piece[][];
  type Side = 'r' | 'b';
  type Selection = { r: number; c: number } | null;

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let board: Board = [];
  let selected: Selection = null;
  let turn: Side = 'r';
  let history: Board[] = [];
  let status = '红方先行';

  const initial: Board = [
    ['bc', 'bn', 'bm', 'ba', 'bs', 'ba', 'bm', 'bn', 'bc'],
    Array(9).fill(null),
    [null, 'bp', null, null, null, null, null, 'bp', null],
    ['bz', null, 'bz', null, 'bz', null, 'bz', null, 'bz'],
    Array(9).fill(null),
    Array(9).fill(null),
    ['rz', null, 'rz', null, 'rz', null, 'rz', null, 'rz'],
    [null, 'rp', null, null, null, null, null, 'rp', null],
    Array(9).fill(null),
    ['rc', 'rn', 'rm', 'ra', 'rs', 'ra', 'rm', 'rn', 'rc']
  ];

  const pieceNames: Record<string, string> = {
    rz: '兵',
    rp: '炮',
    rc: '车',
    rn: '马',
    rm: '相',
    ra: '仕',
    rs: '帅',
    bz: '卒',
    bp: '炮',
    bc: '车',
    bn: '马',
    bm: '象',
    ba: '士',
    bs: '将'
  };

  onMount(() => {
    ctx = canvas.getContext('2d');
    resetGame();
    resizeBoard();
    window.addEventListener('resize', resizeBoard);

    return () => {
      window.removeEventListener('resize', resizeBoard);
    };
  });

  function cloneBoard(source: Board) {
    return source.map((row) => [...row]);
  }

  function resetGame() {
    board = cloneBoard(initial);
    turn = 'r';
    selected = null;
    history = [];
    status = '红方先行';
    draw();
  }

  function resizeBoard() {
    const parent = canvas?.parentElement;
    if (!parent) return;

    const size = Math.min(parent.clientWidth, 600);
    canvas.width = size;
    canvas.height = Math.round(size * 1.1);
    draw();
  }

  function draw() {
    if (!ctx || !canvas) return;

    const width = canvas.width;
    const height = canvas.height;
    const cellWidth = width / 9;
    const cellHeight = height / 10;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#8b7355';
    ctx.lineWidth = 1;

    for (let row = 0; row < 10; row += 1) {
      ctx.beginPath();
      ctx.moveTo(cellWidth / 2, cellHeight / 2 + row * cellHeight);
      ctx.lineTo(width - cellWidth / 2, cellHeight / 2 + row * cellHeight);
      ctx.stroke();
    }

    for (let column = 0; column < 9; column += 1) {
      ctx.beginPath();
      ctx.moveTo(cellWidth / 2 + column * cellWidth, cellHeight / 2);
      ctx.lineTo(cellWidth / 2 + column * cellWidth, cellHeight / 2 + 4 * cellHeight);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cellWidth / 2 + column * cellWidth, cellHeight / 2 + 5 * cellHeight);
      ctx.lineTo(cellWidth / 2 + column * cellWidth, cellHeight / 2 + 9 * cellHeight);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(3.5 * cellWidth, 0.5 * cellHeight);
    ctx.lineTo(5.5 * cellWidth, 2.5 * cellHeight);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(5.5 * cellWidth, 0.5 * cellHeight);
    ctx.lineTo(3.5 * cellWidth, 2.5 * cellHeight);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(3.5 * cellWidth, 7.5 * cellHeight);
    ctx.lineTo(5.5 * cellWidth, 9.5 * cellHeight);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(5.5 * cellWidth, 7.5 * cellHeight);
    ctx.lineTo(3.5 * cellWidth, 9.5 * cellHeight);
    ctx.stroke();

    ctx.save();
    ctx.font = `700 ${Math.max(18, cellWidth * 0.26)}px "PingFang SC", "Noto Serif SC", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(120, 92, 63, 0.7)';
    ctx.fillText('楚河', width * 0.28, height * 0.5);
    ctx.fillText('汉界', width * 0.72, height * 0.5);
    ctx.restore();

    for (let r = 0; r < board.length; r += 1) {
      for (let c = 0; c < board[r].length; c += 1) {
        const piece = board[r][c];
        if (!piece) continue;

        const x = cellWidth / 2 + c * cellWidth;
        const y = cellHeight / 2 + r * cellHeight;
        const isSelected = selected?.r === r && selected?.c === c;

        ctx.beginPath();
        ctx.arc(x, y, cellWidth * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = '#f6efdf';
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#ff7a18' : '#3c2f1d';
        ctx.lineWidth = isSelected ? 4 : 1.75;
        ctx.stroke();

        ctx.font = `700 ${Math.max(20, cellWidth * 0.52)}px "PingFang SC", "Noto Serif SC", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = piece.startsWith('r') ? '#d9485f' : '#1f2937';
        ctx.fillText(pieceNames[piece] || '', x, y);
      }
    }
  }

  function handleClick(event: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const cellWidth = canvas.width / 9;
    const cellHeight = canvas.height / 10;
    const c = Math.round((x - cellWidth / 2) / cellWidth);
    const r = Math.round((y - cellHeight / 2) / cellHeight);

    if (r < 0 || r > 9 || c < 0 || c > 8) return;

    const piece = board[r][c];

    if (selected) {
      if (piece && piece.startsWith(turn)) {
        selected = { r, c };
      } else {
        move(selected.r, selected.c, r, c);
      }
    } else if (piece && piece.startsWith(turn)) {
      selected = { r, c };
    }

    draw();
  }

  function move(r1: number, c1: number, r2: number, c2: number) {
    if (!canMove(r1, c1, r2, c2)) return;

    history = [...history, cloneBoard(board)];
    board[r2][c2] = board[r1][c1];
    board[r1][c1] = null;
    turn = turn === 'r' ? 'b' : 'r';
    selected = null;
    status = turn === 'r' ? '红方走子' : '黑方走子';
    checkWin();
  }

  function countPieces(r1: number, c1: number, r2: number, c2: number) {
    let count = 0;

    if (r1 === r2) {
      const min = Math.min(c1, c2);
      const max = Math.max(c1, c2);
      for (let column = min + 1; column < max; column += 1) {
        if (board[r1][column]) count += 1;
      }
    } else if (c1 === c2) {
      const min = Math.min(r1, r2);
      const max = Math.max(r1, r2);
      for (let row = min + 1; row < max; row += 1) {
        if (board[row][c1]) count += 1;
      }
    }

    return count;
  }

  function canMove(r1: number, c1: number, r2: number, c2: number) {
    const piece = board[r1][c1];
    const target = board[r2][c2];
    if (!piece) return false;
    if (target && target.startsWith(piece[0])) return false;

    const dr = Math.abs(r1 - r2);
    const dc = Math.abs(c1 - c2);
    const kind = piece.slice(1);

    switch (kind) {
      case 's': {
        if (dc > 2 && r1 === r2) {
          if (target && target.endsWith('s') && countPieces(r1, c1, r2, c2) === 0) return true;
        }
        if (dc + dr !== 1) return false;
        if (c2 < 3 || c2 > 5) return false;
        if (piece[0] === 'r' && r2 < 7) return false;
        if (piece[0] === 'b' && r2 > 2) return false;
        break;
      }
      case 'a': {
        if (dr !== 1 || dc !== 1) return false;
        if (c2 < 3 || c2 > 5) return false;
        if (piece[0] === 'r' && r2 < 7) return false;
        if (piece[0] === 'b' && r2 > 2) return false;
        break;
      }
      case 'm': {
        if (dr !== 2 || dc !== 2) return false;
        if (board[(r1 + r2) / 2][(c1 + c2) / 2]) return false;
        if (piece[0] === 'r' && r2 < 5) return false;
        if (piece[0] === 'b' && r2 > 4) return false;
        break;
      }
      case 'n': {
        if (!((dr === 1 && dc === 2) || (dr === 2 && dc === 1))) return false;
        if (dr === 2) {
          if (board[(r1 + r2) / 2][c1]) return false;
        } else if (board[r1][(c1 + c2) / 2]) {
          return false;
        }
        break;
      }
      case 'c': {
        if (r1 !== r2 && c1 !== c2) return false;
        if (countPieces(r1, c1, r2, c2) !== 0) return false;
        break;
      }
      case 'p': {
        if (r1 !== r2 && c1 !== c2) return false;
        const blockers = countPieces(r1, c1, r2, c2);
        if (target) {
          if (blockers !== 1) return false;
        } else if (blockers !== 0) {
          return false;
        }
        break;
      }
      case 'z': {
        if (piece[0] === 'r') {
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
      default:
        return false;
    }

    return true;
  }

  function checkWin() {
    let redGeneralAlive = false;
    let blackGeneralAlive = false;

    for (const row of board) {
      for (const piece of row) {
        if (piece === 'rs') redGeneralAlive = true;
        if (piece === 'bs') blackGeneralAlive = true;
      }
    }

    if (!redGeneralAlive) status = '黑方胜！';
    if (!blackGeneralAlive) status = '红方胜！';
  }

  function undo() {
    if (history.length === 0) return;

    board = history[history.length - 1];
    history = history.slice(0, -1);
    turn = turn === 'r' ? 'b' : 'r';
    selected = null;
    status = turn === 'r' ? '红方走子' : '黑方走子';
    draw();
  }
</script>

<section class="xiangqi-page" aria-labelledby="xiangqi-title">
  <div class="route-shell hero-panel">
    <div class="hero-copy">
      <p class="route-kicker">slow game</p>
      <h1 id="xiangqi-title">象棋</h1>
      <p>
        这里直接承接旧版 XiangqiView 的落子、悔棋和状态提示，让 /xiangqi 可以被深链访问、独立回归，
        也保留原来那套轻量 Canvas 棋盘体验。
      </p>
    </div>

    <div class="status-card" aria-live="polite">
      <span class="status-label">当前局势</span>
      <strong>{status}</strong>
      <span class="status-meta">{turn === 'r' ? '轮到红方' : '轮到黑方'}</span>
    </div>
  </div>

  <div class="board-shell">
    <div class="board-frame">
      <canvas
        bind:this={canvas}
        aria-label="中国象棋棋盘"
        class="board-canvas"
        on:click={handleClick}
      ></canvas>
    </div>

    <div class="controls">
      <button type="button" class="secondary-action" on:click={resetGame}>重新开局</button>
      <button type="button" class="primary-action" on:click={undo}>悔棋一步</button>
    </div>
  </div>

  <div class="info-grid">
    <article class="route-shell info-card muted">
      <h2>战术说明</h2>
      <p>中国象棋，博大精深。当前版本继续使用 Canvas 渲染棋盘，优先保证直接访问路由时也能马上开局。</p>
    </article>

    <article class="route-shell info-card accent">
      <h2>后续计划</h2>
      <p>在线对战、残局练习和更细的提示层仍可继续叠加，但这一版先把真实路由与旧体验对齐。</p>
    </article>
  </div>
</section>

<style>
  .xiangqi-page {
    display: grid;
    gap: 1.5rem;
  }

  .hero-panel {
    display: flex;
    gap: 1.5rem;
    justify-content: space-between;
    align-items: flex-end;
  }

  .hero-copy {
    min-width: 0;
  }

  .status-card {
    min-width: 15rem;
    display: grid;
    gap: 0.35rem;
    padding: 1rem 1.15rem;
    border-radius: 1.5rem;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    text-align: right;
  }

  .status-label,
  .status-meta {
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    opacity: 0.68;
  }

  .status-card strong {
    font-size: clamp(1.4rem, 2.6vw, 2rem);
    font-weight: 900;
    letter-spacing: -0.04em;
    color: var(--color-primary, #ff7a18);
  }

  .board-shell {
    border-radius: 2rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(246, 239, 223, 0.96);
    padding: 1.25rem;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.24);
    color: #23180f;
  }

  .board-frame {
    border-radius: 1.5rem;
    overflow: hidden;
    border: 4px solid #8b4513;
    background: #f9f4e8;
    box-shadow: inset 0 0 0 1px rgba(60, 47, 29, 0.18);
  }

  .board-canvas {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 9 / 10;
    cursor: pointer;
    image-rendering: -webkit-optimize-contrast;
    -webkit-tap-highlight-color: transparent;
  }

  .controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem;
    margin-top: 1rem;
  }

  .controls button {
    min-height: 3.4rem;
    border-radius: 999px;
    border: 0;
    font-size: 0.9rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    cursor: pointer;
    transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
  }

  .controls button:hover {
    transform: translateY(-1px);
  }

  .controls button:active {
    transform: translateY(0);
  }

  .secondary-action {
    background: rgba(31, 41, 55, 0.08);
    color: #23180f;
  }

  .primary-action {
    background: var(--color-primary, #ff7a18);
    color: white;
    box-shadow: 0 14px 32px rgba(255, 122, 24, 0.28);
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .info-card h2 {
    font-size: 0.95rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .info-card p {
    margin-top: 0.9rem;
    max-width: none;
  }

  .muted {
    opacity: 0.82;
  }

  .accent {
    background: linear-gradient(135deg, rgba(255, 122, 24, 0.85), rgba(255, 82, 82, 0.78));
    border-color: rgba(255, 255, 255, 0.16);
  }

  .accent :global(p:last-child),
  .accent h2 {
    color: white;
    opacity: 1;
  }

  @media (max-width: 768px) {
    .hero-panel {
      flex-direction: column;
      align-items: stretch;
    }

    .status-card {
      min-width: 0;
      text-align: left;
    }

    .controls,
    .info-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
