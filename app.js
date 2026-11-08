/**
 * Tasker PWA v2 — Nothing OS to-do stack.
 * Vanilla JS, zero deps, localStorage only.
 */

const STORAGE_KEY = 'tasker.v1';
const DICTS = {
  en: {
    tagline: 'TO-DO STACK', now: 'NOW', complete: 'COMPLETE', undo: 'UNDO',
    add: 'ADD', addPlaceholder: 'Add a task…', stack: 'STACK',
    empty: 'STACK EMPTY', emptyHint: 'Add a task below. One thing at a time.',
    done: 'DONE', clear: 'CLEAR', remove: 'REMOVE', doneEmpty: 'Nothing done yet.',
    allClear: 'ALL CLEAR', allClearSub: 'Nothing left. Well done.',
    export: 'Export Data', import: 'Import Data', exportNote: 'Copied to clipboard',
    importOk: 'Imported', importFail: 'Import failed', menu: 'Menu',
  },
  zh: {
    tagline: '待办任务栈', now: '现在', complete: '完成', undo: '撤销',
    add: '添加', addPlaceholder: '添加一个任务…', stack: '任务栈',
    empty: '任务栈为空', emptyHint: '在下方添加任务。一次只做一件事。',
    done: '已完成', clear: '清空', remove: '移除', doneEmpty: '还没有完成的任务。',
    allClear: '全部完成', allClearSub: '没有了。做得好。',
    export: '导出数据', import: '导入数据', exportNote: '已复制到剪贴板',
    importOk: '已导入', importFail: '导入失败', menu: '菜单',
  },
};

function detectLocale() {
  const saved = localStorage.getItem('tasker.locale');
  if (saved && DICTS[saved]) return saved;
  const nav = (navigator.language || 'en').slice(0, 2);
  return DICTS[nav] ? nav : 'en';
}

let locale = detectLocale();
let t = (k) => DICTS[locale][k] || k;
let state = loadState();
let draft = '';
let menuOpen = false;

const root = document.getElementById('tasker-root');

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const ok = (x) => x && typeof x.id === 'string' && typeof x.text === 'string';
      return {
        tasks: Array.isArray(s.tasks) ? s.tasks.filter(ok) : [],
        done: Array.isArray(s.done) ? s.done.filter(ok) : [],
      };
    }
  } catch (e) {}
  return { tasks: [], done: [] };
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
}
function uid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
function pad(n) { return String(n).padStart(2, '0'); }
function vibrate(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'className') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function updateTitle() {
  const n = state.tasks.length;
  document.title = n > 0 ? `Tasker (${n})` : 'Tasker';
}

