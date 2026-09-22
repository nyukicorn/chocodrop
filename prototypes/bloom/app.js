const main = document.querySelector('main');
const base = 'https://nyukicorn.github.io/chocodrop/';
const worlds = [
  { id: 'basic', name: 'はじまりの世界', text: 'ひとつ置くところから。好きな画像や3Dモデルで、最初の一歩を。', tag: 'まず試したい', path: 'basic', image: 'basic.png' },
  { id: 'toy', name: 'ちいさな遊園地', text: '観覧車とメリーゴーランド。昼と夜で変わる、おもちゃの街へ。', tag: '遊びたい', path: 'toy-city', image: 'toy-dark.png' },
  { id: 'garden', name: '音楽の花園', text: '音が鳴ると、花が広がり、光の粒が舞う。サンプル音で体験してみましょう。', tag: '花と音に浸りたい', path: 'music-garden', image: 'garden.png' },
  {id:'ocean',name:'海底世界',text:'光と生き物が漂う、ピクセルの海へ。',tag:'水の中へ',path:'pixel-ocean',image:'ocean.png'},
  {id:'space',name:'宇宙空間',text:'星の間を旅する、広い空間へ。',tag:'星の向こうへ',path:'space',image:'space.png'},
  {id:'wabi',name:'侘び寂び',text:'静かな余白を味わう世界へ。',tag:'静かに過ごしたい',path:'wabi-sabi',image:'wabi.png'},
  {id:'lofi',name:'Lo-fi Room',text:'落ち着いた部屋で、自分の時間を。',tag:'部屋で落ち着きたい',path:'lofi-room',image:'lofi.png'}
];
const external = (path, label, classes = 'text-link') => `<a class="${classes}" href="${base}${path}" target="_blank" rel="noopener">${label} ↗</a>`;
const cards = (items = worlds) => items.map(w => `<article class="world-card" data-world="${w.id}"><a href="${base}examples/${w.path}/" target="_blank" rel="noopener"><div class="world-picture">${w.image ? `<img src="assets/${w.image}" ${w.id === 'toy' ? 'data-theme-image="toy"' : ''} alt="${w.name}の実際の公開デモ" loading="lazy">` : `<div class="world-symbol" aria-label="${w.name}の案内アイコン">${w.symbol}</div>`}<span class="image-label">${w.tag}</span></div><div class="world-title"><h3>${w.name}</h3><span aria-hidden="true">↗</span></div></a><p>${w.text}</p><div class="world-actions">${['garden', 'toy'].includes(w.id) ? `<button class="button" data-preview="${w.id}">動くデモを見る</button>` : ''}<a class="text-link" href="${base}examples/${w.path}/" target="_blank" rel="noopener">この世界へ ↗</a></div></article>`).join('');

