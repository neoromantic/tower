/* Original realtime synthesis, using the engine's resource IDs. */
const soundSpecs = new Map([
  [0xa71d, ['bell', .48, 1320]], [0xa714, ['impact', .85, 54]],
  [0xa71f, ['melody', .9, 440]], [0xa719, ['fire', 2, 70]],
  [0xa713, ['alarm', .85, 330]], [0xa710, ['alarm', .65, 220]],
  [0xa716, ['alarm', 1.2, 660]], [0xa718, ['melody', 2.4, 523.25]],
  [0x88e8, ['motor', 1.8, 65]], [0xa71e, ['steps', .8, 135]],
  [0x9771, ['bell', .55, 880]], [0x9772, ['motor', .45, 180]],
  [0xa71a, ['motor', 2.5, 95]], [0x938c, ['bell', 1, 1046.5]],
  [0x938d, ['melody', 1.8, 392]], [0x938b, ['melody', 1.4, 493.88]],
  [0x9388, ['melody', 1.4, 349.23]], [0x9389, ['melody', 1.7, 587.33]],
  [0x938a, ['bell', 1.5, 392]], [0x9b58, ['impact', .22, 180]],
  [0x9b59, ['drill', 1, 48]], [0x9b5a, ['bell', .12, 740]],
  [0xa715, ['impact', .7, 75]], [0x9b5b, ['impact', .4, 110]],
  [0xce20, ['melody', 2.8, 329.63]], [0x8568, ['dining', 3, 245]],
  [0x8569, ['dining', 3, 295]], [0x85a8, ['office', 3, 185]],
  [0x8629, ['room', 3, 220]], [0x8628, ['room', 3, 165]],
  [0x8668, ['dining', 3, 350]], [0x86a8, ['motor', 3, 45]],
  [0x86a9, ['motor', 3, 58]], [0x8b28, ['melody', 3, 261.63]],
  [0xa71c, ['birds', 3, 1600]], [0xa71b, ['birds', 3, 2400]],
  [0xa712, ['bell', 2, 1568]]
]);
for (let movie = 0; movie < 15; movie++) soundSpecs.set(0xa329 + movie, ['melody', 3, 196 * 2 ** (movie / 12)]);
let soundContext;
let soundMaster;
const soundBuses = new Map();
const soundLast = new Map();
const soundLoops = new Map();
const soundCurrent = new Map();
let soundVoices = 0;
window.ctAudio = {
  muted: localStorage.getItem('ct-muted') === 'true',
  unlock() {
    if (!soundContext) {
      soundContext = new AudioContext();
      soundMaster = soundContext.createGain();
      soundMaster.gain.value = Number(document.getElementById('volume').value);
      soundMaster.connect(soundContext.destination);
      for (const category of ['effects', 'ambient', 'music']) {
        const bus = soundContext.createGain();
        bus.gain.value = Number(document.getElementById('audio-' + category).checked);
        bus.connect(soundMaster);
        soundBuses.set(category, bus);
      }
    }
    this.gate();
  },
  gate() {
    document.getElementById('mutebtn').textContent = 'Mute sound';
    if (this.muted) document.getElementById('mutebtn').textContent = 'Unmute sound';
    if (!soundContext) return;
    if (this.muted) { soundContext.suspend(); return; }
    if (document.hidden) { soundContext.suspend(); return; }
    soundContext.resume();
  },
  volume(value) { if (soundContext) soundMaster.gain.setTargetAtTime(value, soundContext.currentTime, .02); },
  category(name, enabled) { if (soundContext) soundBuses.get(name).gain.setTargetAtTime(Number(enabled), soundContext.currentTime, .02); }
};
window.ctSound = id => {
  if (!soundContext) return;
  if (soundContext.state !== 'running') return;
  if (!soundSpecs.has(id)) return;
  if (soundVoices >= 8) return;
  const [kind, duration, frequency] = soundSpecs.get(id);
  const now = soundContext.currentTime;
  if (soundLast.has(id) && now - soundLast.get(id) < duration * .8) return;
  soundLast.set(id, now);
  let category = 'effects';
  if (['room', 'office', 'dining', 'birds', 'motor', 'fire'].includes(kind)) category = 'ambient';
  if (kind === 'melody') category = 'music';
  const buffer = soundContext.createBuffer(1, Math.ceil(soundContext.sampleRate * duration), soundContext.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = id;
  let low = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / soundContext.sampleRate;
    const phase = 2 * Math.PI * frequency * t;
    seed = (1664525 * seed + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    low = .94 * low + .06 * noise;
    let s = 0;
    switch (kind) {
      case 'bell': s = Math.sin(phase) * Math.exp(-(t % .24) * 14 - t * 2); break;
      case 'melody': s = Math.sin(phase * 2 ** ([0, 7, 3, 10, 12][(Math.floor(t / .3) + id) % 5] / 12)) * Math.exp(-(t % .3) * 9); break;
      case 'alarm': s = Math.sin(phase + 16 * Math.sin(t * 19)) * (.35 + .65 * Math.sin(t * 25) ** 2); break;
      case 'impact': s = (3 * low + Math.sin(phase / (1 + 6 * t))) * Math.exp(-t * 12 / duration); break;
      case 'steps': s = (low * 4 + .4 * Math.sin(phase)) * Math.exp(-(t % .32) * 65); break;
      case 'drill': s = (noise * .35 + Math.sin(phase)) * Math.exp(-(t % .055) * 80); break;
      case 'fire': s = low * 2 + noise * .08; break;
      case 'motor': s = (.55 * Math.sin(phase + 7 * Math.sin(t * 3)) + 2 * low) * (.6 + .4 * Math.sin(t * 9) ** 2); break;
      case 'birds': s = Math.sin(phase + 22 * Math.sin(t * 13)) * Math.exp(-(t % .43) * 25); break;
      case 'dining': s = (.35 * Math.sin(phase + 5 * Math.sin(t * 7)) + low) * (.3 + .7 * Math.sin(t * 5) ** 2); break;
      case 'office': s = low * .4 + noise * Math.exp(-(t % .137) * 170); break;
      case 'room': s = low + .1 * Math.sin(phase) * Math.sin(t * 3) ** 4; break;
    }
    samples[i] = s * .16 * Math.min(1, t * 100, (duration - t) * 100);
  }
  const voice = soundContext.createBufferSource();
  voice.buffer = buffer;
  voice.connect(soundBuses.get(category));
  soundVoices++;
  soundCurrent.set(id, voice);
  voice.onended = () => {
    soundVoices--;
    voice.disconnect();
    if (soundCurrent.get(id) === voice) soundCurrent.delete(id);
  };
  voice.start();
};
window.ctSoundLoop = (id, on) => {
  if (on) {
    if (soundLoops.has(id)) return;
    ctSound(id);
    soundLoops.set(id, setInterval(() => ctSound(id), soundSpecs.get(id)[1] * 1000));
  } else {
    clearInterval(soundLoops.get(id));
    soundLoops.delete(id);
    soundLast.delete(id);
    if (soundCurrent.has(id)) soundCurrent.get(id).stop();
  }
};
document.addEventListener('visibilitychange', () => ctAudio.gate());
