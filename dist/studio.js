import { parseTime, readCaptions, serializeSrt, splitCue, timeLabel, wordPositions } from './captions.mjs';
import { setupScreenTest } from './screen-test.js';

const $ = id => document.getElementById(id);
const video = $('video');
const demo = [
  { start: 300, end: 2600, text: 'My coffee asked for a day off.' },
  { start: 2600, end: 4700, text: 'I said it could take a break.' },
  { start: 4700, end: 8700, text: 'It said it was already grounded.' }
];
let cues = demo;
let selected = 2;
let wordIndex = 5;
let edits = new Map();
let mode = 'original';
let duration = 9000;
let visibleCues = demo;
let sourceUrl;
let replayEnd = null;
let animation;
let playhead;

const clearObservations = setupScreenTest(() => ({
  src: video.currentSrc || video.src,
  muted: video.muted,
  version: mode,
  cue: cues[selected],
  cueNumber: selected + 1,
  setupStart: cues[Math.max(0, selected - 2)].start,
  reveal: parseTime($('reveal').value),
  wordIndex,
  edit: edits.get(selected),
  original: cues,
  edited: cues.flatMap((cue, i) => splitCue(cue, edits.get(i)))
}));

function button(label, handler, className = '') {
  const element = document.createElement('button');
  element.textContent = label;
  element.className = className;
  element.onclick = handler;
  return element;
}

function span(label, className) {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = label;
  return element;
}

function announce(message) {
  $('status').textContent = message;
}

function renderPlayer() {
  const now = Math.round(video.currentTime * 1000);
  const active = visibleCues.find(cue => cue.start <= now && now < cue.end);
  const subtitle = active?.text ?? '';
  if ($('subtitle').textContent !== subtitle) $('subtitle').textContent = subtitle;
  $('current').textContent = timeLabel(now);
  $('seek').value = video.currentTime;
  if (playhead) playhead.style.left = (100 * now / duration) + '%';
}

function tick() {
  renderPlayer();
  if (replayEnd !== null && video.currentTime * 1000 >= replayEnd) {
    video.pause();
    replayEnd = null;
  }
  if (!video.paused && !video.ended) animation = requestAnimationFrame(tick);
}

function setMode(next) {
  mode = next;
  visibleCues = mode === 'original' ? cues : cues.flatMap((cue, i) => splitCue(cue, edits.get(i)));
  for (const key of ['original', 'edited']) $(key).setAttribute('aria-pressed', String(mode === key));
  renderTimeline();
  renderPlayer();
}

function renderInspector() {
  const cue = cues[selected];
  const timeField = $('reveal');
  const awaitingMark = timeField.value.trim() === '';
  const time = parseTime(timeField.value);
  const valid = Number.isFinite(time) && time > cue.start && time < cue.end;
  const saved = edits.get(selected);
  const unchanged = saved?.time === time && saved.wordIndex === wordIndex;
  $('words').replaceChildren(...wordPositions(cue.text).map(({ word }, i) => {
    const chip = button(word, () => {
      wordIndex = i;
      renderInspector();
      $('words').children[i].focus();
    });
    chip.setAttribute('aria-pressed', String(i === wordIndex));
    return chip;
  }));
  timeField.setAttribute('aria-invalid', String(!valid && !awaitingMark));
  $('apply').disabled = !valid || unchanged;
  $('apply').textContent = unchanged ? 'Timing fix applied' : 'Apply timing fix';
  $('diagnosis').parentElement.parentElement.classList.toggle('fixed', unchanged);
  $('diagnosis').textContent = awaitingMark ? 'Mark the spoken reveal' : !valid ? 'Check the reveal time' : unchanged ?
    'Reveal timed to the beat' : ((time - cue.start) / 1000).toFixed(2) + 's early in the original';
  $('diagnostic-detail').textContent = !valid ? 'Choose a time between ' + timeLabel(cue.start, 3) + ' and ' + timeLabel(cue.end, 3) + '.' :
    unchanged ? 'The reveal stays on screen for ' + ((cue.end - time) / 1000).toFixed(2) + 's. Replay to check readability.' :
    'Hold the selected word and everything after it.';
  $('remove-fix').hidden = !saved;
  $('earlier').disabled = !valid || time - 100 <= cue.start;
  $('later').disabled = !valid || time + 100 >= cue.end;
  const marker = $('jump-reveal');
  marker.hidden = !valid;
  if (valid) {
    marker.style.left = (100 * time / duration) + '%';
    marker.dataset.align = time < duration / 2 ? 'start' : 'end';
    marker.textContent = 'Reveal ' + timeLabel(time);
  }
  $('compare-cuts').disabled = !unchanged;
  $('viewer-test').disabled = !valid || (mode === 'edited' && !unchanged);
  const versionName = mode === 'original' ? 'Original' : 'Edited';
  $('review-hint').textContent = !valid ? 'Mark the spoken reveal to start a viewer test.' :
    mode === 'edited' && !unchanged ? 'Apply the current timing or select Original to test that cut.' :
    'Hand the ' + versionName + ' cut to a fresh viewer.' + (unchanged ? ' Or replay both cuts in order.' : ' Apply a fix to compare both cuts.');
}

