const BOARD_W = 9;
const BOARD_H = 10;
const XIANGQI_STORAGE_KEY = 'xiangqi_board_count';

const initialSetup = [
  { type: '車', team: 'black', x: 0, y: 0 }, { type: '馬', team: 'black', x: 1, y: 0 }, { type: '象', team: 'black', x: 2, y: 0 }, { type: '士', team: 'black', x: 3, y: 0 }, { type: '將', team: 'black', x: 4, y: 0 }, { type: '士', team: 'black', x: 5, y: 0 }, { type: '象', team: 'black', x: 6, y: 0 }, { type: '馬', team: 'black', x: 7, y: 0 }, { type: '車', team: 'black', x: 8, y: 0 },
  { type: '炮', team: 'black', x: 1, y: 2 }, { type: '炮', team: 'black', x: 7, y: 2 },
  { type: '卒', team: 'black', x: 0, y: 3 }, { type: '卒', team: 'black', x: 2, y: 3 }, { type: '卒', team: 'black', x: 4, y: 3 }, { type: '卒', team: 'black', x: 6, y: 3 }, { type: '卒', team: 'black', x: 8, y: 3 },
  { type: '兵', team: 'red', x: 0, y: 6 }, { type: '兵', team: 'red', x: 2, y: 6 }, { type: '兵', team: 'red', x: 4, y: 6 }, { type: '兵', team: 'red', x: 6, y: 6 }, { type: '兵', team: 'red', x: 8, y: 6 },
  { type: '炮', team: 'red', x: 1, y: 7 }, { type: '炮', team: 'red', x: 7, y: 7 },
  { type: '車', team: 'red', x: 0, y: 9 }, { type: '馬', team: 'red', x: 1, y: 9 }, { type: '相', team: 'red', x: 2, y: 9 }, { type: '仕', team: 'red', x: 3, y: 9 }, { type: '帥', team: 'red', x: 4, y: 9 }, { type: '仕', team: 'red', x: 5, y: 9 }, { type: '相', team: 'red', x: 6, y: 9 }, { type: '馬', team: 'red', x: 7, y: 9 }, { type: '車', team: 'red', x: 8, y: 9 }
];

let xiangqiBoards = [];
let xiangqiBoardCount = 1;
let activeBoardId = 0;
let resizeBound = false;

function cloneInitialPieces() {
  return JSON.parse(JSON.stringify(initialSetup)).map((p, i) => ({ ...p, id: i }));
}

function createBoardState(id) {
  return {
    id,
    pieces: cloneInitialPieces(),
    moveHistory: [],
    turn: 'red',
    selectedPieceId: null,
    gameOver: false,
    inCheck: false
  };
}

function getBoardState(boardId) {
  return xiangqiBoards.find(board => board.id === boardId);
}

function getBoardElements(boardId) {
  return {
    card: document.getElementById(`xiangqi-card-${boardId}`),
    board: document.getElementById(boardId === 0 ? 'xiangqi-board' : `xiangqi-board-${boardId}`),
    status: document.getElementById(`xiangqi-status-${boardId}`),
    undo: document.getElementById(`xiangqi-undo-btn-${boardId}`),
    countBtn: document.querySelector(`#xiangqi-board-counts .seg-btn[data-count="${xiangqiBoardCount}"]`)
  };
}

function setActiveBoard(boardId) {
  activeBoardId = boardId;
  xiangqiBoards.forEach(board => {
    const card = document.getElementById(`xiangqi-card-${board.id}`);
    if (card) card.classList.toggle('active', board.id === activeBoardId);
  });
  syncHeaderControls();
}

function syncHeaderControls() {
  const board = getBoardState(activeBoardId);
  const undoBtn = document.getElementById('xiangqi-undo-btn');
  if (!undoBtn || !board) return;
  const hasHistory = board.moveHistory.length > 0;
  undoBtn.style.opacity = hasHistory ? '1' : '0.5';
  undoBtn.style.pointerEvents = hasHistory ? 'all' : 'none';
}

function updateBoardCountUI() {
  document.querySelectorAll('#xiangqi-board-counts .seg-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.count) === xiangqiBoardCount);
  });
}

