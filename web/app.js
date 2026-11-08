const settings = document.getElementById('settings');
const style = document.getElementById('style');
const zoom = document.getElementById('zoom');
const uiScale = document.getElementById('uiscale');
const saveState = document.getElementById('savestate');
const world = document.getElementById('world');
const canvas = Module.canvas;
let playing = false;
let saving = false;
let tool = -3;
let installPrompt = null;
const pointers = new Map();
let gesture = false;
let pinching = false;
let pinchDistance = 0;
const buildings = {
  structure: [[1, 'Lobby'], [2, 'Floor']],
  rooms: [[3, 'Office'], [4, 'Condo'], [5, 'Hotel single'], [6, 'Hotel twin'], [7, 'Hotel suite'], [8, 'Restaurant'], [9, 'Fast food'], [10, 'Shop'], [11, 'Cinema'], [12, 'Party hall'], [15, 'Cathedral']],
  transport: [[19, 'Stairs'], [20, 'Escalator'], [21, 'Elevator'], [22, 'Service elevator'], [23, 'Express elevator'], [13, 'Metro'], [14, 'Parking'], [25, 'Parking ramp']],
  services: [[16, 'Medical'], [17, 'Security'], [18, 'Recycling'], [24, 'Housekeeping']]
};
for (const control of [style, zoom, uiScale]) {
  const stored = localStorage.getItem('ct-' + control.id);
  if (stored !== null) control.value = stored;
}
document.documentElement.style.setProperty('--ui', uiScale.value);
document.getElementById('zoomvalue').textContent = Math.round(Number(zoom.value) * 100) + '%';
function resizeWorld() {
  if (!playing) return;
  Module.ccall('ct_resize', null, ['number', 'number', 'number'], [world.clientWidth, world.clientHeight, devicePixelRatio]);
}
new ResizeObserver(resizeWorld).observe(world);
window.addEventListener('resize', resizeWorld);
function selectTool(value) {
  Module.ccall('ct_tool', null, ['number'], [value]);
  const state = JSON.parse(Module.ccall('ct_ui_state', 'string', [], []));
  tool = state.currentTool;
  value = tool;
  document.querySelectorAll('[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.tool) === value)));
  document.getElementById('buildbtn').setAttribute('aria-pressed', String(value > 0));
}
function changeZoom(value) {
  zoom.value = String(Math.min(3, Math.max(0.5, value)));
  document.getElementById('zoomvalue').textContent = Math.round(Number(zoom.value) * 100) + '%';
  localStorage.setItem('ct-zoom', zoom.value);
  Module.ccall('ct_set_zoom', null, ['number'], [Number(zoom.value)]);
}
function saveTower() {
  if (!playing) return Promise.resolve(false);
  if (saving) return saving;
  if (JSON.parse(Module.ccall('ct_ui_state', 'string', [], [])).saveBlocked) {
    saveState.textContent = 'Saving blocked — export a backup';
    return Promise.resolve(false);
  }
  saveState.textContent = 'Saving…';
  if (!Module.ccall('ct_save', 'number', [], [])) {
    saveState.textContent = 'Save failed — export a backup';
    return Promise.resolve(false);
  }
  saving = new Promise(resolve => FS.syncfs(false, error => {
    saving = false;
    saveState.textContent = 'Saved in this browser';
    if (error) saveState.textContent = 'Save failed — export a backup';
    resolve(!error);
  }));
  return saving;
}
function ctStartShell() {
  playing = true;
  if (!Module.ccall('ct_set_style', 'number', ['number'], [Number(style.value)])) {
    ctAlert('Style unavailable', 'The selected graphics could not be loaded.');
    style.value = String(JSON.parse(Module.ccall('ct_ui_state', 'string', [], [])).style);
  }
  changeZoom(Number(zoom.value));
  Module.ccall('ct_set_ui_scale', null, ['number'], [Number(uiScale.value)]);
  resizeWorld();
  selectTool(-3);
  saveTower();
}
document.getElementById('category').onchange = () => {
  const select = document.getElementById('building');
  select.replaceChildren(...buildings[document.getElementById('category').value].map(([id, name]) => new Option(name, id)));
  if (playing && tool > 0) selectTool(Number(select.value));
};
document.getElementById('category').onchange();
document.getElementById('building').onchange = event => selectTool(Number(event.target.value));
document.getElementById('buildbtn').onclick = () => selectTool(Number(document.getElementById('building').value));
document.querySelectorAll('[data-tool]').forEach(button => { button.onclick = () => selectTool(Number(button.dataset.tool)); });
document.getElementById('speed').onchange = event => Module.ccall('ct_control', null, ['number'], [Number(event.target.value)]);
document.getElementById('savebtn').onclick = saveTower;
document.getElementById('menubtn').onclick = () => Module.ccall('ct_menu', null, ['number'], [0]);
document.getElementById('openmenubtn').onclick = () => {
  settings.close();
  Module.ccall('ct_menu', null, ['number'], [Number(document.getElementById('gamemenu').value)]);
};
document.getElementById('settingsbtn').onclick = () => settings.showModal();
style.onchange = () => {
  localStorage.setItem('ct-style', style.value);
  if (!Module.ccall('ct_set_style', 'number', ['number'], [Number(style.value)])) {
    ctAlert('Style unavailable', 'The selected graphics could not be loaded.');
    style.value = String(JSON.parse(Module.ccall('ct_ui_state', 'string', [], [])).style);
  }
};
zoom.oninput = () => changeZoom(Number(zoom.value));
uiScale.oninput = () => {
  localStorage.setItem('ct-uiscale', uiScale.value);
  document.documentElement.style.setProperty('--ui', uiScale.value);
  Module.ccall('ct_set_ui_scale', null, ['number'], [Number(uiScale.value)]);
};
document.getElementById('exportbtn').onclick = async () => { if (await saveTower()) exportSlot(currentSlot); };
document.getElementById('exporttdtbtn').onclick = async () => { if (await saveTower()) exportSlotTdt(currentSlot); };
document.getElementById('loadbtn').onclick = async () => { if (await saveTower()) { sessionStorage.setItem('ct-pick-tower', '1'); location.reload(); } };
document.getElementById('fsbtn').onclick = async () => {
  if (document.fullscreenElement) { await document.exitFullscreen(); return; }
  if (document.documentElement.requestFullscreen) { await document.documentElement.requestFullscreen(); return; }
  document.getElementById('installbtn').click();
};
for (const eventName of ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend']) {
  canvas.addEventListener(eventName, event => {
    if (!event.isTrusted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, {capture: true, passive: false});
}
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, {x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY});
  if (pointers.size === 1) { gesture = false; pinching = false; }
  if (pointers.size === 2) {
    gesture = true;
    pinching = true;
    const [a, b] = [...pointers.values()];
    pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
  }
});
canvas.addEventListener('pointermove', event => {
  const previous = pointers.get(event.pointerId);
  if (!previous) return;
  const dx = event.clientX - previous.x;
  const dy = event.clientY - previous.y;
  previous.x = event.clientX;
  previous.y = event.clientY;
  if (pointers.size === 2) {
    if (JSON.parse(Module.ccall('ct_ui_state', 'string', [], [])).modal) return;
    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDistance > 0) changeZoom(Number(zoom.value) * distance / pinchDistance);
    pinchDistance = distance;
  } else {
    if (Math.hypot(previous.x - previous.startX, previous.y - previous.startY) > 8) gesture = true;
    if (gesture && tool <= 0 && !JSON.parse(Module.ccall('ct_ui_state', 'string', [], [])).modal) Module.ccall('ct_pan', null, ['number', 'number'], [dx, dy]);
  }
});
canvas.addEventListener('pointerup', event => {
  if (!pointers.has(event.pointerId)) return;
  const start = pointers.get(event.pointerId);
  pointers.delete(event.pointerId);
  if (pinching) return;
  const modal = JSON.parse(Module.ccall('ct_ui_state', 'string', [], [])).modal;
  if (!modal && tool === -3) return;
  if (!modal && gesture && tool <= 0) return;
  canvas.dispatchEvent(new MouseEvent('mousemove', {bubbles: true, clientX: start.startX, clientY: start.startY}));
  canvas.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, clientX: start.startX, clientY: start.startY, button: 0, buttons: 1}));
  canvas.dispatchEvent(new MouseEvent('mousemove', {bubbles: true, clientX: event.clientX, clientY: event.clientY, buttons: 1}));
  canvas.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, clientX: event.clientX, clientY: event.clientY, button: 0}));
});
canvas.addEventListener('pointercancel', event => { pointers.delete(event.pointerId); pinching = true; });
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  if (JSON.parse(Module.ccall('ct_ui_state', 'string', [], [])).modal) return;
  changeZoom(Number(zoom.value) * Math.exp(-event.deltaY * 0.001));
}, {passive: false});
setInterval(() => {
  if (!playing) return;
  const state = JSON.parse(Module.ccall('ct_ui_state', 'string', [], []));
  tool = state.currentTool;
  if (state.paused) document.getElementById('speed').value = '0';
  else if (document.getElementById('speed').value === '0') document.getElementById('speed').value = '1';
  document.querySelectorAll('[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.tool) === tool)));
  document.getElementById('buildbtn').setAttribute('aria-pressed', String(tool > 0));
  document.getElementById('towerstats').textContent = fmtMoney(state.money) + ' · ' + starsTxt(state.stars) + ' · ' + state.population + ' people · Day ' + state.day + ' ' + String(state.hour).padStart(2, '0') + ':' + String(state.minute).padStart(2, '0');
  if (state.saveBlocked) saveState.textContent = 'Saving blocked — export a backup';
}, 1000);
setInterval(saveTower, 30000);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveTower(); });
window.addEventListener('pagehide', saveTower);
document.addEventListener('keydown', event => {
  if (!playing) return;
  if (event.key === 'F5' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's')) {
    event.preventDefault(); event.stopImmediatePropagation(); saveTower();
  }
}, true);
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
document.getElementById('installbtn').onclick = async () => {
  const help = document.getElementById('installhelp');
  if (installPrompt) { await installPrompt.prompt(); installPrompt = null; return; }
  help.hidden = false;
  help.textContent = 'Use your browser menu to install Tower.';
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    help.textContent = 'In Safari, open Share → Add to Home Screen, keep Open as Web App on, then tap Add. Launch Tower from its Home Screen icon.';
  }
  if (matchMedia('(display-mode: standalone)').matches) help.textContent = 'Tower is running as an installed app.';
};
modalEl.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); modalClose(null); }
  if (event.key === 'Tab') {
    const controls = [...modalEl.querySelectorAll('input,button')].filter(control => control.offsetParent !== null && !control.disabled);
    let index = controls.indexOf(document.activeElement) + 1;
    if (event.shiftKey) index -= 2;
    event.preventDefault();
    controls[(index + controls.length) % controls.length].focus();
  }
});
for (const dialog of [settings, modalEl]) {
  for (const type of ['keydown', 'keyup']) dialog.addEventListener(type, event => event.stopPropagation());
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(error => console.warn('Offline setup failed', error));
