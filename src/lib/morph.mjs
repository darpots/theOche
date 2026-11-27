// Patch a live element to match new HTML, touching only what changed.
//
// Live pages redraw on every update (every dart, on the match page). Writing
// innerHTML each time rebuilds every node: images are recreated, CSS animations
// restart, hover and open states are lost, and the page flickers. patch() walks
// the old and new trees side by side and changes only the text, attributes and
// elements that differ, so a score change updates the score and nothing else.
//
// Elements are matched by tag and by key (data-id, else id), so a row that moves
// is moved, not rebuilt. Classes that scripts add after rendering (fade-ins,
// followed players) are kept, and so is a <details> the reader has opened.

const KEEP_CLASSES = ['in', 'fav', 'stats-in', 'go', 'ready'];
const keyOf = n => (n.nodeType === 1 ? n.getAttribute('data-id') || n.id || null : null);
const sameKind = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName && keyOf(a) === keyOf(b);

function syncAttributes(from, to) {
  for (const { name, value } of [...to.attributes]) {
    if (name === 'class') {
      const keep = KEEP_CLASSES.filter(c => from.classList.contains(c) && !to.classList.contains(c));
      const next = keep.length ? `${value} ${keep.join(' ')}`.trim() : value;
      if (from.getAttribute('class') !== next) from.setAttribute('class', next);
    } else if (from.getAttribute(name) !== value) from.setAttribute(name, value);
  }
  for (const { name } of [...from.attributes]) {
    if (to.hasAttribute(name)) continue;
    if (name === 'class') { const keep = KEEP_CLASSES.filter(c => from.classList.contains(c)); if (keep.length) { from.setAttribute('class', keep.join(' ')); continue; } }
    if (name === 'open' && from.nodeName === 'DETAILS') continue; // opened by the reader
    from.removeAttribute(name);
  }
}

function morphNode(from, to) {
  if (from.nodeType !== 1) { if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue; return; }
  syncAttributes(from, to);
  morphChildren(from, to);
}

function morphChildren(from, to) {
  let cur = from.firstChild;
  let next = to.firstChild;
  while (next) {
    const after = next.nextSibling;
    if (cur && sameKind(cur, next)) { morphNode(cur, next); cur = cur.nextSibling; }
    else {
      // A keyed element further on (a row that moved up): bring it here and patch it.
      const key = keyOf(next);
      let found = null;
      if (key) for (let c = cur; c; c = c.nextSibling) if (sameKind(c, next)) { found = c; break; }
      if (found) { from.insertBefore(found, cur); morphNode(found, next); }
      else from.insertBefore(next, cur); // new: moved over from the parsed HTML
    }
    next = after;
  }
  while (cur) { const n = cur.nextSibling; cur.remove(); cur = n; }
}

/**
 * Make `el`'s contents match `html`, changing only what differs (it compares
 * with what is on the page, so it is safe after other code has changed it).
 */
export function patch(el, html) {
  if (!el) return;
  const t = document.createElement('template');
  t.innerHTML = html;
  morphChildren(el, t.content);
}

/** Patch one element in place to match the element in `html` (or replace it if it's a different kind). */
export function patchElement(el, html) {
  if (!el) return el;
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  const next = t.content.firstElementChild;
  if (!next) return el;
  if (sameKind(el, next)) { morphNode(el, next); return el; }
  el.replaceWith(next);
  return next;
}

/** Set text only when it differs: writing the same text still replaces the node and repaints. */
export function setText(el, text) {
  if (!el || el.textContent === text) return;
  const only = el.childNodes.length === 1 && el.firstChild.nodeType === 3 ? el.firstChild : null;
  if (only) only.nodeValue = text; // edit the text in place rather than replacing the node
  else el.textContent = text;
}
