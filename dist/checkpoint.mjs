// A checkpoint belongs to the exact caption track. Titles alone can collide.
export function trackKey(title, duration, cues) {
  return JSON.stringify([title, duration, cues.map(cue => [cue.start, cue.end, cue.text])]);
}

export function readCheckpoint(raw, key, cues) {
  if (!raw) return null;
  const record = JSON.parse(raw);
  if (record.version !== 1 || record.key !== key || !Array.isArray(record.edits)) return null;
  if (!Number.isInteger(record.selected) || !cues[record.selected]) return null;
  const edits = new Map();
  for (const entry of record.edits) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [index, edit] = entry;
    const cue = cues[index];
    if (!Number.isInteger(index) || !cue || !edit || !Number.isInteger(edit.time) ||
        edit.time <= cue.start || edit.time >= cue.end || !Number.isInteger(edit.wordIndex) ||
        edit.wordIndex < 0 || edit.wordIndex >= cue.text.trim().split(/\s+/).length) return null;
    edits.set(index, edit);
  }
  return { edits, selected: record.selected };
}