function drawGrid(boardEl, boardId) {
  for (let i = 0; i < BOARD_H; i++) {
    const line = document.createElement('div');
    line.className = 'xq-grid-line';
    line.style.left = '5%';
    line.style.right = '5%';
    line.style.top = (5 + i * 10) + '%';
    line.style.height = '1px';
    boardEl.appendChild(line);
  }

  for (let i = 0; i < BOARD_W; i++) {
    const topV = document.createElement('div');
    topV.className = 'xq-grid-line';
    topV.style.top = '5%';
    topV.style.bottom = '55%';
    topV.style.left = (5 + i * 11.25) + '%';
    topV.style.width = '1px';
    boardEl.appendChild(topV);

    const botV = document.createElement('div');
    botV.className = 'xq-grid-line';
    botV.style.top = '55%';
    botV.style.bottom = '5%';
    botV.style.left = (5 + i * 11.25) + '%';
    botV.style.width = '1px';
    boardEl.appendChild(botV);
  }

  const leftB = document.createElement('div');
  leftB.className = 'xq-grid-line';
  leftB.style.top = '5%';
  leftB.style.bottom = '5%';
  leftB.style.left = '5%';
  leftB.style.width = '1px';
  boardEl.appendChild(leftB);

  const rightB = document.createElement('div');
  rightB.className = 'xq-grid-line';
  rightB.style.top = '5%';
  rightB.style.bottom = '5%';
  rightB.style.left = '95%';
  rightB.style.width = '1px';
  boardEl.appendChild(rightB);

  const createCross = (top, left, deg, len) => {
    const cross = document.createElement('div');
    cross.className = 'xq-grid-line';
    cross.style.top = top;
    cross.style.left = left;
    cross.style.width = len;
    cross.style.height = '1px';
    cross.style.transform = `rotate(${deg}deg)`;
    cross.style.transformOrigin = 'left';
    boardEl.appendChild(cross);
  };

  createCross('5%', '38.75%', 55, '39%');
  createCross('5%', '61.25%', 125, '39%');
  createCross('75%', '38.75%', 55, '39%');
  createCross('75%', '61.25%', 125, '39%');

  const river = document.createElement('div');
  river.className = 'river-text';
  river.innerHTML = '<span>楚 河</span><span>汉 界</span>';
  boardEl.appendChild(river);

  for (let x = 0; x < BOARD_W; x++) {
    for (let y = 0; y < BOARD_H; y++) {
      const cell = document.createElement('div');
      cell.className = 'xq-cell-hit';
      cell.style.left = (x * 11.25) + '%';
      cell.style.top = (y * 10) + '%';
      cell.onclick = () => handleCellClick(boardId, x, y);
      boardEl.appendChild(cell);
    }
  }
}

function renderBoardShells() {
  const grid = document.getElementById('xiangqi-board-grid');
  if (!grid) return;
  grid.innerHTML = xiangqiBoards.map((board, idx) => `
    <section class="xiangqi-board-card" id="xiangqi-card-${board.id}" onclick="setActiveBoard(${board.id})">
      <div class="xiangqi-board-top">
        <div class="xiangqi-board-title">棋盘 ${idx + 1}</div>
        <div class="xiangqi-board-actions">
          <button class="admin-btn" id="xiangqi-undo-btn-${board.id}" onclick="event.stopPropagation(); undoXiangqiMove(${board.id})">悔棋</button>
          <button class="admin-btn" onclick="event.stopPropagation(); initXiangqi(${board.id})">重开</button>
        </div>
      </div>
      <div class="xiangqi-status" id="xiangqi-status-${board.id}"></div>
      <div class="xiangqi-board-surface">
        <div id="${board.id === 0 ? 'xiangqi-board' : `xiangqi-board-${board.id}`}" class="xiangqi-board"></div>
      </div>
    </section>
  `).join('');

  xiangqiBoards.forEach(board => {
    const els = getBoardElements(board.id);
    if (!els.board) return;
    els.board.innerHTML = '';
    drawGrid(els.board, board.id);
  });
}

function fixXiangqiHeight() {
  document.querySelectorAll('.xiangqi-board').forEach(boardEl => {
    let w = boardEl.clientWidth;
    if (w === 0) w = Math.min(window.innerWidth - 48, 520);
    if (w > 0) boardEl.style.height = (w * 10 / 9) + 'px';
  });
}

