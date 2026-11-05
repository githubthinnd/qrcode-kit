/* global Event, HTMLSelectElement, MutationObserver */
// Replaces the browser's own drop-down list with a styled, keyboard-accessible one. The native
// <select> stays in the DOM (visually hidden) as the single source of truth, so reading `.value`,
// setting it from code, `change` events and form behaviour all keep working.

let uid = 0;

export function enhanceSelect(select) {
  if (select.dataset.enhanced === 'true') return;
  select.dataset.enhanced = 'true';
  const id = select.id || `sel-${String(++uid)}`;

  const root = document.createElement('div');
  root.className = 'sel';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sel-btn';
  button.id = `${id}-btn`;
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const text = document.createElement('span');
  text.className = 'sel-text';
  button.append(text);
  const menu = document.createElement('ul');
  menu.className = 'sel-menu';
  menu.id = `${id}-list`;
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  button.setAttribute('aria-controls', menu.id);

  select.before(root);
  root.append(button, menu, select);
  select.classList.add('sel-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  for (const label of document.querySelectorAll(`label[for="${id}"]`)) label.htmlFor = button.id;
  const aria = select.getAttribute('aria-label');
  if (aria !== null) button.setAttribute('aria-label', aria);

  let active = -1;
  const items = () => [...menu.children];

  const refresh = () => {
    const selected = select.options[select.selectedIndex];
    text.textContent = selected?.textContent ?? '';
    button.disabled = select.disabled;
    root.classList.toggle('disabled', select.disabled);
  };
  const build = () => {
    menu.replaceChildren();
    for (const option of select.options) {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.dataset.value = option.value;
      li.textContent = option.textContent;
      li.setAttribute('aria-selected', String(option.selected));
      li.setAttribute('aria-disabled', String(option.disabled));
      menu.append(li);
    }
    refresh();
  };

  const close = (focus = false) => {
    menu.hidden = true;
    root.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
    if (focus) button.focus();
  };
  const highlight = (index) => {
    const list = items();
    if (list.length === 0) return;
    active = Math.max(0, Math.min(list.length - 1, index));
    list.forEach((li, i) => li.classList.toggle('active', i === active));
    list[active]?.scrollIntoView({ block: 'nearest' });
  };
  const step = (from, direction) => {
    const list = items();
    for (let i = from + direction; i >= 0 && i < list.length; i += direction) {
      if (list[i].getAttribute('aria-disabled') !== 'true') return i;
    }
    return from;
  };
  const open = () => {
    if (select.disabled) return;
    build();
    menu.hidden = false;
    root.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
    const room = window.innerHeight - button.getBoundingClientRect().bottom;
    root.classList.toggle('up', room < 260 && button.getBoundingClientRect().top > room);
    highlight(select.selectedIndex);
  };
  const choose = (index) => {
    const option = select.options[index];
    if (option === undefined || option.disabled) return;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index;
    refresh();
    close(true);
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
  };

  button.addEventListener('click', () => {
    if (menu.hidden) open();
    else close();
  });
  menu.addEventListener('click', (event) => {
    const li = event.target.closest('li');
    if (li !== null) choose(items().indexOf(li));
  });
  menu.addEventListener('pointermove', (event) => {
    const li = event.target.closest('li');
    if (li !== null && li.getAttribute('aria-disabled') !== 'true') highlight(items().indexOf(li));
  });
  button.addEventListener('keydown', (event) => {
    const isOpen = !menu.hidden;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (!isOpen) open();
        else highlight(step(active, event.key === 'ArrowDown' ? 1 : -1));
        break;
      case 'Home':
      case 'End':
        if (isOpen) {
          event.preventDefault();
          highlight(
            step(event.key === 'Home' ? -1 : items().length, event.key === 'Home' ? 1 : -1),
          );
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (isOpen) choose(active);
        else open();
        break;
      case 'Escape':
        if (isOpen) {
          event.preventDefault();
          close(true);
        }
        break;
      case 'Tab':
        if (isOpen) close();
        break;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
          if (menu.hidden) open();
          const needle = event.key.toLowerCase();
          const list = items();
          for (let n = 1; n <= list.length; n++) {
            const i = (active + n) % list.length;
            if (
              list[i].textContent.trim().toLowerCase().startsWith(needle) &&
              list[i].getAttribute('aria-disabled') !== 'true'
            ) {
              highlight(i);
              break;
            }
          }
        }
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menu.hidden && !root.contains(event.target)) close();
  });
  document.addEventListener(
    'scroll',
    () => {
      if (!menu.hidden) close();
    },
    true,
  );

  // keep the label in step with programmatic changes
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(select, 'value', {
    get() {
      return descriptor.get.call(this);
    },
    set(value) {
      descriptor.set.call(this, value);
      refresh();
    },
  });
  new MutationObserver(build).observe(select, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled'],
  });
  build();
}

export function enhanceAllSelects(scope = document) {
  for (const select of scope.querySelectorAll('select')) enhanceSelect(select);
}
