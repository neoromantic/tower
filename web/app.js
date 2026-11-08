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
let placing = false;
let previewValid = false;
let category = 'rooms';
const catalog = document.getElementById('catalog');
const inspector = document.getElementById('inspector');
const styleNames = ['schematic', 'modern-pixel', 'warm-dollhouse', 'miniature-3d'];
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
  tool = JSON.parse(Module.ccall('ct_ui_state', 'string', [], [])).currentTool;
}
function renderCatalog() {
  const state = JSON.parse(Module.ccall('ct_ui_state', 'string', [], []));
  document.querySelectorAll('[data-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === category)));
  document.getElementById('cards').replaceChildren(...buildings[category].map(([id, name]) => {
    const card = document.createElement('button');
    card.className = 'buildcard';
    card.disabled = !state.unlocked.includes(id);
    const image = document.createElement('img');
    image.src = 'art/catalog/' + styleNames[state.style] + '/' + id + '.png';
    image.alt = '';
    const label = document.createElement('span');
    label.textContent = name;
    if (card.disabled) {
      const lock = document.createElement('small');
      lock.textContent = 'Unlock at a higher rating';
      label.append(lock);
    }
    card.append(image, label);
    card.onclick = () => {
      selectTool(id);
      if (tool !== id) { renderCatalog(); return; }
      placing = true;
      previewValid = false;
      document.getElementById('normaltools').hidden = true;
      document.getElementById('placement').hidden = false;
      document.getElementById('placementname').textContent = name;
      document.getElementById('placementhint').textContent = 'Tap or drag to position';
      document.getElementById('placebtn').disabled = true;
      catalog.close();
      preview(world.clientWidth / 2, world.clientHeight / 2, world.clientWidth / 2, world.clientHeight / 2);
    };
    return card;
  }));
}
function cancelPlacement() {
  Module.ccall('ct_cancel_preview', null, [], []);
  placing = false;
  previewValid = false;
  document.getElementById('normaltools').hidden = false;
  document.getElementById('placement').hidden = true;
  selectTool(-3);
}
function preview(x1, y1, x2, y2) {
  previewValid = Boolean(Module.ccall('ct_preview', 'number', ['number', 'number', 'number', 'number'], [x1, y1, x2, y2]));
  document.getElementById('placebtn').disabled = !previewValid;
  document.getElementById('placementhint').textContent = 'Cannot build here — try another spot';
  if (previewValid) document.getElementById('placementhint').textContent = 'Ready to place · drag to adjust';
}

function changeZoom(value, x = world.clientWidth / 2, y = world.clientHeight / 2) {
  zoom.value = String(Math.min(3, Math.max(0.5, value)));
  document.getElementById('zoomvalue').textContent = Math.round(Number(zoom.value) * 100) + '%';
  localStorage.setItem('ct-zoom', zoom.value);
  Module.ccall('ct_set_zoom_at', null, ['number', 'number', 'number'], [Number(zoom.value), x, y]);
  if (placing) {
    Module.ccall('ct_cancel_preview', null, [], []);
    previewValid = false;
    document.getElementById('placebtn').disabled = true;
    document.getElementById('placementhint').textContent = 'Tap or drag to position';
  }
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
  resizeWorld();
  changeZoom(Number(zoom.value));
  Module.ccall('ct_set_ui_scale', null, ['number'], [Number(uiScale.value)]);
  selectTool(-3);
  saveTower();
}
for (const [key, label] of [['structure', 'Structure'], ['rooms', 'Rooms'], ['transport', 'Transport'], ['services', 'Services']]) {
  const button = document.createElement('button');
  button.textContent = label;
  button.dataset.category = key;
  button.onclick = () => { category = key; renderCatalog(); };
  document.getElementById('categories').append(button);
}
document.getElementById('buildbtn').onclick = () => { renderCatalog(); catalog.showModal(); };
document.getElementById('cancelbuild').onclick = cancelPlacement;
document.getElementById('placebtn').onclick = () => {
  if (!previewValid) return;
  if (Module.ccall('ct_place', 'number', [], [])) { cancelPlacement(); return; }
  previewValid = false;
  document.getElementById('placebtn').disabled = true;
  document.getElementById('placementhint').textContent = 'Cannot build here — try another spot';
};
document.getElementById('useobject').onclick = () => {
  inspector.close();
  Module.ccall('ct_use_selected', null, [], []);
};
document.getElementById('deleteobject').onclick = async () => {
  const name = document.getElementById('objectname').textContent;
  inspector.close();
  if (!await ctConfirm({title: 'Delete ' + name + '?', body: 'Remove this object from your tower? This cannot be undone.', okLabel: 'Delete', danger: true})) return;
  if (!Module.ccall('ct_delete_selected', 'number', [], [])) ctAlert('Could not delete', 'This object cannot be removed right now.');
};
document.getElementById('speed').onchange = event => Module.ccall('ct_control', null, ['number'], [Number(event.target.value)]);
document.getElementById('savebtn').onclick = saveTower;
document.getElementById('openmenubtn').onclick = () => {
  settings.close();
  Module.ccall('ct_menu', null, ['number'], [Number(document.getElementById('gamemenu').value)]);
};
document.getElementById('settingsbtn').onclick = () => {
  if (placing) cancelPlacement();
  settings.showModal();
};
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
    if (placing) {
      Module.ccall('ct_cancel_preview', null, [], []);
      previewValid = false;
      document.getElementById('placebtn').disabled = true;
      document.getElementById('placementhint').textContent = 'Tap or drag to position';
    }
  }
});
canvas.addEventListener('pointermove', event => {
  const previous = pointers.get(event.pointerId);
  if (!previous) return;
  const dx = event.clientX - previous.x;
  const dy = event.clientY - previous.y;
  previous.x = event.clientX;
  previous.y = event.clientY;
  if (JSON.parse(Module.ccall('ct_ui_state', 'string', [], [])).modal) return;
  const rect = canvas.getBoundingClientRect();
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const x = (a.x + b.x) / 2 - rect.left;
    const y = (a.y + b.y) / 2 - rect.top;
    Module.ccall('ct_pan', null, ['number', 'number'], [dx / 2, dy / 2]);
    if (pinchDistance > 0) changeZoom(Number(zoom.value) * distance / pinchDistance, x, y);
    pinchDistance = distance;
  } else if (!pinching) {
    if (Math.hypot(previous.x - previous.startX, previous.y - previous.startY) > 8) gesture = true;
    if (placing) preview(previous.startX - rect.left, previous.startY - rect.top, event.clientX - rect.left, event.clientY - rect.top);
    else if (gesture) Module.ccall('ct_pan', null, ['number', 'number'], [dx, dy]);
  }
});
canvas.addEventListener('pointerup', event => {
  if (!pointers.has(event.pointerId)) return;
  const start = pointers.get(event.pointerId);
  pointers.delete(event.pointerId);
  if (pinching) return;
  const state = JSON.parse(Module.ccall('ct_ui_state', 'string', [], []));
  const rect = canvas.getBoundingClientRect();
  if (!state.modal) {
    if (placing) {
      preview(start.startX - rect.left, start.startY - rect.top, event.clientX - rect.left, event.clientY - rect.top);
      return;
    }
    if (gesture) return;
    const object = JSON.parse(Module.ccall('ct_inspect', 'string', ['number', 'number'], [event.clientX - rect.left, event.clientY - rect.top]));
    if (!object.name) return;
    document.getElementById('objectname').textContent = object.name;
    document.getElementById('objectdetails').textContent = object.details;
    document.getElementById('deleteobject').hidden = !object.canDelete;
    document.getElementById('useobject').hidden = !object.canUse;
    inspector.showModal();
    return;
  }
  if (gesture) return;
  canvas.dispatchEvent(new MouseEvent('mousemove', {bubbles: true, clientX: event.clientX, clientY: event.clientY}));
  canvas.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, clientX: event.clientX, clientY: event.clientY, button: 0, buttons: 1}));
  canvas.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, clientX: event.clientX, clientY: event.clientY, button: 0}));
});
canvas.addEventListener('pointercancel', event => {
  pointers.delete(event.pointerId);
  pinching = true;
  if (placing) {
    Module.ccall('ct_cancel_preview', null, [], []);
    previewValid = false;
    document.getElementById('placebtn').disabled = true;
  }
});
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  if (JSON.parse(Module.ccall('ct_ui_state', 'string', [], [])).modal) return;
  const rect = canvas.getBoundingClientRect();
  changeZoom(Number(zoom.value) * Math.exp(-event.deltaY * 0.001), event.clientX - rect.left, event.clientY - rect.top);
}, {passive: false});
setInterval(() => {
  if (!playing) return;
  const state = JSON.parse(Module.ccall('ct_ui_state', 'string', [], []));
  tool = state.currentTool;
  document.getElementById('speed').value = String(state.speed);
  document.getElementById('money').textContent = fmtMoney(state.money);
  document.getElementById('clock').textContent = starsTxt(state.stars) + ' · ' + state.population + ' people · Day ' + (state.day + 1) + ' ' + String(state.hour).padStart(2, '0') + ':' + String(state.minute).padStart(2, '0');
  if (state.saveBlocked) saveState.textContent = 'Saving blocked — export a backup';
}, 100);
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
for (const dialog of [settings, catalog, inspector, modalEl]) {
  for (const type of ['keydown', 'keyup']) dialog.addEventListener(type, event => event.stopPropagation());
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(error => console.warn('Offline setup failed', error));
