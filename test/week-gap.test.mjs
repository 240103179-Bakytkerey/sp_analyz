import test from 'node:test';
import assert from 'node:assert/strict';
import { weekGap } from '../lib/view.js';

const w = (month, week) => ({ kind: 'week', month, week });
test('weekGap: апталар арасындағы тесікті табады', () => {
  assert.equal(weekGap(w(4, 3), w(4, 4)), false);
  assert.equal(weekGap(w(4, 4), w(5, 1)), false);
  assert.equal(weekGap(w(4, 1), w(5, 1)), true); // айда тек 1-апта белгілі — тесік
  assert.equal(weekGap(w(4, 2), w(5, 1), [w(4, 1), w(4, 2)]), false);
  assert.equal(weekGap(w(4, 2), w(5, 1), [w(4, 2), w(4, 4)]), true);
  assert.equal(weekGap(w(4, 1), w(4, 3)), true);
  assert.equal(weekGap(w(3, 4), w(5, 1)), true);
  assert.equal(weekGap(w(4, 4), w(5, 2)), true);
  assert.equal(weekGap({ kind: 'bt' }, w(5, 1)), false);
});
