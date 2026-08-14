const form = document.querySelector('#verification-form');
const puzzleForm = document.querySelector('#puzzle-form');
const showPuzzle = document.querySelector('#show-puzzle');
const prompt = document.querySelector('#puzzle-prompt');
const instruction = document.querySelector('#puzzle-instruction');
const sequence = document.querySelector('#signal-sequence');
const options = document.querySelector('#rune-options');
const unlock = puzzleForm.querySelector('.unlock');
const status = document.querySelector('#status');
const widget = document.querySelector('altcha-widget');
const title = document.querySelector('#title');
const intro = document.querySelector('#intro');
const legend = document.querySelector('#puzzle-legend');
const unlockLabel = document.querySelector('#unlock-label');
const privacy = document.querySelector('#privacy');
const languageButtons = document.querySelectorAll('[data-language]');
const riskTag = document.querySelector('#risk-tag');
const themeButtons = document.querySelectorAll('[data-theme]');
const card = document.querySelector('.card');
const showSlider = document.querySelector('#show-slider');
const sliderForm = document.querySelector('#slider-form');
const sliderTitle = document.querySelector('#slider-title');
const sliderInstruction = document.querySelector('#slider-instruction');
const sliderTrack = document.querySelector('#slider-track');
const signalSlider = document.querySelector('#signal-slider');
const sliderStrength = document.querySelector('#slider-strength');
const sliderRisk = document.querySelector('#slider-risk');
const fallbackGrant = document.querySelector('#fallback-grant');
const fallbackVerified = document.querySelector('#fallback-verified');
let puzzleToken = '';
let selectedRune = '';
let sliderToken = '';
let sliderTarget = 50;
const verificationParams = new URLSearchParams(location.search);
const verificationAudience = verificationParams.get('audience') || location.origin;
const verificationContext = verificationParams.get('context') || crypto.randomUUID().replaceAll('-', '');
const verificationQuery = new URLSearchParams({ audience: verificationAudience, context: verificationContext });
const verificationEndpoint = (path) => `${path}?${verificationQuery.toString()}`;
let currentLanguage = ['en', 'es', 'fr', 'pt'].find((language) => navigator.language.toLowerCase().startsWith(language)) || 'en';

