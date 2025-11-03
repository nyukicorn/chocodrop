(function initChocoDropBookmarklet() {
  const scriptUrl = document.currentScript?.src
    ? new URL(document.currentScript.src)
    : new URL('/bookmarklet.js', location.origin);
  const base = scriptUrl.origin;

  const immersiveUrl = new URL('/immersive.html', base);
  immersiveUrl.searchParams.set('mode', 'bookmarklet');
  immersiveUrl.searchParams.set('source', location.href);

  const win = window.open(
    immersiveUrl.href,
    '_blank',
    'noopener=yes,height=900,width=1600'
  );

  if (!win) {
    alert('ChocoDrop: ポップアップがブロックされました。許可して再試行してください。');
  }
})();*** End Patch
