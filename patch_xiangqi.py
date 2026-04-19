import re

with open('public/xiangqi.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add inCheck variable
content = content.replace("let gameOver = false;", "let gameOver = false;\nlet inCheck = false;")

# 2. Reset inCheck in initXiangqi
content = content.replace("gameOver = false;", "gameOver = false;\n  inCheck = false;")

# 3. Modify moveHistory to save inCheck
content = content.replace("turn: turn,", "turn: turn,\n    inCheck: inCheck,")

# 4. Restore inCheck in undoXiangqiMove
content = content.replace("gameOver = lastState.gameOver;", "gameOver = lastState.gameOver;\n  inCheck = lastState.inCheck || false;")

# 5. Modify updateStatus to show check
new_update_status = """function updateStatus() {
  const st = document.getElementById('xiangqi-status');
  if(!st) return;
  if(gameOver) {
    st.textContent = turn === 'red' ? '黑方胜！' : '红方胜！';
    st.style.color = turn === 'red' ? 'var(--text)' : 'var(--accent)';
  } else {
    st.textContent = (turn === 'red' ? '红方走' : '黑方走') + (inCheck ? ' (将军！)' : '');
    st.style.color = turn === 'red' ? 'var(--accent)' : 'var(--text)';
  }
}"""
content = re.sub(r'function updateStatus\(\) \{[\s\S]*?\}', new_update_status, content, count=1)

# 6. Update movePiece to evaluate Check
move_piece_orig = """  turn = turn === 'red' ? 'black' : 'red';
  updateStatus();"""
move_piece_new = """  turn = turn === 'red' ? 'black' : 'red';
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
  
  updateStatus();"""
content = content.replace(move_piece_orig, move_piece_new)

# 7. Add isCheck function and rename getValidMoves -> getRawValidMoves
is_check_and_valid = """function isCheck(teamToCheck) {
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

function getRawValidMoves(piece) {"""

content = content.replace("function getValidMoves(piece) {", is_check_and_valid)

with open('public/xiangqi.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Xiangqi patched.")
