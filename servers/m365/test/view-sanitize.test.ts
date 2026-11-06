// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { cleanStyle, htmlToText, safeUrl, sanitizeHtml } from '../src/views/lib/sanitize.js';

const render = (html: string) => sanitizeHtml(html);

describe('message body sanitiser', () => {
  it('removes scripts, event handlers and dangerous containers', () => {
    const { node } = render(
      '<p onclick="x()">Hi</p><script>alert(1)</script><iframe></iframe>' +
        '<object data="x"></object><form action="https://e.test"><input name="a"></form>' +
        '<svg onload="x()"><circle/></svg><style>p{color:red}</style><img src=x onerror="x()">'
    );
    const html = node.innerHTML;
    expect(html).toContain('<p>Hi</p>');
    for (const bad of [
      'script',
      'iframe',
      'object',
      'form',
      'input',
      'svg',
      'style',
      'onerror',
      'onclick',
      'alert',
    ]) {
      expect(html, bad).not.toContain(bad);
    }
  });

  it('blocks remote images and counts them, but keeps small inline raster images', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const { node, stats } = render(
      `<img src="https://tracker.test/p.gif" alt="logo"><img src="cid:abc"><img src="${png}" alt="ok"><img src="data:image/svg+xml;base64,PHN2Zz4=">`
    );
    expect(stats.blockedImages).toBe(3);
    expect(node.querySelectorAll('img')).toHaveLength(1);
    expect(node.querySelector('img')?.getAttribute('src')).toBe(png);
    expect(node.textContent).toContain('[image blocked: logo]');
    expect(node.innerHTML).not.toContain('tracker.test');
  });

  it('keeps only http, https, mailto and tel links', () => {
    const { node, stats } = render(
      '<a href="https://ok.test/a">a</a><a href="mailto:x@ok.test">b</a><a href="javascript:alert(1)">c</a>' +
        '<a href=" jav&#x09;ascript:alert(1)">d</a><a href="data:text/html,x">e</a><a href="/relative">f</a>'
    );
    const hrefs = Array.from(node.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['https://ok.test/a', 'mailto:x@ok.test', null, null, null, null]);
    expect(stats.links).toBe(2);
    expect(node.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(node.innerHTML).not.toContain('javascript');
  });

  it('drops sender colours, fonts and anything outside the style allowlist', () => {
    expect(
      cleanStyle(
        'color:red;background:url(https://x.test/a.png);font-weight:bold;position:fixed;text-align:center'
      )
    ).toBe('font-weight:bold;text-align:center');
    expect(cleanStyle('font-weight:expression(alert(1))')).toBe('');
    const { node } = render(
      '<p style="color:#000;font-style:italic;behavior:url(x)">t</p><font color="red">u</font>'
    );
    expect(node.innerHTML).toContain('style="font-style:italic"');
    expect(node.innerHTML).not.toContain('color');
  });

  it('unwraps unknown elements and keeps their text', () => {
    const { node } = render('<custom-tag><b>bold</b> text</custom-tag><marquee>m</marquee>');
    expect(node.innerHTML).toBe('<b>bold</b> textm');
  });

  it('never interprets text as markup', () => {
    const { node } = render('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(node.querySelector('script')).toBeNull();
    expect(node.textContent).toBe('<script>alert(1)</script>');
  });

  it('safeUrl rejects control-character obfuscation', () => {
    expect(safeUrl('java\u0000script:alert(1)')).toBeNull();
    expect(safeUrl('HTTPS://ok.test')).toBe('HTTPS://ok.test');
  });

  it('converts HTML to readable plain text for editing', () => {
    const text = htmlToText(
      '<p>Line one</p><ul><li>a</li><li>b</li></ul><p>Bye<br>now</p><script>x</script>'
    );
    expect(text).toBe('Line one\n- a\n- b\nBye\nnow');
  });
});