function render() {
  updateTitle();
  const top = state.tasks[0];
  const stack = state.tasks.slice(1);
  root.innerHTML = '';

  // Header
  const header = el('header', { className: 'tasker-header' }, [
    el('span', { className: 'tasker-title' }, 'TASKER'),
    el('span', { className: 'tasker-tagline' }, t('tagline')),
    el('span', { className: 'tasker-dot' }),
    el('div', { className: 'tasker-menu-wrap' }, [
      el('button', {
        className: 'tasker-menu-btn', 'aria-label': t('menu'), type: 'button',
        onClick: (e) => { e.stopPropagation(); toggleMenu(e.currentTarget); },
      }, '≡'),
    ]),
  ]);
  root.appendChild(header);

  // NOW section
  const nowSection = el('section', { className: 'tasker-now' });
  nowSection.appendChild(el('div', { className: 'tasker-label' }, t('now')));

  if (top) {
    const card = el('div', { className: 'tasker-now-card entering' });
    card.appendChild(el('span', { className: 'tasker-now-text' }, top.text));
    card.appendChild(el('button', {
      className: 'tasker-btn tasker-btn-red', type: 'button',
      onClick: (e) => completeTop(e.currentTarget),
    }, t('complete')));
    nowSection.appendChild(card);
  } else {
    // Check if we just cleared everything (had done items, now empty stack)
    if (state.done.length > 0) {
      nowSection.appendChild(el('div', { className: 'tasker-all-clear' }, [
        el('div', { className: 'tasker-all-clear-title' }, t('allClear')),
        el('div', { className: 'tasker-all-clear-sub' }, t('allClearSub')),
      ]));
      vibrate([30, 50, 30, 50, 60]);
    } else {
      nowSection.appendChild(el('div', { className: 'tasker-empty' }, [
        el('div', { className: 'tasker-empty-title' }, t('empty')),
        el('div', { className: 'tasker-empty-hint' }, t('emptyHint')),
      ]));
    }
  }

  if (state.done.length > 0) {
    nowSection.appendChild(el('button', {
      className: 'tasker-btn tasker-undo', type: 'button', onClick: undo,
    }, t('undo')));
  }
  root.appendChild(nowSection);

  // STACK section
  if (stack.length > 0) {
    const stackSection = el('section', { className: 'tasker-stack' });
    stackSection.appendChild(el('div', { className: 'tasker-label' }, `${t('stack')} · ${stack.length}`));
    const ul = el('ul', { className: 'tasker-list' });
    stack.forEach((task, i) => {
      ul.appendChild(makeRow(task, i + 2));
    });
    stackSection.appendChild(ul);
    root.appendChild(stackSection);
  }

  // ADD section
  const addSection = el('section', { className: 'tasker-add' });
  const input = el('input', {
    className: 'tasker-input', type: 'text', value: draft,
    placeholder: t('addPlaceholder'), 'aria-label': t('add'),
    autocapitalize: 'sentences', autocomplete: 'off', enterkeyhint: 'done',
  });
  input.addEventListener('input', (e) => { draft = e.target.value; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
  addSection.appendChild(input);
  addSection.appendChild(el('button', {
    className: 'tasker-btn tasker-btn-add', type: 'button', onClick: addTask,
  }, t('add')));
  root.appendChild(addSection);

  // DONE section
  const doneSection = el('section', { className: 'tasker-done' });
  doneSection.appendChild(el('div', { className: 'tasker-label' }, `${t('done')} · ${state.done.length}`));
  if (state.done.length > 0) {
    doneSection.appendChild(el('button', {
      className: 'tasker-btn tasker-clear', type: 'button', onClick: clearDone,
    }, t('clear')));
  } else {
    doneSection.appendChild(el('span', { className: 'tasker-muted' }, t('doneEmpty')));
  }
  root.appendChild(doneSection);
}

function makeRow(task, index) {
  const li = el('li', { className: 'tasker-row' });
  const deleteBg = el('div', { className: 'tasker-row-delete-bg' }, t('remove'));
  li.appendChild(deleteBg);

  const inner = el('div', { className: 'tasker-row-inner' }, [
    el('span', { className: 'tasker-index' }, pad(index)),
    el('span', { className: 'tasker-row-text' }, task.text),
    el('button', {
      className: 'tasker-remove', type: 'button', 'aria-label': t('remove'),
      onClick: () => removeTask(task.id),
    }, '×'),
  ]);
  li.appendChild(inner);

  // Swipe to delete
  let startX = 0, deltaX = 0, dragging = false;
  const onStart = (e) => {
    const touch = e.touches ? e.touches[0] : e;
    startX = touch.clientX;
    dragging = true;
    inner.style.transition = 'none';
  };
  const onMove = (e) => {
    if (!dragging) return;
    const touch = e.touches ? e.touches[0] : e;
    deltaX = Math.min(0, Math.max(-60, touch.clientX - startX));
    inner.style.transform = `translateX(${deltaX}px)`;
    e.preventDefault();
  };
  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    inner.style.transition = 'transform .3s cubic-bezier(.22,1,.36,1)';
    if (deltaX < -35) {
      inner.style.transform = 'translateX(-80px)';
      inner.style.opacity = '0';
      setTimeout(() => removeTask(task.id), 200);
    } else {
      inner.style.transform = '';
      inner.style.opacity = '';
    }
    deltaX = 0;
  };

  const textEl = inner.children[1];
  textEl.addEventListener('touchstart', onStart, { passive: true });
  textEl.addEventListener('touchmove', onMove, { passive: false });
  textEl.addEventListener('touchend', onEnd);

  return li;
}

function commit(next, animateComplete) {
  state = next;
  saveState(state);
  render();
}

function addTask() {
  const text = draft.trim();
  if (!text) return;
  draft = '';
  vibrate(10);
  commit({ tasks: [...state.tasks, { id: uid(), text }], done: state.done });
}

function completeTop(btn) {
  if (!state.tasks.length) return;
  const card = btn.closest('.tasker-now-card');
  if (card) {
    card.classList.add('completing');
    vibrate([40, 30, 80]); // satisfying triple-buzz
    setTimeout(() => {
      commit({ tasks: state.tasks.slice(1), done: [...state.done, state.tasks[0]] });
    }, 320);
  } else {
    commit({ tasks: state.tasks.slice(1), done: [...state.done, state.tasks[0]] });
  }
}

function undo() {
  if (!state.done.length) return;
  const top = state.done[state.done.length - 1];
  commit({ tasks: [top, ...state.tasks], done: state.done.slice(0, -1) });
}

function removeTask(id) {
  commit({ tasks: state.tasks.filter((x) => x.id !== id), done: state.done });
}

function clearDone() {
  commit({ tasks: state.tasks, done: [] });
}

function toggleMenu(btn) {
  if (menuOpen) {
    const existing = root.querySelector('.tasker-menu');
    if (existing) existing.remove();
    menuOpen = false;
    return;
  }
  menuOpen = true;
  const wrap = btn.parentElement;
  const menu = el('div', { className: 'tasker-menu' }, [
    el('button', { className: 'tasker-menu-item', type: 'button', onClick: exportData }, t('export')),
    el('button', { className: 'tasker-menu-item', type: 'button', onClick: importData }, t('import')),
  ]);
  wrap.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('click', closeMenu, { once: true });
  }, 0);
}
function closeMenu() {
  const menu = root.querySelector('.tasker-menu');
  if (menu) menu.remove();
  menuOpen = false;
}