function selectCue(i, seek = true) {
  selected = i;
  $('cue-index').textContent = 'Cue ' + String(i + 1).padStart(2, '0');
  const cue = cues[i];
  const saved = edits.get(i);
  wordIndex = saved?.wordIndex ?? wordPositions(cue.text).length - 1;
  const revealTime = saved?.time ?? (cues === demo && i === 2 ? 7100 : null);
  $('reveal').value = revealTime === null ? '' : timeLabel(revealTime, 3);
  if (seek) {
    video.pause();
    replayEnd = null;
    video.currentTime = cue.start / 1000;
  }
  renderTimeline();
  renderInspector();
  renderPlayer();
}

function renderTimeline() {
  $('length').textContent = timeLabel(duration);
  $('seek').max = duration / 1000;
  $('cue-count').textContent = cues.length + (cues.length === 1 ? ' caption' : ' captions');
  $('ruler').replaceChildren(...[0, .25, .5, .75, 1].map(ratio => span(timeLabel(Math.round(duration * ratio), 1), 'tick')));
  const segments = [], rows = [];
  cues.forEach((cue, i) => {
    const parts = mode === 'edited' ? splitCue(cue, edits.get(i)) : [cue];
    for (const part of parts) {
      const segment = button(part.text, () => {
        selectCue(i);
        video.currentTime = part.start / 1000;
      });
      segment.style.left = (100 * part.start / duration) + '%';
      segment.style.width = (100 * (part.end - part.start) / duration) + '%';
      segment.setAttribute('aria-pressed', String(i === selected));
      segments.push(segment);
    }
    const row = button('', () => selectCue(i), 'cue-row');
    row.append(span(String(i + 1).padStart(2, '0'), 'index'),
      span(timeLabel(cue.start) + ' – ' + timeLabel(cue.end), 'cue-times'), span(cue.text, 'cue-text'));
    if (edits.has(i)) row.append(span('Edited', 'tag'));
    row.setAttribute('aria-pressed', String(i === selected));
    rows.push(row);
  });
  playhead = span('', 'playhead');
  $('track').replaceChildren(...segments, playhead);
  $('cues').replaceChildren(...rows);
}

async function playVideo() {
  try { await video.play(); }
  catch { announce('Playback failed. Try a video format supported by this browser.'); }
}

$('play').onclick = () => {
  replayEnd = null;
  if (video.paused) playVideo();
  else video.pause();
};
video.onplay = () => {
  $('watch-demo').hidden = true;
  $('play').firstElementChild.src = 'assets/icons/pause-fill.svg';
  $('play').setAttribute('aria-label', 'Pause');
  cancelAnimationFrame(animation);
  tick();
};
video.onpause = () => {
  $('play').firstElementChild.src = 'assets/icons/play-fill.svg';
  $('play').setAttribute('aria-label', 'Play');
  cancelAnimationFrame(animation);
  renderPlayer();
};
video.onseeked = renderPlayer;
$('watch-demo').onclick = () => {
  replayEnd = null;
  video.currentTime = 0;
  playVideo();
};
$('jump-reveal').onclick = () => {
  replayEnd = null;
  video.pause();
  video.currentTime = parseTime($('reveal').value) / 1000;
  renderPlayer();
};
video.ontimeupdate = renderPlayer;
$('seek').oninput = event => {
  replayEnd = null;
  video.currentTime = Number(event.target.value);
  renderPlayer();
};
$('mute').onclick = () => {
  video.muted = !video.muted;
  $('mute').setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
  $('mute').firstElementChild.src = video.muted ? 'assets/icons/speaker-slash.svg' : 'assets/icons/speaker-high.svg';
};
for (const version of ['original', 'edited']) {
  $(version).onclick = () => {
    setMode(version);
    renderInspector();
  };
}
for (const [control, offset] of [['earlier', -100], ['later', 100]]) {
  $(control).onclick = () => {
    $('reveal').value = timeLabel(parseTime($('reveal').value) + offset, 3);
    renderInspector();
  };
}
$('reveal').oninput = renderInspector;
$('mark').onclick = () => {
  $('reveal').value = timeLabel(Math.round(video.currentTime * 1000), 3);
  renderInspector();
};
$('audition').onclick = () => {
  video.currentTime = Math.max(0, cues[selected].start - 300) / 1000;
  replayEnd = Math.min(duration, cues[selected].end + 200);
  playVideo();
};
$('apply').onclick = () => {
  edits.set(selected, { wordIndex, time: parseTime($('reveal').value) });
  setMode('edited');
  renderInspector();
  $('audition').click();
  announce('Timing fix applied. Playing the edited caption.');
};
const removeFix = button('Remove timing fix', () => {
  edits.delete(selected);
  setMode('edited');
  selectCue(selected);
  announce('Original timing restored for this caption.');
}, 'bare');
removeFix.id = 'remove-fix';
$('audition').after(removeFix);

