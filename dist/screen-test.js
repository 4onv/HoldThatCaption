import { splitCue, timeLabel, wordPositions } from './captions.mjs';

const $ = id => document.getElementById(id);
const seconds = ms => (ms / 1000).toFixed(2) + 's';

export function setupScreenTest(getContext) {
  const dialog = $('review-dialog');
  const player = $('review-video');
  const frame = player.parentElement;
  const action = $('review-action');
  let session;
  let phase = 'closed';
  let track = [];
  let stopAt = 0;
  let tappedAt;
  let animation;
  let attemptCount = 0;

  function actionButton(label, handler) {
    action.textContent = label;
    action.hidden = false;
    action.onclick = handler;
  }

  function pause() {
    cancelAnimationFrame(animation);
    player.pause();
  }

  function message(title, instruction, result = '') {
    $('review-heading').textContent = title;
    $('review-instruction').textContent = instruction;
    $('review-result').textContent = result;
  }

  function renderFrame() {
    const now = Math.round(player.currentTime * 1000);
    const active = track.find(cue => cue.start <= now && now < cue.end);
    $('review-caption').textContent = active?.text ?? '';
    if (now >= stopAt || player.ended) {
      completePass();
    } else {
      animation = requestAnimationFrame(renderFrame);
    }
  }

  function completePass() {
    const completed = phase;
    phase = 'between';
    pause();
    if (completed === 'original') {
      playPass('edited');
    } else if (completed === 'edited') {
      phase = 'done';
      const { cue, edit } = session;
      message('Both cuts played', 'The footage and audio were identical in both passes.',
        'The edited caption held the reveal for ' + seconds(edit.time - cue.start) +
        ' and left it visible for ' + seconds(cue.end - edit.time) + '.');
      actionButton('Compare again', () => playPass('original'));
    } else if (completed === 'viewer') {
      saveObservation(null, '');
    }
  }

  function takeGuess() {
    if (phase !== 'viewer' || player.paused) return;
    tappedAt = Math.round(player.currentTime * 1000);
    pause();
    phase = 'guess';
    frame.hidden = true;
    action.hidden = true;
    message('What did you expect?', 'Playback is paused. Record your guess before seeing the reveal.');
    $('guess-form').hidden = false;
    $('guess').value = '';
    $('guess').focus();
  }

  async function playPass(kind) {
    const currentSession = session;
    phase = kind;
    frame.hidden = false;
    $('guess-form').hidden = true;
    const blind = kind === 'viewer';
    const version = blind ? session.version : kind;
    track = version === 'original' ? session.original : session.edited;
    stopAt = session.cue.end;
    player.muted = blind || session.muted;
    const start = blind ? session.setupStart : Math.max(0, session.cue.start - 550);
    message(blind ? 'Watch the clip' : kind === 'original' ? 'First pass · Original' : 'Second pass · Edited',
      blind ? 'Tap as soon as you think you know the punchline.' : 'Watch when the reveal word appears.');
    $('review-caption').textContent = '';
    if (blind) actionButton('I know the punchline', takeGuess);
    else action.hidden = true;
    try {
      player.currentTime = start / 1000;
      await player.play();
      if (session === currentSession && phase === kind) {
        if (blind) action.focus();
        renderFrame();
      }
    } catch {
      if (session !== currentSession || phase !== kind) return;
      phase = 'ready';
      message('Playback interrupted', 'Try playing this cut again.');
      actionButton('Retry playback', () => playPass(kind));
    }
  }

  function saveObservation(time, guess) {
    phase = 'done';
    frame.hidden = true;
    $('guess-form').hidden = true;
    const { cue, reveal, version, wordIndex, cueNumber } = session;
    const word = wordPositions(cue.text)[wordIndex].word;
    let observation = 'No guess recorded before the caption ended.';
    if (time !== null) {
      const gap = time - reveal;
      const timing = gap === 0 ? 'at the marked reveal' : seconds(Math.abs(gap)) + (gap < 0 ? ' before' : ' after') + ' the marked reveal';
      observation = 'Tapped at ' + timeLabel(time, 3) + ', ' + timing + '. Guess: “' + guess + '”.';
    }
    const label = version === 'edited' ? 'Edited' : 'Original';
    const detail = label + ' · Cue ' + cueNumber + ' · “' + word + '” at ' + timeLabel(reveal, 3) + '. ' + observation;
    const item = document.createElement('li');
    item.textContent = detail;
    $('note-list').append(item);
    attemptCount++;
    $('note-count').textContent = String(attemptCount);
    $('observations').hidden = false;
    message('Viewer note saved', detail);
    actionButton('Return to studio', () => dialog.close());
    action.focus();
  }

  function open(kind) {
    session = getContext();
    $('video').pause();
    player.src = session.src;
    frame.hidden = true;
    $('guess-form').hidden = true;
    phase = 'ready';
    if (kind === 'viewer') {
      message('Hand this to a fresh viewer', 'Watch once with the sound off. Tap when you think you know the punchline, then enter your guess.');
      actionButton('Start blind viewing', () => playPass('viewer'));
    } else {
      message('Compare the cuts', 'Watch the same passage twice. The original plays first, followed by the edited captions.');
      actionButton('Play both cuts', () => playPass('original'));
    }
    dialog.showModal();
    action.focus();
  }

  $('guess-form').onsubmit = event => {
    event.preventDefault();
    const guess = $('guess').value.trim();
    if (phase !== 'guess') return;
    if (!guess) { $('guess').focus(); return; }
    saveObservation(tappedAt, guess);
  };
  $('close-review').onclick = () => { pause(); dialog.close(); };
  dialog.oncancel = pause;
  dialog.onclose = () => {
    phase = 'closed';
    session = null;
    pause();
    player.removeAttribute('src');
    player.load();
  };
  $('viewer-test').onclick = () => open('viewer');
  $('compare-cuts').onclick = () => open('compare');
  $('save-notes').onclick = () => {
    const title = $('filename').textContent;
    const lines = Array.from($('note-list').children, (item, i) => (i + 1) + '. ' + item.textContent);
    const report = ['HoldThatCaption · ' + title, 'Muted viewer tests', '', ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([report], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = title + '.viewer-notes.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return function clearObservations() {
    attemptCount = 0;
    $('observations').hidden = true;
    $('note-list').replaceChildren();
  };
}