const copy = {
  en: { title: 'Let’s make sure you’re human', intro: 'Private verification with no tracking. Complete the automatic challenge or use the puzzle instead.', continue: 'Continue', fallback: 'Having trouble? Use a puzzle', puzzleTitle: 'Match the signal', puzzleInstruction: 'Tap the identical signal below. Order matters.', legend: 'Select the matching signal', unlock: 'Unlock signal', privacy: 'No cookies · No fingerprinting · No image recognition', checking: 'Checking…', checkingAnswer: 'Checking your answer…', verified: 'Verified. You may continue.', failed: 'Automatic verification failed. Try the puzzle below.', failedPuzzle: 'Automatic verification failed. Complete the puzzle instead.', unavailable: 'The puzzle could not load. Please try again later.', mismatch: 'That signal didn’t match. Here’s a new puzzle.', then: 'then', risk: { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' }, glyph: { moon: 'moon', paw: 'paw', spark: 'spark', eye: 'eye', bolt: 'bolt', diamond: 'diamond', flame: 'flame', orbit: 'orbit', wolf: 'wolf', star: 'star' } },
  es: { title: 'Confirmemos que eres humano', intro: 'Verificación privada sin seguimiento. Completa el reto automático o usa el puzzle alternativo.', continue: 'Continuar', fallback: '¿Tienes problemas? Usa el puzzle', puzzleTitle: 'Iguala la señal', puzzleInstruction: 'Toca la señal idéntica. El orden importa.', legend: 'Selecciona la señal correcta', unlock: 'Desbloquear señal', privacy: 'Sin cookies · Sin huella digital · Sin reconocimiento de imágenes', checking: 'Verificando…', checkingAnswer: 'Comprobando tu respuesta…', verified: 'Verificado. Puedes continuar.', failed: 'La verificación automática falló. Usa el puzzle inferior.', failedPuzzle: 'La verificación automática falló. Completa el puzzle alternativo.', unavailable: 'El puzzle no pudo cargarse. Inténtalo más tarde.', mismatch: 'La señal no coincide. Aquí tienes un nuevo puzzle.', then: 'seguido de', risk: { low: 'BAJO', medium: 'MEDIO', high: 'ALTO' }, glyph: { moon: 'luna', paw: 'huella', spark: 'destello', eye: 'ojo', bolt: 'rayo', diamond: 'diamante', flame: 'llama', orbit: 'órbita', wolf: 'lobo', star: 'estrella' } },
  fr: { title: 'Vérifions que vous êtes humain', intro: 'Vérification privée sans suivi. Terminez le défi automatique ou utilisez le puzzle alternatif.', continue: 'Continuer', fallback: 'Un problème ? Utilisez le puzzle', puzzleTitle: 'Associez le signal', puzzleInstruction: 'Touchez le signal identique. L’ordre compte.', legend: 'Sélectionnez le bon signal', unlock: 'Déverrouiller le signal', privacy: 'Sans cookies · Sans empreinte numérique · Sans reconnaissance d’image', checking: 'Vérification…', checkingAnswer: 'Vérification de votre réponse…', verified: 'Vérifié. Vous pouvez continuer.', failed: 'La vérification automatique a échoué. Utilisez le puzzle ci-dessous.', failedPuzzle: 'La vérification automatique a échoué. Terminez le puzzle alternatif.', unavailable: 'Le puzzle n’a pas pu être chargé. Réessayez plus tard.', mismatch: 'Ce signal ne correspond pas. Voici un nouveau puzzle.', then: 'puis', risk: { low: 'FAIBLE', medium: 'MOYEN', high: 'ÉLEVÉ' }, glyph: { moon: 'lune', paw: 'patte', spark: 'éclat', eye: 'œil', bolt: 'éclair', diamond: 'diamant', flame: 'flamme', orbit: 'orbite', wolf: 'loup', star: 'étoile' } },
  pt: { title: 'Vamos confirmar que você é humano', intro: 'Verificação privada sem rastreamento. Conclua o desafio automático ou use o puzzle alternativo.', continue: 'Continuar', fallback: 'Com problemas? Use o puzzle', puzzleTitle: 'Combine o sinal', puzzleInstruction: 'Toque no sinal idêntico. A ordem importa.', legend: 'Selecione o sinal correto', unlock: 'Desbloquear sinal', privacy: 'Sem cookies · Sem impressão digital · Sem reconhecimento de imagens', checking: 'Verificando…', checkingAnswer: 'Verificando sua resposta…', verified: 'Verificado. Você pode continuar.', failed: 'A verificação automática falhou. Use o puzzle abaixo.', failedPuzzle: 'A verificação automática falhou. Conclua o puzzle alternativo.', unavailable: 'Não foi possível carregar o puzzle. Tente novamente mais tarde.', mismatch: 'O sinal não corresponde. Aqui está um novo puzzle.', then: 'depois', risk: { low: 'BAIXO', medium: 'MÉDIO', high: 'ALTO' }, glyph: { moon: 'lua', paw: 'pata', spark: 'faísca', eye: 'olho', bolt: 'raio', diamond: 'diamante', flame: 'chama', orbit: 'órbita', wolf: 'lobo', star: 'estrela' } },
};

const sliderCopy = {
  en: { method: 'Use Signal Slider', puzzle: 'Use rune puzzle instead', title: 'Lock onto the signal', instruction: 'Drag the wolf into the glowing target.', verify: 'Verify position', aria: 'Signal position' },
  es: { method: 'Usar Signal Slider', puzzle: 'Usar puzzle de runas', title: 'Sintoniza la señal', instruction: 'Arrastra el lobo hasta el objetivo brillante.', verify: 'Verificar posición', aria: 'Posición de la señal' },
  fr: { method: 'Utiliser Signal Slider', puzzle: 'Utiliser le puzzle de runes', title: 'Verrouillez le signal', instruction: 'Faites glisser le loup dans la cible lumineuse.', verify: 'Vérifier la position', aria: 'Position du signal' },
  pt: { method: 'Usar Signal Slider', puzzle: 'Usar puzzle de runas', title: 'Sintonize o sinal', instruction: 'Arraste o lobo até o alvo brilhante.', verify: 'Verificar posição', aria: 'Posição do sinal' },
};

const glyphs = { moon: '◒', paw: '◆', spark: '✦', eye: '◉', bolt: 'ϟ', diamond: '◇', flame: '♨', orbit: '⊛', star: '★' };
const t = (key) => copy[currentLanguage][key];
const glyphName = (name) => copy[currentLanguage].glyph[name] ?? name;
const glyph = (name) => glyphs[name] ?? '•';
const glyphMarkup = (name) => name === 'wolf' ? '<img class="glyph-wolf" src="/assets/friskydev-wolf-transparent.png" alt="">' : glyph(name);

function setStatus(message, success = false) {
  status.textContent = message;
  status.classList.toggle('success', success);
}

function completeFallback(result) {
  fallbackGrant.value = result.grant;
  widget.hidden = true;
  fallbackVerified.hidden = false;
  fallbackVerified.querySelector('strong').textContent = t('verified');
  setStatus(t('verified'), true);
  notifyParent(result);
}

function notifyParent(result) {
  if (!result?.verified || !result?.grant || window.parent === window) return;
  window.parent.postMessage({
    type: 'friskydev-human-verification',
    verified: true,
    grant: result.grant,
    context: verificationContext,
  }, verificationAudience);
}

function applyLanguage(language) {
  currentLanguage = language;
  document.documentElement.lang = language;
  widget.language = language;
  title.textContent = t('title');
  intro.textContent = t('intro');
  form.querySelector('.primary').textContent = t('continue');
  showPuzzle.textContent = sliderCopy[language].puzzle;
  prompt.textContent = t('puzzleTitle');
  instruction.textContent = t('puzzleInstruction');
  legend.textContent = t('legend');
  unlockLabel.textContent = t('unlock');
  privacy.textContent = t('privacy');
  showSlider.textContent = sliderCopy[language].method;
  sliderTitle.textContent = sliderCopy[language].title;
  sliderInstruction.textContent = sliderCopy[language].instruction;
  sliderForm.querySelector('.slider-submit').childNodes[0].textContent = `${sliderCopy[language].verify} `;
  signalSlider.setAttribute('aria-label', sliderCopy[language].aria);
  if (puzzleForm.dataset.risk) riskTag.textContent = `RISK / ${copy[language].risk[puzzleForm.dataset.risk]}`;
  if (sliderForm.dataset.risk) sliderRisk.textContent = `RISK / ${copy[language].risk[sliderForm.dataset.risk]}`;
  languageButtons.forEach((button) => button.setAttribute('aria-current', String(button.dataset.language === language)));
}

async function loadPuzzle() {
  setStatus('');
  const response = await fetch(verificationEndpoint('/api/puzzle'), { cache: 'no-store' });
  if (!response.ok) throw new Error('Puzzle unavailable');
  const puzzle = await response.json();
  puzzleToken = puzzle.token;
  prompt.textContent = t('puzzleTitle');
  instruction.textContent = t('puzzleInstruction');
  selectedRune = '';
  puzzleForm.dataset.risk = puzzle.risk;
  riskTag.textContent = `RISK / ${copy[currentLanguage].risk[puzzle.risk]}`;
  sequence.style.gridTemplateColumns = `repeat(${puzzle.sequence.length}, 58px)`;
  puzzleForm.classList.remove('has-selection', 'unlocked');
  unlock.disabled = true;
  sequence.replaceChildren(...puzzle.sequence.map((name, index) => {
    const rune = document.createElement('span');
    rune.className = 'sequence-rune';
    rune.style.setProperty('--delay', `${index * 80}ms`);
    rune.innerHTML = glyphMarkup(name);
    rune.setAttribute('aria-label', glyphName(name));
    return rune;
  }));
  options.replaceChildren(...puzzle.options.map((name) => {
    const names = name.split(':');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rune-choice';
    button.dataset.rune = name;
    button.setAttribute('aria-label', names.map(glyphName).join(` ${t('then')} `));
    button.innerHTML = `<span class="choice-pair" aria-hidden="true">${names.map((item) => `<i>${glyphMarkup(item)}</i>`).join('')}</span><small>${names.map(glyphName).join(' · ')}</small>`;
    button.addEventListener('click', () => {
      selectedRune = name;
      options.querySelectorAll('button').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      puzzleForm.classList.add('has-selection');
      unlock.disabled = false;
    });
    return button;
  }));
  options.querySelector('button')?.focus();
}

async function loadSlider() {
  setStatus('');
  const response = await fetch(verificationEndpoint('/api/slider'), { cache: 'no-store' });
  if (!response.ok) throw new Error('Slider unavailable');
  const challenge = await response.json();
  sliderToken = challenge.token;
  sliderTarget = challenge.target;
  sliderForm.dataset.risk = challenge.risk;
  sliderRisk.textContent = `RISK / ${copy[currentLanguage].risk[challenge.risk]}`;
  signalSlider.disabled = false;
  signalSlider.value = '0';
  sliderTrack.style.setProperty('--value', '0%');
  sliderTrack.style.setProperty('--target', `${challenge.target}%`);
  sliderTrack.style.setProperty('--strength', '0');
  sliderForm.style.setProperty('--strength', '0');
  sliderStrength.textContent = '00%';
  sliderForm.classList.remove('locked');
}

languageButtons.forEach((button) => button.addEventListener('click', async () => {
  applyLanguage(button.dataset.language);
  if (!puzzleForm.hidden) await loadPuzzle();
}));
applyLanguage(currentLanguage);
widget.setAttribute('challenge', verificationEndpoint('/api/altcha/challenge'));

themeButtons.forEach((button) => button.addEventListener('click', () => {
  document.documentElement.dataset.theme = button.dataset.theme;
  themeButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
}));
document.documentElement.dataset.theme = 'acid';
themeButtons[0]?.setAttribute('aria-pressed', 'true');

if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  card.addEventListener('pointermove', (event) => {
    const bounds = card.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    card.style.setProperty('--mx', `${x * 100}%`);
    card.style.setProperty('--my', `${y * 100}%`);
    card.style.setProperty('--ry', `${(x - 0.5) * 3.5}deg`);
    card.style.setProperty('--rx', `${(0.5 - y) * 3.5}deg`);
  });
  card.addEventListener('pointerleave', () => {
    card.style.setProperty('--mx', '50%');
    card.style.setProperty('--my', '20%');
    card.style.setProperty('--ry', '0deg');
    card.style.setProperty('--rx', '0deg');
  });
}

showPuzzle.addEventListener('click', async () => {
  puzzleForm.hidden = false;
  sliderForm.hidden = true;
  showSlider.hidden = false;
  showPuzzle.hidden = true;
  try { await loadPuzzle(); } catch { setStatus(t('unavailable')); }
});

showSlider.addEventListener('click', async () => {
  puzzleForm.hidden = true;
  showSlider.hidden = true;
  sliderForm.hidden = false;
  showPuzzle.hidden = false;
  widget.hidden = true;
  form.querySelector('.primary').hidden = true;
  try { await loadSlider(); } catch { setStatus(t('unavailable')); }
});

signalSlider.addEventListener('input', () => {
  const value = Number(signalSlider.value);
  const strength = Math.max(0, Math.round(100 - Math.abs(value - sliderTarget) * 2.25));
  sliderTrack.style.setProperty('--value', `${value}%`);
  sliderTrack.style.setProperty('--strength', String(strength / 100));
  sliderForm.style.setProperty('--strength', String(strength / 100));
  sliderStrength.textContent = `${String(strength).padStart(2, '0')}%`;
  sliderTrack.classList.toggle('is-hot', strength >= 80);
});
signalSlider.addEventListener('pointerdown', () => sliderTrack.classList.add('is-dragging'));
signalSlider.addEventListener('pointerup', () => sliderTrack.classList.remove('is-dragging'));
signalSlider.addEventListener('pointercancel', () => sliderTrack.classList.remove('is-dragging'));

sliderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(t('checkingAnswer'));
  const response = await fetch('/api/slider/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: sliderToken, position: signalSlider.value }) });
  const result = await response.json();
  if (result.verified) {
    sliderForm.classList.add('locked');
    signalSlider.disabled = true;
    completeFallback(result);
  } else {
    setStatus(t('mismatch'));
    sliderForm.classList.add('signal-error');
    setTimeout(() => sliderForm.classList.remove('signal-error'), 500);
    await loadSlider();
  }
});

