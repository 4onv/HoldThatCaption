import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTime, readCaptions, serializeSrt, splitCue } from '../dist/captions.mjs';

test('a held phrase splits at the exact millisecond and preserves remaining line breaks', () => {
  const cue = { start: 3604700, end: 3608700, text: 'It said it\nwas already grounded.' };
  const result = splitCue(cue, { wordIndex: 2, time: 3607100 });
  assert.deepEqual(result.map(part => part.text), ['It said', 'it\nwas already grounded.']);
  assert.equal(result[0].end, result[1].start);
  assert.match(serializeSrt(result), /01:00:07,100/);
  assert.deepEqual(readCaptions(serializeSrt(result)), result);
});

test('holding the first word delays a cue without adding a blank subtitle', () => {
  const [cue] = readCaptions('WEBVTT\n\ncue-id\n00:01.500 --> 00:04.000\nSurprise!');
  assert.deepEqual(splitCue(cue, { wordIndex: 0, time: 2000 }), [
    { start: 2000, end: 4000, text: 'Surprise!' }
  ]);
  assert.throws(() => splitCue(cue, { wordIndex: 0, time: cue.end }));
});

test('rejects invalid clocks and simultaneous cues', () => {
  assert.ok(Number.isNaN(parseTime('0:60.0')));
  assert.throws(() => readCaptions('0:01 --> 0:04\none\n\n0:03 --> 0:05\ntwo'), /overlap/);
});