function updateStatus(boardId) {
  const board = getBoardState(boardId);
  const els = getBoardElements(boardId);
  if (!board || !els.status) return;

  if (board.gameOver) {
    els.status.textContent = board.turn === 'red' ? '黑方胜！' : '红方胜！';
    els.status.style.color = board.turn === 'red' ? 'var(--text)' : 'var(--accent)';
  } else {
    els.status.textContent = (board.turn === 'red' ? '红方走' : '黑方走') + (board.inCheck ? ' · 将军' : '');
    els.status.style.color = board.turn === 'red' ? 'var(--accent)' : 'var(--text)';
  }

  if (els.undo) {
    const hasHistory = board.moveHistory.length > 0;
    els.undo.style.opacity = hasHistory ? '1' : '0.5';
    els.undo.style.pointerEvents = hasHistory ? 'all' : 'none';
  }
}

function renderPieces(boardId) {
  const board = getBoardState(boardId);
  const els = getBoardElements(boardId);
  if (!board || !els.board) return;

  const pieceIds = board.pieces.map(p => `xq-piece-${boardId}-${p.id}`);
  els.board.querySelectorAll('.xq-piece').forEach(el => {
    if (!pieceIds.includes(el.id)) el.remove();
  });

  board.pieces.forEach(piece => {
    let el = document.getElementById(`xq-piece-${boardId}-${piece.id}`);
    if (!el) {
      el = document.createElement('div');
      el.id = `xq-piece-${boardId}-${piece.id}`;
      el.className = `xq-piece xq-${piece.team}`;
      const inner = document.createElement('div');
      inner.className = 'xq-piece-inner';
      el.appendChild(inner);
      els.board.appendChild(el);
      void el.offsetWidth;
    }

    el.onclick = event => {
      event.stopPropagation();
      handlePieceClick(boardId, piece.id);
    };
    el.querySelector('.xq-piece-inner').textContent = piece.type;
    el.style.left = (5 + piece.x * 11.25) + '%';
    el.style.top = (5 + piece.y * 10) + '%';
    el.classList.toggle('selected', board.selectedPieceId === piece.id);
  });

  els.board.querySelectorAll('.xq-indicator').forEach(el => el.remove());
  const selectedPiece = board.pieces.find(p => p.id === board.selectedPieceId);
  if (selectedPiece && !board.gameOver) {
    getValidMoves(board, selectedPiece).forEach(move => {
      const targetPiece = getPieceAt(board, move.x, move.y);
      const indicator = document.createElement('div');
      indicator.className = 'xq-indicator';
      indicator.style.left = (5 + move.x * 11.25) + '%';
      indicator.style.top = (5 + move.y * 10) + '%';
      if (targetPiece) indicator.classList.add('capture');
      indicator.onclick = event => {
        event.stopPropagation();
        movePiece(boardId, move.x, move.y);
      };
      els.board.appendChild(indicator);
    });
  }

  updateStatus(boardId);
}

function renderAllBoards() {
  xiangqiBoards.forEach(board => renderPieces(board.id));
  setActiveBoard(Math.min(activeBoardId, xiangqiBoards.length - 1));
  updateBoardCountUI();
  fixXiangqiHeight();
}

function resetBoardState(boardId) {
  const board = getBoardState(boardId);
  if (!board) return;
  board.pieces = cloneInitialPieces();
  board.moveHistory = [];
  board.turn = 'red';
  board.selectedPieceId = null;
  board.gameOver = false;
  board.inCheck = false;
}

function rebuildBoards(count) {
  xiangqiBoardCount = count;
  xiangqiBoards = Array.from({ length: count }, (_, idx) => createBoardState(idx));
  activeBoardId = 0;
  renderBoardShells();
  renderAllBoards();
}

function initXiangqi(boardId = null) {
  const count = Number(localStorage.getItem(XIANGQI_STORAGE_KEY) || '1');
  if (!document.getElementById('xiangqi-board-grid')) return;

  if (boardId === null && xiangqiBoards.length === 0) {
    xiangqiBoardCount = count >= 1 && count <= 4 ? count : 1;
    rebuildBoards(xiangqiBoardCount);
  } else if (boardId === null) {
    resetBoardState(activeBoardId);
    renderPieces(activeBoardId);
    syncHeaderControls();
  } else {
    resetBoardState(boardId);
    renderPieces(boardId);
    setActiveBoard(boardId);
  }

  if (!resizeBound) {
    window.addEventListener('resize', fixXiangqiHeight);
    resizeBound = true;
  }
  window.fixXiangqiHeight = fixXiangqiHeight;
}

function setXiangqiBoardCount(count) {
  const nextCount = Math.max(1, Math.min(4, Number(count) || 1));
  localStorage.setItem(XIANGQI_STORAGE_KEY, String(nextCount));
  rebuildBoards(nextCount);
}

