const BOARD_W = 9;
const BOARD_H = 10;
let pieces = [];
let moveHistory = [];
let turn = 'red';
let selectedPiece = null;
let gameOver = false;
let inCheck = false;

const initialSetup = [
  { type: '車', team: 'black', x: 0, y: 0 }, { type: '馬', team: 'black', x: 1, y: 0 }, { type: '象', team: 'black', x: 2, y: 0 }, { type: '士', team: 'black', x: 3, y: 0 }, { type: '將', team: 'black', x: 4, y: 0 }, { type: '士', team: 'black', x: 5, y: 0 }, { type: '象', team: 'black', x: 6, y: 0 }, { type: '馬', team: 'black', x: 7, y: 0 }, { type: '車', team: 'black', x: 8, y: 0 },
  { type: '炮', team: 'black', x: 1, y: 2 }, { type: '炮', team: 'black', x: 7, y: 2 },
  { type: '卒', team: 'black', x: 0, y: 3 }, { type: '卒', team: 'black', x: 2, y: 3 }, { type: '卒', team: 'black', x: 4, y: 3 }, { type: '卒', team: 'black', x: 6, y: 3 }, { type: '卒', team: 'black', x: 8, y: 3 },
  { type: '兵', team: 'red', x: 0, y: 6 }, { type: '兵', team: 'red', x: 2, y: 6 }, { type: '兵', team: 'red', x: 4, y: 6 }, { type: '兵', team: 'red', x: 6, y: 6 }, { type: '兵', team: 'red', x: 8, y: 6 },
  { type: '炮', team: 'red', x: 1, y: 7 }, { type: '炮', team: 'red', x: 7, y: 7 },
  { type: '車', team: 'red', x: 0, y: 9 }, { type: '馬', team: 'red', x: 1, y: 9 }, { type: '相', team: 'red', x: 2, y: 9 }, { type: '仕', team: 'red', x: 3, y: 9 }, { type: '帥', team: 'red', x: 4, y: 9 }, { type: '仕', team: 'red', x: 5, y: 9 }, { type: '相', team: 'red', x: 6, y: 9 }, { type: '馬', team: 'red', x: 7, y: 9 }, { type: '車', team: 'red', x: 8, y: 9 }
];

function initXiangqi() {
  const boardEl = document.getElementById('xiangqi-board');
  if(!boardEl) return;
  
  // Aspect ratio fallback for older browsers
  const fixHeight = () => {
    const boardEl = document.getElementById('xiangqi-board');
    if (!boardEl) return;
    let w = boardEl.clientWidth;
    if (w === 0) w = Math.min(window.innerWidth - 40, 400);
    if (w > 0) boardEl.style.height = (w * 10 / 9) + 'px';
  };
  fixHeight();
  window.addEventListener('resize', fixHeight);
  // Expose globally so navTo can trigger it
  window.fixXiangqiHeight = fixHeight;

  boardEl.innerHTML = '';
  drawGrid(boardEl);

  pieces = JSON.parse(JSON.stringify(initialSetup));
  pieces.forEach((p, i) => p.id = i);
  moveHistory = [];
  turn = 'red';
  selectedPiece = null;
  gameOver = false;
  inCheck = false;
  
  const undoBtn = document.getElementById('xiangqi-undo-btn');
  if (undoBtn) {
    undoBtn.style.opacity = '0.5';
    undoBtn.style.pointerEvents = 'none';
  }

  updateStatus();
  renderPieces();
}

