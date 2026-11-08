const settings = document.getElementById('settings');
const style = document.getElementById('style');
const zoom = document.getElementById('zoom');
const uiScale = document.getElementById('uiscale');
const saveState = document.getElementById('savestate');
const world = document.getElementById('world');
const canvas = document.getElementById('canvas');
const catalog = document.getElementById('catalog');
const gameMenus = document.getElementById('gamemenus');
const panels = document.getElementById('panels');
const styleNames = ['schematic', 'modern-pixel', 'warm-dollhouse', 'miniature-3d'];
let playing = false;
let saving = false;
let tool = -3;
let installPrompt = null;
let panelState;
let panelSignature = '';
let topPanel;
let placement = null;
let placing = false;
let panning = false;
let shaftEditing = false;
let gesture = false;
let pinching = false;
let pinchDistance = 0;
const pointers = new Map();
for (const control of [style, zoom, uiScale]) {
  const stored = localStorage.getItem('ct-' + control.id);
  if (stored !== null) control.value = stored;
}
document.documentElement.style.setProperty('--ui', uiScale.value);
function selectTool(value) {
  Module.ccall('ct_ui_action', 'number', ['string', 'number', 'string'], ['build-loop', 0, '']);
  placement = null;
  placing = false;
  panning = false;
  shaftEditing = false;
  document.getElementById('shaftbtn').setAttribute('aria-pressed', 'false');
  document.getElementById('toolhint').hidden = false;
  document.getElementById('buildimage').hidden = true;
  document.getElementById('buildlabel').textContent = '＋ Build';
  document.getElementById('placement').hidden = true;
  Module.ccall('ct_world_command', 'number', ['string', 'number', 'number', 'number', 'number'], ['preview-clear', 0, 0, 0, 0]);
  Module.ccall('ct_tool', null, ['number'], [value]);
  tool = JSON.parse(Module.ccall('ct_ui_state', 'string', [], [])).currentTool;
  document.querySelectorAll('[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.tool) === tool)));
  document.getElementById('buildbtn').setAttribute('aria-pressed', String(tool > 0));
  if (tool > 0) {
    placing = true;
    document.getElementById('toolhint').hidden = true;
    document.getElementById('buildimage').hidden = false;
    document.getElementById('buildimage').src = 'art/catalog/' + styleNames[Number(style.value)] + '/' + tool + '.png';
    document.getElementById('placement').hidden = false;
    document.getElementById('placementname').textContent = panelState.catalog.find(item => item.id === tool).label;
    document.getElementById('buildlabel').textContent = document.getElementById('placementname').textContent;
    document.getElementById('placementhint').textContent = 'Tap or drag to plan · Pan moves the view';
    document.getElementById('placebtn').disabled = true;
  }
  document.getElementById('toolhint').textContent = 'Tap a room to use it; drag to explore';
  if (tool === -3) document.getElementById('toolhint').textContent = 'Drag to explore · pinch or scroll to zoom';
  if (tool === -2) document.getElementById('toolhint').textContent = 'Tap a room or elevator to inspect';
  if (tool === -1) document.getElementById('toolhint').textContent = 'Tap a room to remove it';
  if (tool > 0) document.getElementById('toolhint').textContent = 'Tap to build · drag for a row or shaft';
}
function changeZoom(value, x = canvas.getBoundingClientRect().left + canvas.clientWidth / 2, y = canvas.getBoundingClientRect().top + canvas.clientHeight / 2) {
  zoom.value = String(Math.min(3, Math.max(0.5, value)));
  document.getElementById('zoomvalue').textContent = Math.round(Number(zoom.value) * 100) + '%';
  localStorage.setItem('ct-zoom', zoom.value);
  ctView.zoom(Number(zoom.value), x, y);
}
new ResizeObserver(() => { if (playing) ctView.resize(); }).observe(world);
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
  ctView.start();
  ctView.resize();
  changeZoom(Number(zoom.value));
  selectTool(-2);
  refreshPanels();
  saveTower();
}
async function uiAction(action, value, text) {
  if (action === 'quit' && value === 0) {
    if (!await saveTower()) return;
    value = 1;
  }
  const handled = Module.ccall('ct_ui_action', 'number', ['string', 'number', 'string'], [action, value, text]);
  if (handled && action === 'quit' && value < 2) {
    playing = false;
    await new Promise(resolve => FS.syncfs(false, resolve));
    sessionStorage.setItem('ct-pick-tower', '1');
    location.reload();
    return;
  }
  refreshPanels();
  const currentTool = JSON.parse(Module.ccall('ct_ui_state', 'string', [], [])).currentTool;
  if (currentTool !== tool) selectTool(currentTool);
}
function renderCatalog() {
  const search = document.getElementById('catalogsearch').value.toLowerCase();
  document.getElementById('catalogitems').replaceChildren(...panelState.catalog.filter(item => item.label.toLowerCase().includes(search)).map(item => {
    const button = document.createElement('button');
    button.className = 'buildingcard';
    button.setAttribute('aria-pressed', String(item.id === tool));
    button.disabled = !item.enabled;
    const image = document.createElement('img');
    image.src = 'art/catalog/' + styleNames[Number(style.value)] + '/' + item.id + '.png';
    image.alt = '';
    image.loading = 'lazy';
    const title = document.createElement('strong');
    title.textContent = item.label;
    const detail = document.createElement('span');
    detail.textContent = fmtMoney(item.cost) + ' · ' + item.width + ' × ' + item.height;
    const lock = document.createElement('small');
    lock.textContent = starsTxt(item.stars);
    if (!item.enabled) lock.textContent += ' required';
    button.append(image, title, detail, lock);
    button.onclick = () => {
      selectTool(item.id);
      if (tool !== item.id) { renderCatalog(); return; }
      catalog.close();
      canvas.focus();
    };
    return button;
  }));
}
function refreshPanels() {
  panelState = JSON.parse(Module.ccall('ct_panel_state', 'string', [], []));
  if (modalState) return;
  const signature = JSON.stringify([panelState.panels, panelState.history]);
  const mapPanel = panelState.panels.length > 0 && panelState.panels[panelState.panels.length - 1].kind === 'map';
  const mapView = document.getElementById('minimapview');
  if (!mapPanel) document.getElementById('minimap').append(mapView);
  if (document.getElementById('minimap').open || mapPanel) {
    const snapshot = JSON.parse(Module.ccall('ct_world_state', 'string', [], []));
    const low = Math.min(-72, ...snapshot.floors.map(floor => (floor.floor - 1) * 36), ...snapshot.rooms.map(room => (room.floor - 1) * 36), ...snapshot.shafts.map(shaft => (shaft.lo - 1) * 36));
    const high = Math.max(180, ...snapshot.floors.map(floor => floor.floor * 36), ...snapshot.rooms.map(room => (room.floor + room.height - 1) * 36), ...snapshot.shafts.map(shaft => shaft.hi * 36));
    const left = Math.min(snapshot.bounds.width * 4 - 80, ...snapshot.floors.map(floor => floor.start * 8), ...snapshot.rooms.map(room => room.x * 8), ...snapshot.shafts.map(shaft => shaft.x * 8)) - 16;
    const right = Math.max(snapshot.bounds.width * 4 + 80, ...snapshot.floors.map(floor => floor.end * 8), ...snapshot.rooms.map(room => (room.x + room.width) * 8), ...snapshot.shafts.map(shaft => (shaft.x + shaft.width) * 8)) + 16;
    const width = right - left;
    const button = mapView.firstElementChild;
    const svg = button.firstElementChild;
    svg.replaceChildren();
    svg.setAttribute('viewBox', left + ' ' + -high + ' ' + width + ' ' + (high - low));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('aria-hidden', 'true');
    for (const floor of snapshot.floors) {
      const rect = document.createElementNS(svg.namespaceURI, 'rect');
      rect.setAttribute('x', floor.start * 8);
      rect.setAttribute('y', -floor.floor * 36);
      rect.setAttribute('width', (floor.end - floor.start) * 8);
      rect.setAttribute('height', '36');
      rect.setAttribute('fill', '#49605f');
      svg.append(rect);
    }
    for (const room of snapshot.rooms) {
      const rect = document.createElementNS(svg.namespaceURI, 'rect');
      rect.setAttribute('x', room.x * 8);
      rect.setAttribute('y', -(room.floor + room.height - 1) * 36);
      rect.setAttribute('width', room.width * 8);
      rect.setAttribute('height', room.height * 36);
      rect.setAttribute('fill', 'hsl(' + room.type * 37 % 360 + ' 40% 65%)');
      svg.append(rect);
    }
    for (const shaft of snapshot.shafts) {
      const rect = document.createElementNS(svg.namespaceURI, 'rect');
      rect.setAttribute('x', shaft.x * 8);
      rect.setAttribute('y', -shaft.hi * 36);
      rect.setAttribute('width', shaft.width * 8);
      rect.setAttribute('height', (shaft.hi - shaft.lo + 1) * 36);
      rect.setAttribute('fill', '#142b30');
      rect.setAttribute('stroke', '#8acdb9');
      rect.setAttribute('stroke-width', '1');
      rect.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(rect);
    }
    for (const cabin of snapshot.cabins) {
      const rect = document.createElementNS(svg.namespaceURI, 'rect');
      rect.setAttribute('x', cabin.x);
      rect.setAttribute('y', -cabin.y - cabin.height);
      rect.setAttribute('width', cabin.width);
      rect.setAttribute('height', cabin.height);
      rect.setAttribute('fill', '#f0ebdf');
      if (cabin.occupancy > 0) rect.setAttribute('fill', '#e8bd78');
      rect.setAttribute('stroke', '#f0ebdf');
      rect.setAttribute('stroke-width', '2');
      rect.setAttribute('vector-effect', 'non-scaling-stroke');
      const title = document.createElementNS(svg.namespaceURI, 'title');
      title.textContent = cabin.occupancy + '/' + cabin.capacity + ' passengers';
      rect.append(title);
      svg.append(rect);
    }
    const ground = document.createElementNS(svg.namespaceURI, 'path');
    ground.setAttribute('d', 'M' + left + ',36 H' + right);
    ground.setAttribute('stroke', '#c7d5cc');
    ground.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(ground);
    const viewport = document.createElementNS(svg.namespaceURI, 'rect');
    const viewX = Math.max(left, snapshot.camera.x - canvas.clientWidth / snapshot.camera.zoom / 2);
    const viewY = Math.max(-high, -snapshot.camera.y - canvas.clientHeight / snapshot.camera.zoom / 2);
    viewport.setAttribute('x', viewX);
    viewport.setAttribute('y', viewY);
    viewport.setAttribute('width', Math.max(0, Math.min(right, snapshot.camera.x + canvas.clientWidth / snapshot.camera.zoom / 2) - viewX));
    viewport.setAttribute('height', Math.max(0, Math.min(-low, -snapshot.camera.y + canvas.clientHeight / snapshot.camera.zoom / 2) - viewY));
    viewport.setAttribute('fill', 'none');
    viewport.setAttribute('stroke', '#a6bbec');
    viewport.setAttribute('stroke-dasharray', '4 2');
    viewport.setAttribute('stroke-width', '2');
    viewport.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(viewport);
    button.onpointerdown = event => {
      button.focus();
      button.setPointerCapture(event.pointerId);
      button.onclick(event);
    };
    button.onpointermove = event => { if (event.buttons === 1) button.onclick(event); };
    button.onclick = event => {
      let x = (left + right) / 2;
      let y = (high + low) / 2;
      if (event.detail > 0 || event.type !== 'click') {
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
        x = point.x;
        y = -point.y;
      }
      const camera = JSON.parse(Module.ccall('ct_world_state', 'string', [], [])).camera;
      ctView.pan((camera.x - x) * camera.zoom, (y - camera.y) * camera.zoom);
      if (mapPanel && event.type === 'click') uiAction('close', 0, 'map');
    };
  }
  if (signature === panelSignature) return;
  if (panels.contains(document.activeElement) && document.activeElement.matches('input')) return;
  panelSignature = signature;
  if (!panelState.panels.length) { panels.close(); topPanel = null; return; }
  topPanel = panelState.panels[panelState.panels.length - 1];
  document.getElementById('paneltitle').textContent = topPanel.title;
  document.getElementById('panelclose').hidden = !topPanel.dismissible;
  const content = document.getElementById('panelcontent');
  const focusedAction = document.activeElement.dataset.action;
  const focusedValue = document.activeElement.dataset.value;
  content.replaceChildren();
  if (mapPanel) content.append(mapView);
  if (topPanel.kind === 'analytics') {
    const series = panelState.history;
    if (!series.length) {
      const empty = document.createElement('p');
      empty.textContent = 'History appears after the first recorded quarter.';
      content.append(empty);
    }
    for (const [key, label] of [['population', 'Population'], ['balance', 'Balance ($)'], ['avgWait', 'Average wait']]) {
      if (!series.length) continue;
      const figure = document.createElement('figure');
      figure.className = 'historychart';
      const caption = document.createElement('figcaption');
      caption.textContent = label + ' · ' + series[series.length - 1][key];
      const values = series.map(sample => sample[key]);
      const low = Math.min(0, ...values);
      const high = Math.max(1, ...values);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 460 140');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', label + ' history, ' + series.length + ' samples, range ' + low + ' to ' + high);
      const line = document.createElementNS(svg.namespaceURI, 'polyline');
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', 'currentColor');
      line.setAttribute('stroke-width', '2');
      const points = values.map((value, index) => [12 + index * 436 / Math.max(1, values.length - 1), 128 - (value - low) * 116 / (high - low)]);
      line.setAttribute('points', points.map(point => point.join(',')).join(' '));
      const dot = document.createElementNS(svg.namespaceURI, 'circle');
      dot.setAttribute('cx', points[points.length - 1][0]);
      dot.setAttribute('cy', points[points.length - 1][1]);
      dot.setAttribute('r', '3');
      dot.setAttribute('fill', 'currentColor');
      svg.append(line, dot);
      for (const [x, text] of [[12, 'Day ' + series[0].day], [348, 'Day ' + series[series.length - 1].day]]) {
        const axis = document.createElementNS(svg.namespaceURI, 'text');
        axis.setAttribute('x', x);
        axis.setAttribute('y', '139');
        axis.textContent = text;
        svg.append(axis);
      }
      figure.append(caption, svg);
      content.append(figure);
    }
    const scroll = document.createElement('div');
    scroll.className = 'historytable';
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', 'History data');
    const table = document.createElement('table');
    const caption = table.createCaption();
    caption.textContent = 'Tower history';
    const header = table.createTHead().insertRow();
    const columns = [['day', 'Day'], ['quarter', 'Quarter'], ['population', 'Population'], ['commuters', 'Commuters'], ['avgWait', 'Average wait'], ['balance', 'Balance'], ['income', 'Income'], ['expenses', 'Expenses'], ['built', 'Built value'], ['lost', 'Lost value']];
    for (const [key, label] of columns) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      header.append(th);
    }
    const body = table.createTBody();
    for (const sample of series) {
      const row = body.insertRow();
      for (const [key] of columns) {
        let value = sample[key];
        if (key === 'quarter') value++;
        row.insertCell().textContent = value;
      }
    }
    scroll.append(table);
    content.append(scroll);
  } else {
    for (const line of topPanel.lines) {
      const p = document.createElement('p');
      p.textContent = line;
      content.append(p);
    }
  }
  for (const field of topPanel.fields) {
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = document.createElement('input');
    input.type = 'number';
    if ('text' in field) {
      input.type = 'text';
      input.value = field.text;
      input.maxLength = field.maxLength;
    } else {
      input.value = field.value;
      input.min = field.min;
      input.max = field.max;
      input.step = field.step;
      input.disabled = field.disabled;
    }
    input.onchange = () => {
      if (!input.reportValidity()) return;
      if ('text' in field) uiAction(field.action, 0, input.value);
      else uiAction(field.action, Number(input.value), '');
    };
    label.append(input);
    content.append(label);
  }
  const actions = document.createElement('div');
  actions.className = 'panelactions';
  for (const action of topPanel.actions) {
    const button = document.createElement('button');
    button.textContent = action.label;
    button.dataset.action = action.action;
    button.dataset.value = action.value;
    button.disabled = action.disabled;
    button.onclick = () => uiAction(action.action, action.value, '');
    actions.append(button);
  }
  content.append(actions);
  for (const button of actions.children) {
    if (button.dataset.action === focusedAction && button.dataset.value === focusedValue) button.focus();
  }
  catalog.close();
  document.getElementById('tools').close();
  gameMenus.close();
  settings.close();
  if (!panels.open) panels.showModal();
}
document.getElementById('panelclose').onclick = () => uiAction('close', 0, topPanel.kind);
panels.addEventListener('cancel', event => {
  event.preventDefault();
  if (topPanel.dismissible) uiAction('close', 0, topPanel.kind);
});
document.getElementById('placebtn').onclick = () => {
  const [action, floor, cell, endFloor, endCell] = placement;
  const result = Module.ccall('ct_world_command', 'number', ['string', 'number', 'number', 'number', 'number'], [action, floor, cell, endFloor, endCell]);
  const ghost = JSON.parse(Module.ccall('ct_world_state', 'string', [], [])).ghost;
  document.getElementById('placementhint').textContent = ghost.reason;
  document.getElementById('placebtn').disabled = true;
  if (result) {
    document.getElementById('placementhint').textContent = 'Built · tap or drag to plan another';
    placement = null;
    Module.ccall('ct_world_command', 'number', ['string', 'number', 'number', 'number', 'number'], ['preview-clear', 0, 0, 0, 0]);
  }
  refreshPanels();
};
document.getElementById('cancelplacebtn').onclick = () => selectTool(-3);
document.getElementById('shaftbtn').onclick = () => {
  document.getElementById('tools').close();
  selectTool(0);
  shaftEditing = true;
  document.getElementById('shaftbtn').setAttribute('aria-pressed', 'true');
  document.querySelector('[data-tool="0"]').setAttribute('aria-pressed', 'false');
  document.getElementById('toolhint').textContent = 'Drag a shaft cap up or down to adjust its span';
};
document.getElementById('catalogsearch').oninput = renderCatalog;
document.getElementById('buildbtn').onclick = () => { refreshPanels(); renderCatalog(); catalog.showModal(); };
document.getElementById('toolsbtn').onclick = () => document.getElementById('tools').showModal();
document.querySelectorAll('[data-tool]').forEach(button => { button.onclick = () => {
  document.getElementById('tools').close();
  if (placing && Number(button.dataset.tool) === -3) {
    panning = !panning;
    button.setAttribute('aria-pressed', String(panning));
    canvas.focus();
    return;
  }
  selectTool(Number(button.dataset.tool));
  canvas.focus();
}; });
document.getElementById('quickspeed').onclick = () => {
  const speed = document.getElementById('speed');
  speed.value = String((Number(speed.value) + 1) % 3);
  speed.dispatchEvent(new Event('change'));
};
document.getElementById('speed').onchange = event => Module.ccall('ct_control', null, ['number'], [Number(event.target.value)]);
document.getElementById('savebtn').onclick = saveTower;
document.getElementById('menubtn').onclick = () => {
  refreshPanels();
  document.getElementById('menuitems').replaceChildren(...panelState.menus.map(menu => {
    const section = document.createElement('section');
    const title = document.createElement('h3');
    title.textContent = menu.label;
    section.append(title);
    for (const item of menu.items) {
      const button = document.createElement('button');
      button.textContent = item.label;
      button.disabled = !item.enabled;
      let checked = item.checked;
      if (item.shell === 'toolbar') checked = !document.getElementById('toolbar').hidden;
      if (item.shell === 'infobar') checked = !document.getElementById('towerstats').hidden;
      button.setAttribute('aria-pressed', String(checked));
      button.onclick = async () => {
        gameMenus.close();
        switch (item.shell) {
          case 'new': {
            if (!await saveTower()) return;
            const name = await ctModal({title: 'New tower', body: 'Your current tower is saved. Name your new tower:', input: 'My Tower', validate: nameValidator(null), okLabel: 'Create'});
            if (name === null) return;
            sessionStorage.setItem('ct-new-slot', name);
            location.reload();
            return;
          }
          case 'load': document.getElementById('loadbtn').click(); return;
          case 'save': saveTower(); return;
          case 'export-tdt': document.getElementById('exporttdtbtn').click(); return;
          case 'export-sav': document.getElementById('exportbtn').click(); return;
          case 'toolbar': document.getElementById('toolbar').hidden = !document.getElementById('toolbar').hidden; return;
          case 'infobar': document.getElementById('towerstats').hidden = !document.getElementById('towerstats').hidden; return;
          case 'screenshot': downloadBytes('Tower.png', await ctView.capture()); return;
        }
        uiAction('menu', item.id, '');
      };
      section.append(button);
    }
    return section;
  }));
  gameMenus.showModal();
};
document.getElementById('settingsbtn').onclick = () => settings.showModal();
style.onchange = async () => {
  style.disabled = true;
  await ctView.style(Number(style.value));
  localStorage.setItem('ct-style', style.value);
  style.disabled = false;
  if (placing) document.getElementById('buildimage').src = 'art/catalog/' + styleNames[Number(style.value)] + '/' + tool + '.png';
};
zoom.oninput = () => changeZoom(Number(zoom.value));
uiScale.oninput = () => {
  localStorage.setItem('ct-uiscale', uiScale.value);
  document.documentElement.style.setProperty('--ui', uiScale.value);
};
document.getElementById('mutebtn').onclick = () => {
  ctAudio.muted = !ctAudio.muted;
  localStorage.setItem('ct-muted', String(ctAudio.muted));
  ctAudio.unlock();
};
document.getElementById('volume').oninput = event => ctAudio.volume(Number(event.target.value));
for (const category of ['effects', 'ambient', 'music']) document.getElementById('audio-' + category).onchange = event => ctAudio.category(category, event.target.checked);
document.getElementById('exportbtn').onclick = async () => { if (await saveTower()) exportSlot(currentSlot); };
document.getElementById('exporttdtbtn').onclick = async () => { if (await saveTower()) exportSlotTdt(currentSlot); };
document.getElementById('loadbtn').onclick = async () => { if (await saveTower()) { sessionStorage.setItem('ct-pick-tower', '1'); location.reload(); } };
document.getElementById('fsbtn').onclick = async () => {
  if (document.fullscreenElement) { await document.exitFullscreen(); return; }
  if (document.documentElement.requestFullscreen) { await document.documentElement.requestFullscreen(); return; }
  document.getElementById('installbtn').click();
};
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault();
  ctAudio.unlock();
  canvas.focus();
  canvas.setPointerCapture(event.pointerId);
  const pick = ctView.pick(event.clientX, event.clientY);
  pointers.set(event.pointerId, {x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, pick});
  if (pointers.size === 1) { gesture = false; pinching = false; }
  if (pointers.size === 2) {
    gesture = true;
    pinching = true;
    const [a, b] = [...pointers.values()];
    Module.ccall('ct_ui_action', 'number', ['string', 'number', 'string'], ['build-loop', 0, '']);
    pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
    placement = null;
    document.getElementById('placebtn').disabled = true;
    document.getElementById('placementhint').textContent = 'Tap or drag to plan · Pan moves the view';
    Module.ccall('ct_world_command', 'number', ['string', 'number', 'number', 'number', 'number'], ['preview-clear', 0, 0, 0, 0]);
  }
});
canvas.addEventListener('pointermove', event => {
  const pick = ctView.pick(event.clientX, event.clientY);
  ctView.hover(pick);
  const previous = pointers.get(event.pointerId);
  if (!previous) {
    if (placement) return;
    if (tool > 0 && !panning) Module.ccall('ct_world_command', 'number', ['string', 'number', 'number', 'number', 'number'], ['preview', pick.floor, pick.cell, pick.floor, pick.cell]);
    return;
  }
  const dx = event.clientX - previous.x;
  const dy = event.clientY - previous.y;
  previous.x = event.clientX;
  previous.y = event.clientY;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDistance > 0) changeZoom(Number(zoom.value) * distance / pinchDistance, (a.x + b.x) / 2, (a.y + b.y) / 2);
    pinchDistance = distance;
    ctView.pan(dx / 2, dy / 2);
  } else {
    if (Math.hypot(previous.x - previous.startX, previous.y - previous.startY) > 8) gesture = true;
    if (gesture && (panning || (tool <= 0 && !shaftEditing))) ctView.pan(dx, dy);
    if (tool > 0 && !panning) {
      Module.ccall('ct_world_command', 'number', ['string', 'number', 'number', 'number', 'number'], ['preview', previous.pick.floor, previous.pick.cell, pick.floor, pick.cell]);
      Module.ccall('ct_ui_action', 'number', ['string', 'number', 'string'], ['build-loop', Number(gesture), '']);
    }
  }
});
canvas.addEventListener('pointerup', async event => {
  if (!pointers.has(event.pointerId)) return;
  Module.ccall('ct_ui_action', 'number', ['string', 'number', 'string'], ['build-loop', 0, '']);
  const start = pointers.get(event.pointerId);
  pointers.delete(event.pointerId);
  if (pinching || panning) return;
  if (tool === -3) return;
  if (gesture && tool <= 0 && !shaftEditing) return;
  const pick = ctView.pick(event.clientX, event.clientY);
  if ((tool === 0 || tool === -2) && !shaftEditing && pick.personId > 0) {
    uiAction('person', pick.personId, '');
    return;
  }
  let action = 'activate';
  if (shaftEditing) action = 'shaft-drag';
  if (tool === -2) action = 'inspect';
  if (tool === -1) {
    const yes = await ctConfirm({title: 'Remove from tower?', body: 'Remove the selected room or structure? The tower rules and route checks still apply.', okLabel: 'Remove', danger: true});
    if (!yes) return;
    action = 'delete';
  }
  if (placing) {
    if (!gesture) { pick.floor = start.pick.floor; pick.cell = start.pick.cell; }
    action = 'place';
    if (gesture) action = 'drag';
    placement = [action, start.pick.floor, start.pick.cell, pick.floor, pick.cell];
    Module.ccall('ct_world_command', 'number', ['string', 'number', 'number', 'number', 'number'], ['preview', start.pick.floor, start.pick.cell, pick.floor, pick.cell]);
    const ghost = JSON.parse(Module.ccall('ct_world_state', 'string', [], [])).ghost;
    document.getElementById('placebtn').disabled = !ghost.valid;
    const funds = JSON.parse(Module.ccall('ct_ui_state', 'string', [], [])).money;
    let operation = ' to build';
    if (ghost.operation === 'add-car') operation = ' car to add';
    document.getElementById('placementhint').textContent = fmtMoney(ghost.cost) + ' · ' + ghost.count + operation + ' · ' + ghost.skipped.length + ' skipped · Funds ' + fmtMoney(funds);
    if (ghost.reason) document.getElementById('placementhint').textContent += ' · ' + ghost.reason;
    document.getElementById('placementhint').title = ghost.skipped.map(skip => skip.reason).join('\n');
    ctView.selection(pick);
    return;
  }
  ctView.selection(pick);
  Module.ccall('ct_world_command', 'number', ['string', 'number', 'number', 'number', 'number'], [action, start.pick.floor, start.pick.cell, pick.floor, pick.cell]);
  refreshPanels();
});
canvas.addEventListener('pointercancel', event => {
  Module.ccall('ct_ui_action', 'number', ['string', 'number', 'string'], ['build-loop', 0, '']);
  pointers.delete(event.pointerId);
  pinching = true;
  placement = null;
  document.getElementById('placementhint').textContent = 'Tap or drag to plan · Pan moves the view';
  document.getElementById('placebtn').disabled = true;
  Module.ccall('ct_world_command', 'number', ['string', 'number', 'number', 'number', 'number'], ['preview-clear', 0, 0, 0, 0]);
});
canvas.addEventListener('pointerleave', () => {
  Module.ccall('ct_ui_action', 'number', ['string', 'number', 'string'], ['build-loop', 0, '']);
  ctView.hover(null);
  if (placement) return;
  Module.ccall('ct_world_command', 'number', ['string', 'number', 'number', 'number', 'number'], ['preview-clear', 0, 0, 0, 0]);
});
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  changeZoom(Number(zoom.value) * Math.exp(-event.deltaY * .001), event.clientX, event.clientY);
}, {passive: false});
setInterval(() => {
  if (!playing) return;
  const state = JSON.parse(Module.ccall('ct_ui_state', 'string', [], []));
  if (tool !== state.currentTool) selectTool(state.currentTool);
  document.getElementById('speed').value = String(state.speed);
  document.getElementById('quickspeed').textContent = ['Ⅱ', '▷', '▷▷'][state.speed];
  document.getElementById('quickspeed').setAttribute('aria-label', 'Simulation speed: ' + ['Paused', 'Normal', 'Fast'][state.speed] + '. Tap to change');
  document.getElementById('quickspeed').title = ['Paused', 'Normal speed', 'Fast speed'][state.speed] + ' · tap to change';
  document.getElementById('towerstats').textContent = fmtMoney(state.money) + ' · ' + starsTxt(state.stars) + ' · ' + state.population + ' people · Day ' + (state.day + 1) + ' ' + String(state.hour).padStart(2, '0') + ':' + String(state.minute).padStart(2, '0');
  if (state.saveBlocked) saveState.textContent = 'Saving blocked — export a backup';
  refreshPanels();
  const list = document.getElementById('eventlist');
  const messages = panelState.messages.join('\n');
  if (list.dataset.messages !== messages) {
    list.dataset.messages = messages;
    list.replaceChildren(...panelState.messages.map(message => {
      const item = document.createElement('li');
      item.textContent = message;
      return item;
    }));
    list.scrollTop = list.scrollHeight;
  }
}, 250);
setInterval(saveTower, 30000);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveTower(); });
window.addEventListener('pagehide', saveTower);
document.addEventListener('keydown', event => {
  if (!playing) return;
  if (event.key === 'F5' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's')) {
    event.preventDefault(); event.stopImmediatePropagation(); saveTower(); return;
  }
  if (event.target !== canvas) return;
  const movement = {ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80]};
  if (event.key in movement) { event.preventDefault(); ctView.pan(...movement[event.key]); }
  if (event.key === '+') changeZoom(Number(zoom.value) * 1.1);
  if (event.key === '-') changeZoom(Number(zoom.value) / 1.1);
  if (event.key === 'Escape') selectTool(-3);
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
for (const dialog of [settings, modalEl, catalog, gameMenus, panels, document.getElementById('tools')]) {
  for (const type of ['keydown', 'keyup']) dialog.addEventListener(type, event => event.stopPropagation());
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(error => console.warn('Offline setup failed', error));