async function exportData() {
  const data = JSON.stringify(state, null, 2);
  try {
    await navigator.clipboard.writeText(data);
    flashNote(t('exportNote'));
  } catch (e) {
    // Fallback: show in prompt
    prompt('Copy this:', data);
  }
  closeMenu();
}

function importData() {
  const raw = prompt('Paste exported JSON:');
  if (!raw) return closeMenu();
  try {
    const s = JSON.parse(raw);
    const ok = (x) => x && typeof x.id === 'string' && typeof x.text === 'string';
    commit({
      tasks: Array.isArray(s.tasks) ? s.tasks.filter(ok) : [],
      done: Array.isArray(s.done) ? s.done.filter(ok) : [],
    });
    flashNote(t('importOk'));
  } catch (e) {
    flashNote(t('importFail'));
  }
  closeMenu();
}

function flashNote(msg) {
  const note = el('div', {
    style: 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#161616;border:1px solid #2A2A2A;color:#F2F2F2;padding:10px 20px;border-radius:8px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;z-index:100;animation:slideDownIn .25s both;',
  }, msg);
  document.body.appendChild(note);
  setTimeout(() => { note.style.opacity = '0'; note.style.transition = 'opacity .3s'; setTimeout(() => note.remove(), 300); }, 2000);
}

// URL param: ?text=... adds a task (for share intent)
(function handleShare() {
  const params = new URLSearchParams(window.location.search);
  const text = params.get('text');
  if (text) {
    state.tasks.push({ id: uid(), text: decodeURIComponent(text) });
    saveState(state);
    history.replaceState({}, '', window.location.pathname);
  }
})();

render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});