let signalFallbackTimer = window.setTimeout(() => {
  if (!fallbackGrant.value && sliderForm.hidden) {
    setStatus(t('failed'));
    showSlider.click();
  }
}, 5000);

widget.addEventListener('statechange', (event) => {
  if (event.detail?.state === 'verified') window.clearTimeout(signalFallbackTimer);
  if (event.detail?.state === 'error' || event.detail?.state === 'expired') {
    window.clearTimeout(signalFallbackTimer);
    setStatus(t('failed'));
    if (!showSlider.hidden) showSlider.click();
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(t('checking'));
  try {
    const response = await fetch(form.action, { method: 'POST', body: new FormData(form) });
    const result = await response.json();
    setStatus(result.verified ? t('verified') : t('failed'), result.verified);
    if (result.verified) form.querySelector('.primary').disabled = true;
    if (result.verified) notifyParent(result);
    if (!result.verified && !showSlider.hidden) showSlider.click();
  } catch {
    setStatus(t('failed'));
    if (!showSlider.hidden) showSlider.click();
  }
});

puzzleForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(t('checkingAnswer'));
  const response = await fetch('/api/puzzle/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: puzzleToken, answer: selectedRune }) });
  const result = await response.json();
  if (result.verified) {
    completeFallback(result);
    puzzleForm.classList.add('unlocked');
    options.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    unlock.disabled = true;
  } else {
    setStatus(t('mismatch'));
    puzzleForm.classList.add('signal-error');
    setTimeout(() => puzzleForm.classList.remove('signal-error'), 500);
    await loadPuzzle();
  }
});
