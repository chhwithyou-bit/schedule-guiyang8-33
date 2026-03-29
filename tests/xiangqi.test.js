const test = require('node:test');
const assert = require('node:assert');
const { cloneInitialPieces, createBoardState, initialSetup } = require('../public/xiangqi.js');

test('Xiangqi Logic Tests', async (t) => {
  await t.test('cloneInitialPieces should return cloned array with distinct IDs', () => {
    const pieces = cloneInitialPieces();

    // Check total piece count matches initial setup
    assert.strictEqual(pieces.length, initialSetup.length);

    // Check elements are actually cloned and not referencing the same objects
    assert.notStrictEqual(pieces, initialSetup);
    if (pieces.length > 0) {
      assert.notStrictEqual(pieces[0], initialSetup[0]);
    }

    // Check every piece has an 'id' assigned sequentially
    pieces.forEach((p, i) => {
      assert.strictEqual(p.id, i);

      // Verify other attributes exist
      assert.ok(p.type);
      assert.ok(p.team);
      assert.strictEqual(typeof p.x, 'number');
      assert.strictEqual(typeof p.y, 'number');
    });
  });

  await t.test('createBoardState should return a valid new board state', () => {
    const id = 42;
    const boardState = createBoardState(id);

    // Check basic board metadata
    assert.strictEqual(boardState.id, id);
    assert.strictEqual(boardState.turn, 'red');
    assert.strictEqual(boardState.selectedPieceId, null);
    assert.strictEqual(boardState.gameOver, false);
    assert.strictEqual(boardState.inCheck, false);

    // Check collections are initialized properly
    assert.ok(Array.isArray(boardState.pieces));
    assert.strictEqual(boardState.pieces.length, initialSetup.length);
    assert.ok(Array.isArray(boardState.moveHistory));
    assert.strictEqual(boardState.moveHistory.length, 0);

    // Verify pieces have valid IDs inside the boardstate
    boardState.pieces.forEach((p, i) => {
      assert.strictEqual(p.id, i);
    });
  });
});