const heading = (en, title, text) => `<div class="page-heading"><span class="eyebrow">${en}</span><h1>${title}</h1><p>${text}</p></div>`;
const pages = {
  home: () => `<section class="hero"><div class="hero-copy"><span class="eyebrow">SMALL DROPS, BIG WORLDS</span><h1>ちょこっとDrop。<br>世界が<em>咲く。</em><span class="petal" aria-hidden="true"></span></h1><p>好きな素材を置く。<br>あなただけの世界が、花ひらく。</p><div class="actions"><button class="button primary" data-demo>✿　1分で試してみる　→</button><a class="button" href="#guide">使い方を見る</a></div><p class="caption">ChocoDropは、写真・動画・3Dモデルを<br>ブラウザの3D空間に置いて楽しめるツールです。</p><p class="caption">Three.js対応 · この遊園地で、手元の素材を試せます。</p></div><div class="live-world"><iframe id="park-preview" src="scene.html?v=import8&theme=${document.documentElement.dataset.theme}" title="動く遊園地。ドラッグで視点を動かせます"></iframe><div class="park-actions"><button class="button" data-park-zoom="in" aria-label="遊園地を拡大">＋ 拡大</button><button class="button" data-park-zoom="out" aria-label="遊園地を縮小">− 縮小</button><button class="button" data-park-expand>大きく見る</button><button class="button" data-park-theme="light">☀ 昼</button><button class="button" data-park-theme="dark">☾ 夜</button><button class="button primary" data-park-sample>猫ちゃんを置く ✿</button><label class="button" for="park-file">画像・動画・GLBを選ぶ<input id="park-file" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,.glb" hidden></label><button class="button" data-park-pause aria-pressed="false">動きを止める</button></div><p class="caption">実際に動く3D空間です。ドラッグで見回す · スクロールはページ移動 · 拡大・縮小はボタンで · ファイルは32MBまで</p></div></section><section class="section" aria-labelledby="use-cases-title"><div class="section-heading"><div><span class="eyebrow">A PLACE FOR YOUR FAVORITES</span><h2 id="use-cases-title">こんな時に、世界をひらく。</h2><p>完成した素材を眺める場所にも、制作の途中を試す場所にも。</p></div></div><div class="use-case-grid"><article class="status-card"><span class="badge">思い出を置く</span><h2>写真を、景色の一部に。</h2><p>猫や旅先、大切な人の写真を、好きな世界の中で眺める。</p></article><article class="status-card"><span class="badge">作品を試す</span><h2>動画や3Dモデルを、すぐ確認。</h2><p>つくった素材をブラウザへ置き、角度や世界との相性を確かめる。</p></article><article class="status-card"><span class="badge">相棒とつくる</span><h2>CLIやMCPから、会話で配置。</h2><p>CodexやClaude Codeで用意した素材を、手元の世界へつなぐ。</p></article></div></section><section class="section"><div class="section-heading"><div><span class="eyebrow">FIND YOUR WORLD</span><h2>次は、どんな世界に？</h2></div><a class="text-link" href="#worlds">世界を選ぶ　→</a></div><div class="world-grid">${cards(worlds.filter(w=>['garden','ocean','space'].includes(w.id)))}</div><button class="button" data-garden>花園を動くプレビューで見る →</button></section><section class="story-video section" aria-labelledby="story-video-title"><div><span class="eyebrow">IN MOTION</span><h2 id="story-video-title">置くと、世界が少し変わる。</h2><p>遊園地に素材を置き、昼と夜を行き来する短いデモです。音声はありません。</p></div><video controls playsinline preload="metadata" poster="assets/chocodrop-preview-poster.webp"><source src="assets/chocodrop-preview.mp4" type="video/mp4">動画を再生できない場合は、トップの遊園地を操作してお試しください。</video></section><section class="connect-band"><div><h2>開発の相棒と、もっと楽しく。</h2><p>CLIやMCPでつくった素材を、あなたの世界にドロップ。</p></div><div class="tool-names"><span>Codex</span><span>Claude Code</span><span>Antigravity</span></div><a class="button" href="#connect">ツール連携について　→</a></section><section class="section" aria-labelledby="one-minute-title"><div class="section-heading"><div><span class="eyebrow">TRY IN ONE MINUTE</span><h2 id="one-minute-title">1分で、ひとつ置いてみる。</h2></div></div><div class="steps"><div class="step"><span class="step-number">01</span><h3>猫ちゃんを置く</h3><p>トップの遊園地に、用意された猫の画像を置いてみる。</p></div><div class="step"><span class="step-number">02</span><h3>自分の素材に替える</h3><p>「画像・動画・GLBを選ぶ」から、手元のファイルをひとつ選ぶ。</p></div><div class="step"><span class="step-number">03</span><h3>眺め方を変える</h3><p>ドラッグで見回し、昼と夜や距離を変えて、自分の景色を見つける。</p></div></div><button class="button primary" data-demo>はじまりの世界で試す　→</button></section>`,
  worlds: () => `${heading('EXPLORE', '好きな世界へ、ひとっ飛び。', '今の気分に合う景色を選んで、ブラウザの中へ。公開されている7つの世界を、実際のデモ画面から選べます。')}<div class="world-grid">${cards()}</div><button class="button" data-garden>花園を動くプレビューで見る →</button><p class="subtle-note">各デモは別タブで開きます。このサイトのDark / Lightと、デモの昼夜設定は別々です。遊園地ではデモ内のボタンで切り替えられます。</p><section class="connect-band"><div><h2>まずは、ひとつ置いてみる？</h2><p>サンプルからなら、素材の準備もいりません。</p></div><button class="button primary" data-demo>はじまりの世界を開く　→</button></section>`,
  guide: () => `${heading('HOW TO DROP', '1分で、ひとつ置いてみる。', 'アカウントも設定もいりません。最初は用意された猫ちゃんで、次に自分の素材で試せます。')}<div class="guide-layout"><div><section class="guide-step"><span class="step-number">01</span><div><h2>はじまりの世界を開く</h2><p>まずはサンプルを配置してみましょう。ツールの接続や生成サービスの設定は不要です。</p><button class="button primary" data-demo>デモを開く　→</button></div></section><section class="guide-step"><span class="step-number">02</span><div><h2>手元のファイルを読み込む</h2><p>デモ右下の🍫を開き、Importからファイルを選びます。まずは画像1枚で試すとわかりやすくなります。</p></div></section><section class="guide-step"><span class="step-number">03</span><div><h2>景色を、いろんな角度から</h2><p>ドラッグやスクロールで視点を動かし、置いた素材を眺めてみましょう。操作方法は各デモの案内をご覧ください。</p></div></section><h2>気になること</h2><details><summary>自分の3Dサイトにも組み込めますか？</summary><p>現在の組み込み実装はThree.js向けです。WebGLを使っているすべてのサイトに、そのまま対応するわけではありません。ほかの3DエンジンやWebGPUでの動作は未確認です。</p></details><details><summary>トップの遊園地では何を置けますか？</summary><p>PNG・JPEG・WebPの画像、MP4・WebMの動画、外部ファイルを参照しないGLB 2.0の3Dモデルを、1ファイル32MiBまで選べます。素材は1つずつ置き換わり、動画は無音で繰り返し再生します。圧縮拡張を必要とするGLBなど、一部のファイルは読み込めません。</p></details><details><summary>素材をAIで生成する必要はありますか？</summary><p>ありません。写真や作成済みのファイルを読み込めます。生成した素材も、ファイルとして用意すれば同じように使えます。</p></details><details><summary>置いたものは保存されますか？</summary><p>この案内では保存・再開を保証していません。ページを閉じたり再読み込みする前に、必要な記録を残してください。</p></details><details><summary>Codex・Claude Code・Antigravityから使うには？</summary><p>ローカルのMCPを設定すると、会話から素材の配置を依頼できます。<a href="#connect">接続の手順を見る →</a></p></details><details><summary>ブックマークレットは使えますか？</summary><p>使えます。ローカルdaemonを起動し、<a href="examples/bookmarklet-v2.html">登録ページ</a>からブックマークへ追加します。対象ページがThree.jsシーンを公開していることなど、利用条件があります。</p></details></div><aside class="side-note"><span class="eyebrow">A LITTLE NOTE</span><h3>最初は、小さな画像から。</h3><p>画像・動画・3Dモデルの読み込みに対応しています。形式やサイズの制限は利用方法によって異なります。</p><p>このサイトのデモはThree.jsとWebGLを使用しています。WebGLが利用できるブラウザが必要です。音声やXRなどの追加機能は、端末や権限に依存します。</p><a class="text-link" href="#connect">ツールから配置する　→</a></aside></div>`,
  connect: () => `${heading('CONNECT YOUR TOOLS', 'いつもの相棒と、世界をつくる。', 'Codex・Claude Code・Antigravityをはじめ、いつものCLIやMCPを制作に活かす。つくった画像・動画・3Dモデルを、ChocoDropの世界に置いてみましょう。')}<section class="status-grid"><div class="status-card"><span class="badge">ファイルでつなぐ</span><h2>好きなツールでつくって、置く</h2><p>普段使う制作ツールやCLI、接続済みの生成MCPで素材を作成 → 対応形式のファイルとして保存 → ChocoDropのImportで選択。この方法なら、ChocoDropへのMCP接続は不要です。</p><p>生成サービスの設定・契約は各ツール側で行います。出力されたファイルがChocoDropの対応形式・サイズに合うことを確認してください。</p></div><div class="status-card"><span class="badge">MCPでつなぐ</span><h2>会話から、素材を配置する</h2><p>Codex・Claude Code・AntigravityにChocoDropのMCPを登録すると、素材フォルダ内のファイルを会話から配置できます。1コマンドがインストール済みのツールを検出し、登録内容を確認してから設定します。</p><p>ChocoDropのMCPは素材を生成せず、許可したローカルファイルを配置します。生成には普段お使いのツールを利用してください。</p></div></section><section class="section"><h2>たとえば、こんな頼み方。</h2><p>「接続済みの制作ツールで花の画像を作り、素材フォルダにPNGで保存して。その画像をChocoDropに置いて」</p><p class="subtle-note">生成ツールとChocoDropのMCPをそれぞれ設定した環境での依頼例です。ChocoDrop自体に画像・動画の生成機能が含まれる、という意味ではありません。</p></section><div class="setup"><aside class="setup-nav" role="tablist" aria-label="接続するツール"><button class="setup-tab" id="tab-codex" role="tab" aria-selected="true" aria-controls="setup-content" data-tool="codex">Codex　→</button><button class="setup-tab" id="tab-claude" role="tab" aria-selected="false" aria-controls="setup-content" tabindex="-1" data-tool="claude">Claude Code　→</button><button class="setup-tab" id="tab-antigravity" role="tab" aria-selected="false" aria-controls="setup-content" tabindex="-1" data-tool="antigravity">Antigravity　→</button></aside><section class="setup-panel" id="setup-content" role="tabpanel" aria-labelledby="tab-codex"></section></div><p class="subtle-note">既存のThree.jsページへブックマークからUIを加える場合は、<a href="examples/bookmarklet-v2.html">ブックマークレット登録ページ</a>をご利用ください。</p>`,
  about: () => `${heading('PROJECT NOTES', 'いま使えること、これからのこと。', '見た目と、実際の機能の状態を分けてお伝えします。')}<div class="status-grid"><section class="status-card"><span class="badge">公開中</span><h2>ブラウザのデモ</h2><p>遊園地で画像・動画・GLBを置き、公開中の7つの世界へ移動できます。Three.jsとWebGLを使用します。</p><a href="#worlds" class="text-link">世界を選ぶ →</a></section><section class="status-card"><span class="badge">ローカルで利用</span><h2>Codex・Claude Code・Antigravity連携</h2><p>公開されているコードを自分のPCで動かすMCPです。GitHub Pages上でMCPサーバーが動いているわけではありません。</p><a href="#connect" class="text-link">接続方法を見る →</a></section><section class="status-card"><span class="badge">Chromeで検証</span><h2>ブックマークレット</h2><p>ローカルdaemonを起動し、Three.jsシーンを公開しているページで使用できます。ページのセキュリティ設定やシーンの構成によっては利用できません。</p><a href="examples/bookmarklet-v2.html" class="text-link">登録ページを開く →</a></section><section class="status-card"><span class="badge">別途検証中</span><h2>XR・Quest</h2><p>ブラウザ版とは別の動作条件があります。Quest実機、音声生成、ストア配布を含むXR機能は、この公開導線の利用可能範囲には含めていません。</p></section></div>`
};
const snippets = {
  codex: 'pnpm dlx @chocodrop/setup@0.1.0-alpha.1 --client codex',
  claude: 'pnpm dlx @chocodrop/setup@0.1.0-alpha.1 --client claude',
  antigravity: 'pnpm dlx @chocodrop/setup@0.1.0-alpha.1 --client antigravity'
};
function codeBlock(key, label) {
  return `<div class="code-head"><span>${label}</span><button class="copy" data-copy="${key}">コピー</button></div><pre><code>${snippets[key]}</code></pre>`;
}
function setup(tool = 'codex') {
  const names = { codex: 'Codex', claude: 'Claude Code', antigravity: 'Antigravity' };
  const name = names[tool] || names.codex;
  const environment = tool === 'antigravity' ? 'Node.js・pnpmとAntigravity' : `Node.js・pnpmと${name}のCLI`;
  document.querySelectorAll('[data-tool]').forEach(b => { b.setAttribute('aria-selected', String(b.dataset.tool === tool)); b.tabIndex = b.dataset.tool === tool ? 0 : -1; });
  const panel = document.querySelector('#setup-content');
  panel.setAttribute('aria-labelledby', `tab-${tool}`);
  panel.innerHTML = `<span class="eyebrow">LOCAL MCP</span><h2>${name}とつなぐ</h2><p>${environment}が使える環境で、次の1コマンドを実行します。GitHubのcloneは不要です。</p><div class="setup-flow"><h3>1. MCPを登録する</h3>${codeBlock(tool, name)}<p>内容を表示して確認した後、<code>~/ChocoDropAssets</code>を作成し、${name}のユーザー設定へ登録します。</p><h3>2. ツールを再起動する</h3><p>再起動後に「ChocoDropのget_statusでURLを教えて」と依頼し、返されたローカルURLを開きます。</p><h3>3. つくって、置く</h3><p>普段の生成MCPやCLIで素材フォルダへファイルを保存し、「ChocoDropのimport_assetで配置して」と依頼します。</p><p class="subtle-note">PNG・JPEG・WebP・MP4・WebM・自己完結したGLBに対応。1ファイル32MiBまで。接続先のブラウザを開いた状態で使ってください。</p>${external('getting-started.html', '詳しい現行ガイドを見る')}</div>`;
}
function syncTheme() {
 document.querySelector('#park-preview')?.contentWindow.postMessage({type:'theme',theme:document.documentElement.dataset.theme},location.origin);
  const light = document.documentElement.dataset.theme === 'light';
  const toggle = document.querySelector('#theme-toggle');
  toggle.innerHTML = `<span aria-hidden="true">${light ? '☀' : '☾'}</span><span class="theme-label">${light ? 'Light' : 'Dark'}</span>`;
  toggle.setAttribute('aria-label', `${light ? 'ダーク' : 'ライト'}に切り替える`);
  document.querySelectorAll('[data-theme-image]').forEach(img => { img.src = `assets/${img.dataset.themeImage}-${light ? 'light' : 'dark'}.png`; });
}
function render(focus = true) {
  const route = location.hash.slice(1) || 'home';
  if (route === 'main') { main.focus(); return; }
  const page = Object.hasOwn(pages, route) ? route : 'home';
  main.innerHTML = pages[page]().replaceAll('この試作', 'このサイト').replace('見た目の試作と、', 'サイトの案内と、').replace('今回の試作', 'サイトについて').replace('このサイトでは修理や再公開は行っていません。', 'ブックマークレットの案内は、検証が完了するまで再開しません。').replace('公開サイトと各デモの画面デザインは、まだ置き換えていません。', '各デモは、それぞれの世界に合わせた画面デザインで表示されます。');
  main.querySelector('a[href="compare.html"]')?.remove();
  document.querySelectorAll('nav a').forEach(a => { if (a.hash === `#${page}`) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.title = `${({home:'世界が咲く',worlds:'世界を選ぶ',guide:'使い方',connect:'ツール連携',about:'対応状況'})[page]} — ChocoDrop`;
  if (page === 'connect') setup();
  syncTheme();
  if (focus) { main.focus({preventScroll:true}); window.scrollTo(0, 0); }
}
document.querySelector('#theme-toggle').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('chocodrop-preview-theme', theme); } catch {}
  syncTheme();
});
const dialog = document.querySelector('#demo-dialog');
document.querySelector('#close-demo').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => document.querySelector('#demo-frame').replaceChildren());
let noticeTimer;
document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-demo')) {
    document.querySelector('#demo-title').textContent = 'はじまりの世界';
    document.querySelector('.dialog-head a').href = base + 'examples/basic/';
    document.querySelector('.dialog-head a').textContent = 'この世界へ ↗';
    document.querySelector('.demo-hint').textContent = '既存の世界を開いて、右下の🍫から素材を配置できます。';
    document.querySelector('.demo-fallback').textContent = '公開デモを別タブで開きます。';
    document.querySelector('#demo-frame').innerHTML = `<a class="demo-launch" href="${base}examples/basic/" target="_blank" rel="noopener"><img src="assets/basic.png" alt="はじまりの世界"><span class="button primary">この世界へ ↗</span></a>`;
    dialog.showModal();
  }
  if (button.dataset.tool) setup(button.dataset.tool);
  if (button.dataset.copy) {
    const notice = document.querySelector('#notice');
    try { await navigator.clipboard.writeText(snippets[button.dataset.copy]); notice.textContent = 'コピーしました。パスはご自身の環境に置き換えてください。'; }
    catch { notice.textContent = 'コピーできませんでした。コードを選択してコピーしてください。'; }
    notice.classList.add('visible');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.classList.remove('visible'), 5000);
  }
});
document.addEventListener('keydown', event => {
  if (!event.target.matches('[data-tool]') || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
  event.preventDefault();
  const tools = ['codex', 'claude', 'antigravity'];
  const current = tools.indexOf(event.target.dataset.tool);
  const backwards = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
  const tool = event.key === 'Home' ? tools[0] : event.key === 'End' ? tools.at(-1) : tools[(current + (backwards ? -1 : 1) + tools.length) % tools.length];
  setup(tool);
  document.querySelector(`#tab-${tool}`).focus();
});
window.addEventListener('hashchange', () => render());
render(false);

function sendPark(message) { document.querySelector('#park-preview')?.contentWindow.postMessage(message, location.origin); }
document.addEventListener('click', event => {
 const zoom = event.target.closest('[data-park-zoom]'); if(zoom)sendPark({type:'zoom',direction:zoom.dataset.parkZoom});
 const theme = event.target.closest('[data-park-theme]'); if(theme)sendPark({type:'theme',theme:theme.dataset.parkTheme});
 if (event.target.closest('[data-park-sample]')) sendPark({type:'sample'});
 const pause = event.target.closest('[data-park-pause]');
 if (pause) { const stopped = pause.getAttribute('aria-pressed') !== 'true'; pause.setAttribute('aria-pressed',String(stopped)); pause.textContent = stopped ? '動きを再開' : '動きを止める'; sendPark({type:'pause',stopped}); }
});
document.addEventListener('change', event => {
 if (event.target.id !== 'park-file') return;
 const file = event.target.files[0]; if (file) sendPark({type:'file',file}); event.target.value = '';
});

function openWorldPreview(id) {
 const world = worlds.find(w => w.id === id);
 if (!world) return;
 const frame = document.createElement('iframe');
 frame.src = id === 'garden' ? 'worlds/music-garden/index.html' : id === 'toy' ? 'scene.html?v=import7&theme=' + document.documentElement.dataset.theme : base + 'examples/' + world.path + '/';
 frame.title = world.name + 'の動くデモ';
 document.querySelector('#demo-title').textContent = world.name;
 document.querySelector('.dialog-head a').href = base + 'examples/' + world.path + '/';
 document.querySelector('.dialog-head a').textContent = 'この世界へ ↗';
 document.querySelector('.demo-hint').textContent = id === 'garden' ? '「サンプル音で花を咲かせる」を押すと音が鳴ります。音に合わせて花と光が動きます。マイクは使いません。' : 'ドラッグで景色を見回せます。「この世界へ」から既存の世界を別タブで開けます。';
 document.querySelector('.demo-fallback').textContent = '表示されない場合は「この世界へ」から開いてください。世界を閉じると、この中の再生も終了します。';
 document.querySelector('#demo-frame').replaceChildren(frame);
 dialog.showModal();
}
document.addEventListener('click', event => {
 const preview = event.target.closest('[data-preview]');
 if (preview) openWorldPreview(preview.dataset.preview);
 if (event.target.closest('[data-garden]')) openWorldPreview('garden');
});


document.addEventListener('click',event=>{
 const button=event.target.closest('[data-park-expand]');if(!button)return;
 const expanded=document.querySelector('.live-world').classList.toggle('expanded-world');
 button.textContent=expanded?'元の大きさに戻す':'大きく見る';button.setAttribute('aria-expanded',String(expanded));
});
document.addEventListener('keydown',event=>{if(event.key==='Escape') {document.querySelector('.expanded-world')?.classList.remove('expanded-world');const b=document.querySelector('[data-park-expand]');if(b){b.textContent='大きく見る';b.setAttribute('aria-expanded','false');}}});

window.addEventListener('message', event => {
 const frame = document.querySelector('#park-preview');
 if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
 if (event.data?.type === 'park-scroll' && Number.isFinite(event.data.deltaY)) {
   if (!document.querySelector('.expanded-world')) window.scrollBy(0, event.data.deltaY);
 }
});