function getPieceAt(board, x, y) {
  return board.pieces.find(piece => piece.x === x && piece.y === y);
}

function handlePieceClick(boardId, pieceId) {
  const board = getBoardState(boardId);
  if (!board || board.gameOver) return;
  setActiveBoard(boardId);

  const piece = board.pieces.find(item => item.id === pieceId);
  if (!piece) return;

  if (piece.team === board.turn) {
    board.selectedPieceId = piece.id;
    renderPieces(boardId);
  } else if (board.selectedPieceId !== null) {
    const selectedPiece = board.pieces.find(item => item.id === board.selectedPieceId);
    if (!selectedPiece) return;
    const moves = getValidMoves(board, selectedPiece);
    if (moves.some(move => move.x === piece.x && move.y === piece.y)) {
      movePiece(boardId, piece.x, piece.y);
    }
  }
}

function handleCellClick(boardId, x, y) {
  const board = getBoardState(boardId);
  if (!board || board.gameOver || board.selectedPieceId === null) return;
  setActiveBoard(boardId);
  const selectedPiece = board.pieces.find(piece => piece.id === board.selectedPieceId);
  if (!selectedPiece) return;

  const moves = getValidMoves(board, selectedPiece);
  if (moves.some(move => move.x === x && move.y === y)) {
    movePiece(boardId, x, y);
  } else {
    board.selectedPieceId = null;
    renderPieces(boardId);
  }
}

function movePiece(boardId, x, y) {
  const board = getBoardState(boardId);
  if (!board || board.selectedPieceId === null) return;

  board.moveHistory.push({
    pieces: JSON.parse(JSON.stringify(board.pieces)),
    turn: board.turn,
    inCheck: board.inCheck,
    gameOver: board.gameOver,
    selectedPieceId: board.selectedPieceId
  });

  const selectedPiece = board.pieces.find(piece => piece.id === board.selectedPieceId);
  if (!selectedPiece) return;

  const targetIdx = board.pieces.findIndex(piece => piece.x === x && piece.y === y);
  if (targetIdx !== -1) {
    const target = board.pieces[targetIdx];
    if (target.type === '將' || target.type === '帥') board.gameOver = true;
    board.pieces.splice(targetIdx, 1);
  }

  selectedPiece.x = x;
  selectedPiece.y = y;
  board.selectedPieceId = null;
  board.turn = board.turn === 'red' ? 'black' : 'red';
  board.inCheck = isCheck(board, board.turn);

  if (board.inCheck) {
    let hasMoves = false;
    for (const piece of board.pieces) {
      if (piece.team === board.turn && getValidMoves(board, piece).length > 0) {
        hasMoves = true;
        break;
      }
    }
    if (!hasMoves) board.gameOver = true;
  }

  renderPieces(boardId);
  syncHeaderControls();
}

function undoXiangqiMove(boardId = activeBoardId) {
  const board = getBoardState(boardId);
  if (!board || board.moveHistory.length === 0) return;

  const lastState = board.moveHistory.pop();
  board.pieces = lastState.pieces;
  board.turn = lastState.turn;
  board.gameOver = lastState.gameOver;
  board.inCheck = lastState.inCheck || false;
  board.selectedPieceId = null;

  renderPieces(boardId);
  setActiveBoard(boardId);
}

function isCheck(board, teamToCheck) {
  const general = board.pieces.find(piece => piece.team === teamToCheck && (piece.type === '將' || piece.type === '帥'));
  if (!general) return false;

  for (const piece of board.pieces) {
    if (piece.team !== teamToCheck) {
      const moves = getRawValidMoves(board, piece);
      if (moves.some(move => move.x === general.x && move.y === general.y)) return true;
    }
  }
  return false;
}

function getValidMoves(board, piece) {
  const rawMoves = getRawValidMoves(board, piece);
  const validMoves = [];

  for (const move of rawMoves) {
    const targetIdx = board.pieces.findIndex(item => item.x === move.x && item.y === move.y);
    const originalX = piece.x;
    const originalY = piece.y;
    let capturedPiece = null;

    if (targetIdx !== -1) {
      capturedPiece = board.pieces[targetIdx];
      board.pieces.splice(targetIdx, 1);
    }
    piece.x = move.x;
    piece.y = move.y;

    if (!isCheck(board, piece.team)) validMoves.push(move);

    piece.x = originalX;
    piece.y = originalY;
    if (capturedPiece) board.pieces.splice(targetIdx, 0, capturedPiece);
  }

  return validMoves;
}

