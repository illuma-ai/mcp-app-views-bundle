# Parity recipe — capture, words, measure, compare

## Capture (Chrome extension, owner's signed-in session)
- One tab per real page; `screenshot` with `save_to_disk: true`; copy into `reference/<area>/NN-<state>.jpg`.
- Dump wording with `javascript_tool`: `document.body.innerText.replace(/\n{2,}/g,'\n').slice(0,1500)`; put the
  labels, in product order, into `reference/<area>/words.md` under a heading that names the capture file.
- Capture every state you will render: list, empty, loading (throttle network), detail, form, dialog, error, filtered.

## Measure (computed styles, not eyeballing)
Paste a measure script into the real page's console (and into the preview of our view) and diff the two:

```js
(() => {
  const P = { fontSize:'fs', fontWeight:'fw', lineHeight:'lh', color:'c', backgroundColor:'bg', padding:'p',
              borderRadius:'r', borderBottom:'bb', boxShadow:'sh', gap:'g' };
  const hex = v => v.replace(/rgb\((\d+), (\d+), (\d+)\)/g,(m,a,b,c)=>'#'+[a,b,c].map(n=>(+n).toString(16).padStart(2,'0')).join(''));
  const st = el => { if(!el) return null; const s=getComputedStyle(el), r=el.getBoundingClientRect();
    const o={ sz:[r.width,r.height].map(Math.round).join('x') };
    for (const p in P){ const v=s[p]; if(v && v!=='none' && v!=='normal' && v!=='0px' && v!=='rgba(0, 0, 0, 0)') o[P[p]]=hex(v); }
    if(!/Segoe/.test(s.fontFamily)) o.font=s.fontFamily.split(',')[0]; return o; };
  const rows=[...document.querySelectorAll('[role=option],[role=row],[data-view-row]')].slice(0,4);
  const S={ rows: rows.map(st), buttons:[...document.querySelectorAll('button')].slice(0,12).map(b=>({l:(b.getAttribute('aria-label')||b.textContent.trim()).slice(0,20),...st(b)})),
            body:{bg:getComputedStyle(document.body).backgroundColor, font:getComputedStyle(document.body).fontFamily.split(',')[0]} };
  window.__S=S; return S; })();
```
Write the numbers into `reference/<area>/spec.md` (row height, header height, font sizes/weights, colours, radii,
paddings, gutter widths, avatar size). The server's `measure:views` script asserts our preview against that spec.

## Compare
- Side-by-side at the same width (640 inline; also 360 and 900): ours from the chat (not the preview) next to the capture.
- Words: every label in `words.md` must appear verbatim (case, punctuation, ellipsis). Disabled controls that cannot work
  in a view (upload from device, pop-out) stay visible but disabled with a tooltip reason — never removed.
- Empty states and loading states use the product's sentences, not ours.
- Record each mismatch as a row: capture file, element, expected, ours, fix commit.