function drawGrid(boardEl) {
  // Horizontal lines
  for (let i = 0; i < BOARD_H; i++) {
    const line = document.createElement('div');
    line.className = 'xq-grid-line';
    line.style.left = '5%';
    line.style.right = '5%';
    line.style.top = (5 + i * 10) + '%';
    line.style.height = '1px';
    boardEl.appendChild(line);
  }
  // Vertical lines (split by river)
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
  // Connect outer boundaries across river
  const leftB = document.createElement('div'); leftB.className = 'xq-grid-line'; leftB.style.top = '5%'; leftB.style.bottom = '5%'; leftB.style.left = '5%'; leftB.style.width = '1px'; boardEl.appendChild(leftB);
  const rightB = document.createElement('div'); rightB.className = 'xq-grid-line'; rightB.style.top = '5%'; rightB.style.bottom = '5%'; rightB.style.left = '95%'; rightB.style.width = '1px'; boardEl.appendChild(rightB);

  // Crosses in palaces
  const createCross = (top, left, deg, len) => {
    const cross = document.createElement('div'); cross.className = 'xq-grid-line'; cross.style.top = top; cross.style.left = left; cross.style.width = len; cross.style.height = '1px'; cross.style.transform = `rotate(${deg}deg)`; cross.style.transformOrigin = 'left'; boardEl.appendChild(cross);
  };
  createCross('5%', '38.75%', 55, '39%');
  createCross('5%', '61.25%', 125, '39%');
  createCross('75%', '38.75%', 55, '39%');
  createCross('75%', '61.25%', 125, '39%');

  // River text
  const rt = document.createElement('div');
  rt.className = 'river-text';
  rt.innerHTML = '<span>楚 河</span><span>汉 界</span>';
  boardEl.appendChild(rt);

  // Clickable overlay
  for (let x = 0; x < BOARD_W; x++) {
    for (let y = 0; y < BOARD_H; y++) {
      const cell = document.createElement('div');
      cell.style.position = 'absolute';
      cell.style.width = '11.25%';
      cell.style.height = '10%';
      cell.style.left = (x * 11.25) + '%';
      cell.style.top = (y * 10) + '%';
      cell.style.transform = 'translate(-50%, -50%)';
      cell.onclick = () => handleCellClick(x, y);
      boardEl.appendChild(cell);
    }
  }
}

function updateStatus() {
  const st = document.getElementById('xiangqi-status');
  if(!st) return;
  if(gameOver) {
    st.textContent = turn === 'red' ? '黑方胜！' : '红方胜！';
    st.style.color = turn === 'red' ? 'var(--text)' : 'var(--accent)';
  } else {
    st.textContent = (turn === 'red' ? '红方走' : '黑方走') + (inCheck ? ' (将军！)' : '');
    st.style.color = turn === 'red' ? 'var(--accent)' : 'var(--text)';
  }
}

function renderPieces() {
  const boardEl = document.getElementById('xiangqi-board');

  // Clean up captured pieces from DOM
  const currentPieceIds = pieces.map(p => 'xq-piece-' + p.id);
  boardEl.querySelectorAll('.xq-piece').forEach(el => {
    if (!currentPieceIds.includes(el.id)) {
      // Small fade out effect before removal could go here, but simple remove is fine
      el.remove();
    }
  });

  // Create or update pieces
  pieces.forEach(p => {
    let el = document.getElementById('xq-piece-' + p.id);
    if (!el) {
      el = document.createElement('div');
      el.id = 'xq-piece-' + p.id;
      el.className = `xq-piece xq-${p.team}`;
      el.onclick = (e) => { e.stopPropagation(); handlePieceClick(p); };
      
      const inner = document.createElement('div');
      inner.className = 'xq-piece-inner';
      inner.textContent = p.type;
      el.appendChild(inner);
      
      // Initialize position without transition to avoid flying from 0,0
      el.style.left = (5 + p.x * 11.25) + '%';
      el.style.top = (5 + p.y * 10) + '%';
      
      boardEl.appendChild(el);
      
      // Force reflow so transition works for subsequent updates
      void el.offsetWidth;
    } else {
      // Update position (will animate due to CSS transition)
      el.style.left = (5 + p.x * 11.25) + '%';
      el.style.top = (5 + p.y * 10) + '%';
    }

    if (selectedPiece && selectedPiece.id === p.id) {
      el.classList.add('selected');
    } else {
      el.classList.remove('selected');
    }
  });

  // Re-render indicators (these don't need to animate)
  boardEl.querySelectorAll('.xq-indicator').forEach(el => el.remove());
  if (selectedPiece && !gameOver) {
    const validMoves = getValidMoves(selectedPiece);
    validMoves.forEach(m => {
      const targetPiece = pieces.find(p => p.x === m.x && p.y === m.y);
      const ind = document.createElement('div');
      ind.className = 'xq-indicator';
      ind.style.left = (5 + m.x * 11.25) + '%';
      ind.style.top = (5 + m.y * 10) + '%';
      
      if(targetPiece) {
        ind.classList.add('capture');
      }
      
      ind.onclick = (e) => { e.stopPropagation(); movePiece(m.x, m.y); };
      boardEl.appendChild(ind);
    });
  }
}