function getRawValidMoves(board, piece) {
  let moves = [];
  const { x, y, type, team } = piece;

  const addMoveIfValid = (nx, ny) => {
    if (nx >= 0 && nx < BOARD_W && ny >= 0 && ny < BOARD_H) {
      const target = getPieceAt(board, nx, ny);
      if (!target || target.team !== team) moves.push({ x: nx, y: ny });
    }
  };

  if (type === '將' || type === '帥') {
    const minX = 3;
    const maxX = 5;
    const minY = team === 'black' ? 0 : 7;
    const maxY = team === 'black' ? 2 : 9;
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= minX && nx <= maxX && ny >= minY && ny <= maxY) addMoveIfValid(nx, ny);
    });
    let ny = team === 'black' ? y + 1 : y - 1;
    while (ny >= 0 && ny < BOARD_H) {
      const target = getPieceAt(board, x, ny);
      if (target) {
        if ((team === 'black' && target.type === '帥') || (team === 'red' && target.type === '將')) moves.push({ x, y: ny });
        break;
      }
      ny += team === 'black' ? 1 : -1;
    }
  } else if (type === '士' || type === '仕') {
    const minX = 3;
    const maxX = 5;
    const minY = team === 'black' ? 0 : 7;
    const maxY = team === 'black' ? 2 : 9;
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= minX && nx <= maxX && ny >= minY && ny <= maxY) addMoveIfValid(nx, ny);
    });
  } else if (type === '象' || type === '相') {
    const minY = team === 'black' ? 0 : 5;
    const maxY = team === 'black' ? 4 : 9;
    [[2, 2], [2, -2], [-2, 2], [-2, -2]].forEach(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      const ex = x + dx / 2;
      const ey = y + dy / 2;
      if (nx >= 0 && nx < BOARD_W && ny >= minY && ny <= maxY && !getPieceAt(board, ex, ey)) addMoveIfValid(nx, ny);
    });
  } else if (type === '馬' || type === '傌') {
    [[1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]].forEach(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      const bx = x + (Math.abs(dx) === 2 ? dx / 2 : 0);
      const by = y + (Math.abs(dy) === 2 ? dy / 2 : 0);
      if (!getPieceAt(board, bx, by)) addMoveIfValid(nx, ny);
    });
  } else if (type === '車' || type === '俥') {
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
      let nx = x + dx;
      let ny = y + dy;
      while (nx >= 0 && nx < BOARD_W && ny >= 0 && ny < BOARD_H) {
        const target = getPieceAt(board, nx, ny);
        if (!target) {
          moves.push({ x: nx, y: ny });
        } else {
          if (target.team !== team) moves.push({ x: nx, y: ny });
          break;
        }
        nx += dx;
        ny += dy;
      }
    });
  } else if (type === '炮' || type === '砲') {
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
      let nx = x + dx;
      let ny = y + dy;
      let passedPiece = false;
      while (nx >= 0 && nx < BOARD_W && ny >= 0 && ny < BOARD_H) {
        const target = getPieceAt(board, nx, ny);
        if (!target) {
          if (!passedPiece) moves.push({ x: nx, y: ny });
        } else if (!passedPiece) {
          passedPiece = true;
        } else {
          if (target.team !== team) moves.push({ x: nx, y: ny });
          break;
        }
        nx += dx;
        ny += dy;
      }
    });
  } else if (type === '卒' || type === '兵') {
    const dir = team === 'black' ? 1 : -1;
    const crossedRiver = team === 'black' ? y >= 5 : y <= 4;
    addMoveIfValid(x, y + dir);
    if (crossedRiver) {
      addMoveIfValid(x - 1, y);
      addMoveIfValid(x + 1, y);
    }
  }

  return moves;
}

if (typeof window !== 'undefined') {
  window.initXiangqi = initXiangqi;
  window.undoXiangqiMove = undoXiangqiMove;
  window.setXiangqiBoardCount = setXiangqiBoardCount;
  window.setActiveBoard = setActiveBoard;
  window.fixXiangqiHeight = fixXiangqiHeight;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('xiangqi-board-grid')) initXiangqi();
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    cloneInitialPieces,
    createBoardState,
    initialSetup,
    getBoardState,
    resetBoardState,
    getValidMoves,
    getRawValidMoves,
    isCheck,
    getPieceAt
  };
}
