import test from 'node:test';
import assert from 'node:assert/strict';
import { readCheckpoint, trackKey } from '../dist/checkpoint.mjs';

test('restores only the exact source track and rejects an invalid split atomically', () => {
  const cues = [{start: 100, end: 800, text: 'Wait here.'}];
  const key = trackKey('Take', 1000, cues);
  const record = {version: 1, key, selected: 0, edits: [[0, {time: 400, wordIndex: 1}]]};
  const raw = JSON.stringify(record);
  assert.deepEqual([...readCheckpoint(raw, key, cues).edits], record.edits);
  assert.equal(readCheckpoint(raw, trackKey('Take', 1000, [{...cues[0], text: 'Look here.'}]), cues), null);
  record.edits.push([0, {time: 800, wordIndex: 1}]);
  assert.equal(readCheckpoint(JSON.stringify(record), key, cues), null);
});