function getPieceAt(x, y) {
  return pieces.find(p => p.x === x && p.y === y);
}

function handlePieceClick(p) {
  if (gameOver) return;
  if (p.team === turn) {
    selectedPiece = p;
    renderPieces();
  } else if (selectedPiece) {
    const moves = getValidMoves(selectedPiece);
    if (moves.some(m => m.x === p.x && m.y === p.y)) {
      movePiece(p.x, p.y);
    }
  }
}

function handleCellClick(x, y) {
  if (gameOver || !selectedPiece) return;
  const moves = getValidMoves(selectedPiece);
  if (moves.some(m => m.x === x && m.y === y)) {
    movePiece(x, y);
  } else {
    selectedPiece = null;
    renderPieces();
  }
}

function movePiece(x, y) {
  // Save state for undo
  moveHistory.push({
    pieces: JSON.parse(JSON.stringify(pieces)),
    turn: turn,
    inCheck: inCheck,
    gameOver: gameOver
  });
  
  const undoBtn = document.getElementById('xiangqi-undo-btn');
  if (undoBtn) {
    undoBtn.style.opacity = '1';
    undoBtn.style.pointerEvents = 'all';
  }

  const targetIdx = pieces.findIndex(p => p.x === x && p.y === y);
  if (targetIdx !== -1) {
    const t = pieces[targetIdx];
    if (t.type === '將' || t.type === '帥') gameOver = true;
    pieces.splice(targetIdx, 1);
  }
  selectedPiece.x = x;
  selectedPiece.y = y;
  selectedPiece = null;
  turn = turn === 'red' ? 'black' : 'red';
  inCheck = isCheck(turn);
  
  // Optional: check for checkmate
  if (inCheck) {
    // If no pieces of 'turn' have valid moves, it's checkmate
    let hasMoves = false;
    for (const p of pieces) {
      if (p.team === turn) {
        if (getValidMoves(p).length > 0) {
          hasMoves = true;
          break;
        }
      }
    }
    if (!hasMoves) {
      gameOver = true;
    }
  }
  
  updateStatus();
  renderPieces();
}

function undoXiangqiMove() {
  if (moveHistory.length === 0) return;
  const lastState = moveHistory.pop();
  pieces = lastState.pieces;
  turn = lastState.turn;
  gameOver = lastState.gameOver;
  inCheck = lastState.inCheck || false;
  selectedPiece = null;
  
  if (moveHistory.length === 0) {
    const undoBtn = document.getElementById('xiangqi-undo-btn');
    if (undoBtn) {
      undoBtn.style.opacity = '0.5';
      undoBtn.style.pointerEvents = 'none';
    }
  }
  
  updateStatus();
  renderPieces();
}

function isCheck(teamToCheck) {
  const general = pieces.find(p => p.team === teamToCheck && (p.type === '將' || p.type === '帥'));
  if (!general) return false;
  
  for (let i = 0; i < pieces.length; i++) {
    if (pieces[i].team !== teamToCheck) {
      const moves = getRawValidMoves(pieces[i]);
      if (moves.some(m => m.x === general.x && m.y === general.y)) {
        return true;
      }
    }
  }
  return false;
}

function getValidMoves(piece) {
  const rawMoves = getRawValidMoves(piece);
  const validMoves = [];
  
  for (const m of rawMoves) {
    const targetIdx = pieces.findIndex(p => p.x === m.x && p.y === m.y);
    const originalX = piece.x;
    const originalY = piece.y;
    let capturedPiece = null;
    
    if (targetIdx !== -1) {
      capturedPiece = pieces[targetIdx];
      pieces.splice(targetIdx, 1);
    }
    piece.x = m.x;
    piece.y = m.y;
    
    if (!isCheck(piece.team)) {
      validMoves.push(m);
    }
    
    piece.x = originalX;
    piece.y = originalY;
    if (capturedPiece) {
      pieces.splice(targetIdx, 0, capturedPiece);
    }
  }
  return validMoves;
}

