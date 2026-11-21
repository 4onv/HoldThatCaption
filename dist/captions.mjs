// The editor stores integer milliseconds so a split survives an SRT round-trip.
export function parseTime(value) {
  const parts = String(value).trim().replace(',', '.').split(':');
  if (!/^(?:\d+:){0,2}\d+(?:\.\d{1,3})?$/.test(parts.join(':'))) return NaN;
  if (parts.length > 1 && Number(parts.at(-1)) >= 60) return NaN;
  if (parts.length === 3 && Number(parts[1]) >= 60) return NaN;
  return Math.round(parts.reduce((time, part) => time * 60 + Number(part), 0) * 1000);
}

export function timeLabel(ms, precision = 2) {
  const seconds = Math.floor(ms / 1000);
  const fraction = String(ms % 1000).padStart(3, '0').slice(0, precision);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') + (fraction ? '.' + fraction : '');
}

export function readCaptions(fileText) {
  const blocks = fileText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim().split(/\n[ \t]*\n/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    if (/^WEBVTT(?:\s|$)/.test(lines[0]) || /^NOTE(?:\s|$)/.test(lines[0])) continue;
    const timingIndex = lines[0].includes('-->') ? 0 : 1;
    const timing = lines[timingIndex]?.match(/^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/);
    if (!timing) throw new Error('A caption is missing its start or end time. Use a plain SRT or WebVTT file.');
    const start = parseTime(timing[1]);
    const end = parseTime(timing[2]);
    const text = lines.slice(timingIndex + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (!Number.isFinite(start + end) || start >= end || !text) throw new Error('Each caption needs text and a valid time range.');
    cues.push({ start, end, text });
  }
  if (!cues.length) throw new Error('The subtitle file contains no captions.');
  cues.sort((a, b) => a.start - b.start);
  if (cues.some((cue, i) => i && cue.start < cues[i - 1].end)) throw new Error('This studio supports one speaker track. Choose captions without overlapping times.');
  return cues;
}

export function wordPositions(text) {
  return [...text.matchAll(/\S+/g)].map(match => ({ word: match[0], offset: match.index }));
}

export function splitCue(cue, edit) {
  if (!edit) return [cue];
  const offset = wordPositions(cue.text)[edit.wordIndex]?.offset;
  if (offset === undefined || edit.time <= cue.start || edit.time >= cue.end) throw new Error('Choose a reveal inside this caption.');
  const setup = cue.text.slice(0, offset).trimEnd();
  const reveal = { start: edit.time, end: cue.end, text: cue.text.slice(offset) };
  return setup ? [{ start: cue.start, end: edit.time, text: setup }, reveal] : [reveal];
}

function srtTime(ms) {
  const hours = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const rest = timeLabel(ms % 3600000, 3).padStart(9, '0').replace('.', ',');
  return hours + ':' + rest;
}

export function serializeSrt(cues) {
  return cues.map(({ start, end, text }, i) =>
    (i + 1) + '\r\n' + srtTime(start) + ' --> ' + srtTime(end) + '\r\n' + text.replace(/\n/g, '\r\n') + '\r\n'
  ).join('\r\n');
}