$('export').onclick = () => {
  const result = cues.flatMap((cue, i) => splitCue(cue, edits.get(i)));
  const blob = new Blob([serializeSrt(result)], { type:'application/x-subrip;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = $('filename').textContent + '.edited.srt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  announce('Exported ' + result.length + ' captions with the current edits.');
};

function loadProject(src, name, newCues, length, demoProject = false) {
  video.pause();
  replayEnd = null;
  const previousUrl = sourceUrl;
  sourceUrl = demoProject ? undefined : src;
  video.poster = demoProject ? 'assets/poster.jpg' : '';
  video.src = src;
  $('play').firstElementChild.src = 'assets/icons/play-fill.svg';
  $('play').setAttribute('aria-label', 'Play');
  if (previousUrl) URL.revokeObjectURL(previousUrl);
  cues = newCues;
  duration = length;
  edits = new Map();
  clearObservations();
  $('filename').textContent = name.replace(/\.[^.]+$/, '');
  document.querySelector('.transport').dataset.clip = name;
  video.parentElement.classList.toggle('demo-stage', demoProject);
  $('watch-demo').hidden = !demoProject;
  $('filetype').textContent = demoProject ? 'Demo clip' : 'Local clip';
  setMode('original');
  selectCue(demoProject ? 2 : 0, false);
}

function inspectVideo(url) {
  return new Promise((resolve, reject) => {
    const probe = document.createElement('video');
    function finish(length) {
      clearTimeout(timeout);
      probe.onloadedmetadata = probe.onerror = null;
      probe.removeAttribute('src');
      probe.load();
      if (Number.isFinite(length) && length > 0) resolve(length);
      else reject(new Error('Could not read the video duration. Try a playable MP4 or WebM.'));
    }
    const timeout = setTimeout(() => finish(NaN), 12000);
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => finish(Math.round(probe.duration * 1000));
    probe.onerror = () => finish(NaN);
    probe.src = url;
  });
}
$('guide').onclick = () => $('guide-dialog').showModal();
$('open-import').onclick = () => {
  $('import-error').textContent = '';
  $('import-dialog').showModal();
};
for (const close of document.querySelectorAll('.close')) close.onclick = () => close.closest('dialog').close();
$('load-demo').onclick = () => {
  if (edits.size && !confirm('Replace this clip and its current edits with the demo?')) return;
  loadProject('assets/demo.mp4', 'Coffee break.mp4', demo, 9000, true);
  $('guide-dialog').close();
  announce('Coffee demo loaded.');
};
$('import-form').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('.primary');
  submit.disabled = true;
  let url;
  try {
    const file = $('video-file').files[0];
    const subtitles = readCaptions(await $('caption-file').files[0].text());
    url = URL.createObjectURL(file);
    const length = await inspectVideo(url);
    if (subtitles.at(-1).end > length + 1) throw new Error('These captions extend beyond the video. Choose a matching pair.');
    if (!$('import-dialog').open) return;
    if (edits.size && !confirm('Replace this clip and its current edits?')) return;
    loadProject(url, file.name, subtitles, length);
    url = undefined;
    $('import-dialog').close();
    form.reset();
    announce('Clip loaded. Select a caption and mark its reveal.');
  } catch (error) {
    $('import-error').textContent = error.message;
  } finally {
    if (url) URL.revokeObjectURL(url);
    submit.disabled = false;
  }
};

selectCue(2, false);