function getRawValidMoves(piece) {
  let moves = [];
  const { x, y, type, team } = piece;

  const addMoveIfValid = (nx, ny) => {
    if (nx >= 0 && nx < BOARD_W && ny >= 0 && ny < BOARD_H) {
      const target = getPieceAt(nx, ny);
      if (!target || target.team !== team) moves.push({x: nx, y: ny});
    }
  };

  if (type === '將' || type === '帥') {
    const minX = 3, maxX = 5;
    const minY = team === 'black' ? 0 : 7;
    const maxY = team === 'black' ? 2 : 9;
    [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dx, dy]) => {
      let nx = x + dx, ny = y + dy;
      if (nx >= minX && nx <= maxX && ny >= minY && ny <= maxY) addMoveIfValid(nx, ny);
    });
    // Flying general
    let hasObstacle = false;
    let ny = team === 'black' ? y + 1 : y - 1;
    while(ny >= 0 && ny < BOARD_H) {
      const p = getPieceAt(x, ny);
      if (p) {
        if((team === 'black' && p.type === '帥') || (team === 'red' && p.type === '將')) {
           moves.push({x: x, y: ny});
        }
        break;
      }
      ny += team === 'black' ? 1 : -1;
    }
  } else if (type === '士' || type === '仕') {
    const minX = 3, maxX = 5;
    const minY = team === 'black' ? 0 : 7;
    const maxY = team === 'black' ? 2 : 9;
    [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dx, dy]) => {
      let nx = x + dx, ny = y + dy;
      if (nx >= minX && nx <= maxX && ny >= minY && ny <= maxY) addMoveIfValid(nx, ny);
    });
  } else if (type === '象' || type === '相') {
    const minY = team === 'black' ? 0 : 5;
    const maxY = team === 'black' ? 4 : 9;
    [[2,2],[2,-2],[-2,2],[-2,-2]].forEach(([dx, dy]) => {
      let nx = x + dx, ny = y + dy;
      let ex = x + dx/2, ey = y + dy/2;
      if (nx >= 0 && nx < BOARD_W && ny >= minY && ny <= maxY && !getPieceAt(ex, ey)) {
        addMoveIfValid(nx, ny);
      }
    });
  } else if (type === '馬' || type === '傌') {
    [[1,2],[1,-2],[-1,2],[-1,-2],[2,1],[2,-1],[-2,1],[-2,-1]].forEach(([dx, dy]) => {
      let nx = x + dx, ny = y + dy;
      let bx = x + (Math.abs(dx)===2 ? dx/2 : 0);
      let by = y + (Math.abs(dy)===2 ? dy/2 : 0);
      if (!getPieceAt(bx, by)) addMoveIfValid(nx, ny);
    });
  } else if (type === '車' || type === '俥') {
    [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dx, dy]) => {
      let nx = x + dx, ny = y + dy;
      while(nx >= 0 && nx < BOARD_W && ny >= 0 && ny < BOARD_H) {
        const target = getPieceAt(nx, ny);
        if (!target) {
          moves.push({x: nx, y: ny});
        } else {
          if (target.team !== team) moves.push({x: nx, y: ny});
          break;
        }
        nx += dx; ny += dy;
      }
    });
  } else if (type === '炮' || type === '砲') {
    [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dx, dy]) => {
      let nx = x + dx, ny = y + dy;
      let passedPiece = false;
      while(nx >= 0 && nx < BOARD_W && ny >= 0 && ny < BOARD_H) {
        const target = getPieceAt(nx, ny);
        if (!target) {
          if (!passedPiece) moves.push({x: nx, y: ny});
        } else {
          if (!passedPiece) {
            passedPiece = true;
          } else {
            if (target.team !== team) moves.push({x: nx, y: ny});
            break;
          }
        }
        nx += dx; ny += dy;
      }
    });
  } else if (type === '卒' || type === '兵') {
    const dir = team === 'black' ? 1 : -1;
    const isAcrossRiver = team === 'black' ? y >= 5 : y <= 4;
    addMoveIfValid(x, y + dir);
    if (isAcrossRiver) {
      addMoveIfValid(x - 1, y);
      addMoveIfValid(x + 1, y);
    }
  }
  return moves;
}

// Check for script loading and attach to window if necessary for debugging/initialization
window.initXiangqi = initXiangqi;
document.addEventListener('DOMContentLoaded', () => {
    if(document.getElementById('xiangqi-board')) {
       initXiangqi();
    }
});
