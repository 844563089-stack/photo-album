/* ============================================================
 * 阿包旅行图册 · 主逻辑
 * GitHub tree API + jsDelivr CDN + meta.json 元数据
 * 功能：时间轴 / 搜索 / 标签筛选 / 地图点亮 / 灯箱
 * ============================================================ */

(function () {
  'use strict';

  /* ---------- 配置 ---------- */
  const CFG = window.PHOTO_CONFIG || {};
  const GH  = CFG.github || {};
  const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.heic', '.heif']);
  const DEMO_OWNER = 'YOUR_GITHUB_USERNAME';

  /* ---------- DOM ---------- */
  const $  = (sel) => document.querySelector(sel);
  const elAlbumsGrid  = $('#albums-grid');
  const elPhotosGrid  = $('#photos-grid');
  const elViewList    = $('#view-list');
  const elViewAlbum   = $('#view-album');
  const elStatus      = $('#status');
  const elAlbumTitle  = $('#album-title');
  const elAlbumMeta   = $('#album-meta');
  const elLightbox    = $('#lightbox');
  const elLbImg       = $('#lb-img');
  const elLbCurrent   = $('#lb-current');
  const elLbTotal     = $('#lb-total');
  const elSearch      = $('#search');
  const elSearchClear = $('#search-clear');
  const elTags        = $('#tags');
  const elStats       = $('#stats');
  const elStatAlbums  = $('#stat-albums');
  const elStatPhotos  = $('#stat-photos');
  const elStatProvinces = $('#stat-provinces');
  const elStatCities  = $('#stat-cities');
  const elMapSection  = $('#map-section');
  const elChinaMap    = $('#china-map');
  const elMapSub      = $('#map-sub');

  /* ---------- 状态 ---------- */
  const state = {
    albums: [],          // 全部相册（含 meta）
    filtered: [],        // 筛选后
    year: null,
    month: null,
    tags: [],            // 选中的标签
    query: '',
    photo: { items: [], index: 0 },
    map: null,
  };

  /* ---------- 工具 ---------- */
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const extOf = (name) => {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i).toLowerCase() : '';
  };

  const formatDate = (s) => {
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return s;
    return `${m[1]}年${+m[2]}月${+m[3]}日`;
  };

  const photosRoot = () => (GH.photosPath || 'photos').replace(/\/$/, '');

  function imageUrl(path) {
    const { owner, repo, branch } = GH;
    const eo = encodeURIComponent(owner);
    const er = encodeURIComponent(repo);
    if (CFG.cdn === 'github') {
      return `https://raw.githubusercontent.com/${eo}/${er}/${branch}/${path}`;
    }
    return `https://cdn.jsdelivr.net/gh/${eo}/${er}@${branch}/${path}`;
  }

  // 省份名归一化（适配用户简写）
  const PROVINCE_MAP = {
    '北京': '北京市', '天津': '天津市', '上海': '上海市', '重庆': '重庆市',
    '河北': '河北省', '山西': '山西省', '辽宁': '辽宁省', '吉林': '吉林省',
    '黑龙江': '黑龙江省', '江苏': '江苏省', '浙江': '浙江省', '安徽': '安徽省',
    '福建': '福建省', '江西': '江西省', '山东': '山东省', '河南': '河南省',
    '湖北': '湖北省', '湖南': '湖南省', '广东': '广东省', '海南': '海南省',
    '四川': '四川省', '贵州': '贵州省', '云南': '云南省', '陕西': '陕西省',
    '甘肃': '甘肃省', '青海': '青海省', '台湾': '台湾省',
    '内蒙古': '内蒙古自治区', '广西': '广西壮族自治区', '西藏': '西藏自治区',
    '宁夏': '宁夏回族自治区', '新疆': '新疆维吾尔自治区',
    '香港': '香港特别行政区', '澳门': '澳门特别行政区',
  };
  function normalizeProvince(p) {
    if (!p) return '';
    const s = String(p).trim();
    if (PROVINCE_MAP[s]) return PROVINCE_MAP[s];
    const bare = s.replace(/省|市|壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区/g, '');
    return PROVINCE_MAP[bare] || s;
  }

  // 城市坐标表（用于地图城市点亮；坐标为近似值，展示用途）
  const CITY_COORDS = {
    '北京': [116.40, 39.90], '天津': [117.20, 39.08], '上海': [121.47, 31.23], '重庆': [106.55, 29.56],
    '石家庄': [114.51, 38.04], '太原': [112.55, 37.87], '呼和浩特': [111.75, 40.84],
    '沈阳': [123.43, 41.80], '大连': [121.61, 38.91], '长春': [125.32, 43.90], '哈尔滨': [126.53, 45.80],
    '南京': [118.80, 32.06], '苏州': [120.58, 31.30], '无锡': [120.31, 31.49], '扬州': [119.41, 32.39],
    '杭州': [120.16, 30.29], '宁波': [121.55, 29.87], '温州': [120.70, 28.00], '绍兴': [120.58, 30.03],
    '合肥': [117.23, 31.82], '黄山': [118.34, 29.71], '福州': [119.30, 26.08], '厦门': [118.09, 24.48],
    '泉州': [118.68, 24.87], '武夷山': [118.04, 27.76], '南昌': [115.86, 28.68], '景德镇': [117.18, 29.27],
    '上饶': [117.97, 28.45], '济南': [117.00, 36.65], '青岛': [120.38, 36.07], '烟台': [121.39, 37.54],
    '威海': [122.12, 37.51], '泰山': [117.10, 36.25], '郑州': [113.63, 34.75], '洛阳': [112.45, 34.62],
    '开封': [114.31, 34.80], '安阳': [114.35, 36.10], '武汉': [114.31, 30.59], '宜昌': [111.29, 30.69],
    '襄阳': [112.13, 32.01], '恩施': [109.47, 30.30], '长沙': [112.94, 28.23], '张家界': [110.48, 29.13],
    '凤凰': [109.60, 27.95], '岳阳': [113.13, 29.37], '广州': [113.26, 23.13], '深圳': [114.06, 22.55],
    '珠海': [113.58, 22.27], '佛山': [113.12, 23.02], '潮州': [116.62, 23.66], '南宁': [108.37, 22.82],
    '桂林': [110.29, 25.27], '北海': [109.12, 21.48], '海口': [110.32, 20.03], '三亚': [109.51, 18.25],
    '成都': [104.07, 30.67], '都江堰': [103.62, 31.00], '乐山': [103.77, 29.55], '贵阳': [106.71, 26.57],
    '遵义': [106.93, 27.73], '昆明': [102.83, 24.88], '大理': [100.23, 25.59], '丽江': [100.23, 26.86],
    '西双版纳': [100.80, 22.01], '拉萨': [91.11, 29.66], '林芝': [94.36, 29.65], '西安': [108.94, 34.34],
    '咸阳': [108.71, 34.33], '延安': [109.49, 36.59], '兰州': [103.83, 36.06], '敦煌': [94.66, 40.14],
    '嘉峪关': [98.29, 39.77], '张掖': [100.45, 38.93], '西宁': [101.78, 36.62], '青海湖': [100.51, 36.54],
    '茶卡盐湖': [99.10, 36.70], '银川': [106.23, 38.49], '中卫': [105.20, 37.50], '乌鲁木齐': [87.62, 43.82],
    '喀纳斯': [87.02, 48.70], '伊犁': [81.32, 43.92], '漠河': [122.54, 52.97], '哈尔滨冰雕': [126.53, 45.80],
    '台北': [121.56, 25.03], '香港': [114.17, 22.32], '澳门': [113.54, 22.19], '平遥': [112.17, 37.19],
    '承德': [117.96, 40.95], '九寨沟': [103.92, 33.26], '稻城亚丁': [100.30, 28.44],
  };

  /* ---------- 应用配置 ---------- */
  function applyBindings() {
    const s = CFG.site || {};
    if (s.title) document.title = s.title;
    document.querySelectorAll('[data-bind="title"]').forEach((n) => n.textContent = s.title || '');
    document.querySelectorAll('[data-bind="tagline"]').forEach((n) => n.textContent = s.tagline || '');
    document.querySelectorAll('[data-bind="subtitle"]').forEach((n) => n.textContent = s.subtitle || '');
    document.querySelectorAll('[data-bind="footer"]').forEach((n) => n.textContent = s.footer || '');
    const xhs = $('[data-bind="xhs"]');
    if (xhs) {
      if (s.xiaohongshuUrl) xhs.hidden = false;
      xhs.href = s.xiaohongshuUrl || '#';
      const lbl = xhs.querySelector('[data-bind="xhs-label"]');
      if (lbl) lbl.textContent = s.xiaohongshuLabel || '小红书';
    }
  }

  /* ---------- 状态提示 ---------- */
  function showStatus(msg, opts = {}) {
    elStatus.hidden = false;
    elStatus.classList.toggle('is-error', !!opts.error);
    elStatus.innerHTML = msg;
  }
  function hideStatus() {
    elStatus.hidden = true;
    elStatus.innerHTML = '';
  }

  /* ============================================================
   * Demo 模式数据（本地预览，photos/_demo/ 渐变图）
   * ============================================================ */
  const DEMO_ALBUMS = [
    { folder: '2026-05-16', title: '武汉东湖', location: '武汉', province: '湖北省', description: '樱花季的东湖，骑行绿道，湖风正好，走累了就在湖边坐一下午。', tags: ['城市漫步', '湖光'],
      captions: { 'a1-01.jpg': '东湖绿道入口', 'a1-02.jpg': '磨山樱园', 'a1-03.jpg': '湖心落日', 'a1-04.jpg': '听涛泳场', 'a1-05.jpg': '杉树林荫', 'a1-06.jpg': '东湖之眼' },
      photos: ['a1-01.jpg', 'a1-02.jpg', 'a1-03.jpg', 'a1-04.jpg', 'a1-05.jpg', 'a1-06.jpg'] },
    { folder: '2026-05-01', title: '长沙橘子洲', location: '长沙', province: '湖南省', description: '五一前错峰去了长沙，橘子洲头的晚风把一天的疲惫都吹散了。', tags: ['人文', '夜景'],
      captions: { 'a2-01.jpg': '橘子洲大桥', 'a2-02.jpg': '岳麓山远眺', 'a2-03.jpg': '湘江夜航', 'a2-04.jpg': '坡子街小吃', 'a2-05.jpg': '长沙夜色' },
      photos: ['a2-01.jpg', 'a2-02.jpg', 'a2-03.jpg', 'a2-04.jpg', 'a2-05.jpg'] },
    { folder: '2025-11-08', title: '婺源晒秋', location: '上饶', province: '江西省', description: '十一月去婺源看晒秋，屋顶上的红椒黄菊，是秋天最热闹的样子。', tags: ['乡村', '秋色'],
      captions: { 'a3-01.jpg': '篁岭晒秋', 'a3-02.jpg': '青砖黛瓦', 'a3-03.jpg': '晒秋屋顶', 'a3-04.jpg': '晨雾中的村落' },
      photos: ['a3-01.jpg', 'a3-02.jpg', 'a3-03.jpg', 'a3-04.jpg'] },
    { folder: '2025-09-21', title: '青海湖环线', location: '青海湖', province: '青海省', description: '九月的青海湖天很蓝，风很大，一路自驾一路停下来拍照。', tags: ['自驾', '高原'],
      captions: { 'a4-01.jpg': '青海湖畔', 'a4-02.jpg': '公路尽头', 'a4-03.jpg': '茶卡盐湖', 'a4-04.jpg': '草原牧歌' },
      photos: ['a4-01.jpg', 'a4-02.jpg', 'a4-03.jpg', 'a4-04.jpg'] },
    { folder: '2025-04-02', title: '杭州西湖', location: '杭州', province: '浙江省', description: '清明前在西湖边走了整整一天，柳树新绿，波光粼粼。', tags: ['城市漫步', '湖光'],
      captions: { 'a2-01.jpg': '苏堤春晓', 'a2-02.jpg': '断桥残雪', 'a3-03.jpg': '雷峰塔影', 'a4-02.jpg': '白堤骑行' },
      photos: ['a2-01.jpg', 'a2-02.jpg', 'a3-03.jpg', 'a4-02.jpg'] },
    { folder: '2024-10-14', title: '敦煌莫高窟', location: '敦煌', province: '甘肃省', description: '第一次见到莫高窟的飞天壁画，穿越千年的感动难以言喻。', tags: ['人文', '沙漠'],
      captions: { 'a3-01.jpg': '九层楼', 'a1-02.jpg': '鸣沙山日落', 'a4-03.jpg': '月牙泉', 'a2-04.jpg': '沙漠驼队' },
      photos: ['a3-01.jpg', 'a1-02.jpg', 'a4-03.jpg', 'a2-04.jpg'] },
  ];
  const demoUrl = (name) => `./photos/_demo/${name}`;

  function loadDemo() {
    state.albums = DEMO_ALBUMS.map((d) => {
      const [year, month] = d.folder.split('-');
      return {
        folder: d.folder, year, month, date: d.folder,
        title: d.title, location: d.location, province: d.province,
        description: d.description || '', captions: d.captions || {}, tags: d.tags,
        cover: demoUrl(d.photos[0]), count: d.photos.length,
        isDemo: true, photos: d.photos,
      };
    });
    sortAlbums();
    state.filtered = state.albums.slice();
    hideStatus();
    afterLoad();
  }

  /* ============================================================
   * 真实模式：加载相册
   * ============================================================ */
  async function loadAlbums() {
    if (!GH.owner || GH.owner === DEMO_OWNER || !GH.repo) {
      showStatus(`
        <strong>还没配置仓库信息</strong><br>
        请打开 <code>config.js</code>，把 <code>github.owner</code> 和 <code>github.repo</code>
        改成你自己的 GitHub 用户名 + 仓库名，然后重新上传。
        <div class="setup">github: {<br>
          &nbsp;&nbsp;owner: '<b>your-name</b>',<br>
          &nbsp;&nbsp;repo:  '<b>photo-album</b>',<br>
        }</div>
      `, { error: true });
      return;
    }

    showStatus('正在读取相册列表…');
    const headers = GH.token
      ? { Authorization: `Bearer ${GH.token}`, Accept: 'application/vnd.github+json' }
      : { Accept: 'application/vnd.github+json' };

    try {
      const url = `https://api.github.com/repos/${encodeURIComponent(GH.owner)}/${encodeURIComponent(GH.repo)}/git/trees/${GH.branch}?recursive=1`;
      const res = await fetch(url, { headers });

      if (res.status === 403) {
        showStatus(`
          <strong>GitHub API 速率限制</strong><br>
          公开仓库每小时限 60 次请求。请稍后再试，或去
          <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener">GitHub Settings</a>
          生成 fine-grained token（仅勾 <em>Public contents: read</em>）填进 <code>config.js</code>。
        `, { error: true });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const prefix = photosRoot() + '/';
      const albumsMap = new Map();

      (data.tree || []).forEach((node) => {
        if (node.type !== 'blob' || !node.path.startsWith(prefix)) return;
        const rest = node.path.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash < 0) return;
        const folder = rest.slice(0, slash);
        const name = rest.slice(slash + 1);
        if (!name) return;
        const ext = extOf(name);

        let entry = albumsMap.get(folder);
        if (!entry) {
          entry = { photos: [], hasMeta: false };
          albumsMap.set(folder, entry);
        }
        if (ext === '.json' && name.toLowerCase() === 'meta.json') {
          entry.hasMeta = true;
          return;
        }
        if (!IMG_EXT.has(ext)) return;
        entry.photos.push(name);
      });

      if (!albumsMap.size) {
        showStatus(`
          <strong>还没发现相册文件夹</strong><br>
          请在 GitHub 仓库的 <code>${photosRoot()}/</code> 下创建日期文件夹，例如
          <code>${photosRoot()}/2026-05-16/</code>，把照片拖进去。
        `, { error: true });
        return;
      }

      state.albums = [...albumsMap.entries()].map(([folder, e]) => {
        const [year, month] = folder.split('-');
        const photos = [...e.photos].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        return {
          folder, year, month, date: folder,
          title: formatDate(folder),
          location: '', province: '', description: '', captions: {}, tags: [],
          cover: photos[0] || null, count: photos.length,
          hasMeta: e.hasMeta, photos,
        };
      }).filter((a) => a.photos.length > 0);

      await fetchAllMeta(state.albums);
      sortAlbums();
      hideStatus();
      afterLoad();
    } catch (err) {
      console.error(err);
      showStatus(`
        <strong>加载失败</strong><br>
        ${escapeHtml(err.message || String(err))}<br>
        请检查 <code>config.js</code> 的 owner / repo / branch，且仓库为 <b>Public</b>。
      `, { error: true });
    }
  }

  /* 拉取各相册 meta.json（jsDelivr 优先，raw 兜底，不占 API 配额） */
  async function fetchAllMeta(albums) {
    const withMeta = albums.filter((a) => a.hasMeta);
    const chunk = 6;
    for (let i = 0; i < withMeta.length; i += chunk) {
      await Promise.all(withMeta.slice(i, i + chunk).map(async (a) => {
        const rel = `${photosRoot()}/${a.folder}/meta.json`;
        const urls = [imageUrl(rel), `https://raw.githubusercontent.com/${encodeURIComponent(GH.owner)}/${encodeURIComponent(GH.repo)}/${GH.branch}/${rel}`];
        for (const u of urls) {
          try {
            const r = await fetch(u, { cache: 'no-cache' });
            if (!r.ok) continue;
            const m = await r.json();
            if (m && typeof m === 'object') {
              if (m.title) a.title = m.title;
              if (m.location) a.location = m.location;
              if (m.province) a.province = normalizeProvince(m.province);
              if (m.description) a.description = String(m.description).trim();
              if (m.captions && typeof m.captions === 'object') {
                const cap = {};
                Object.keys(m.captions).forEach((k) => {
                  if (a.photos.includes(k) && m.captions[k]) cap[k] = String(m.captions[k]).trim();
                });
                a.captions = cap;
              }
              if (Array.isArray(m.tags)) a.tags = m.tags.map((t) => String(t).trim()).filter(Boolean);
              if (m.cover && a.photos.includes(m.cover)) a.cover = m.cover;
              a.metaLoaded = true;
            }
            return;
          } catch (e) { /* try next */ }
        }
      }));
    }
  }

  /* ============================================================
   * 加载完成后的统一入口
   * ============================================================ */
  // 相册按日期排序（desc 最新在前 / asc 最早在前）
  function sortAlbums() {
    state.albums.sort((a, b) => {
      return CFG.sort === 'asc'
        ? a.folder.localeCompare(b.folder)
        : b.folder.localeCompare(a.folder);
    });
  }

  function afterLoad() {
    renderTagBar();
    renderStats();
    applyFilters();
    initMap();
  }

  /* ============================================================
   * 标签栏
   * ============================================================ */
  function renderTagBar() {
    const counter = {};
    state.albums.forEach((a) => (a.tags || []).forEach((t) => { counter[t] = (counter[t] || 0) + 1; }));
    const sorted = Object.entries(counter).sort((a, b) => b[1] - a[1]);

    elTags.innerHTML = sorted.map(([tag, n]) => `
      <button type="button" class="chip ${state.tags.includes(tag) ? 'active' : ''}" data-tag="${escapeHtml(tag)}">
        ${escapeHtml(tag)}<span class="chip-count">${n}</span>
      </button>`).join('');

    elTags.querySelectorAll('.chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.tag;
        const i = state.tags.indexOf(t);
        if (i >= 0) state.tags.splice(i, 1); else state.tags.push(t);
        renderTagBar();
        applyFilters();
      });
    });
  }

  /* ============================================================
   * 筛选 + 渲染
   * ============================================================ */
  function applyFilters() {
    const { year, month, tags, query } = state;
    let list = state.albums.slice();

    if (year) {
      list = list.filter((a) => a.year === year && (!month || a.month === month));
    }
    if (tags.length) {
      list = list.filter((a) => tags.some((t) => (a.tags || []).includes(t)));
    }
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((a) =>
        [a.title, a.date, a.location, a.province, (a.tags || []).join(' ')]
          .join(' ').toLowerCase().includes(q));
    }

    state.filtered = list;
    renderGrid();
  }

  function renderGrid() {
    elAlbumsGrid.innerHTML = '';
    if (!state.filtered.length) {
      elAlbumsGrid.innerHTML = `
        <div class="empty-state">
          <p class="empty-title">没有匹配的相册</p>
          <p class="empty-sub">换个筛选条件或清空搜索再试试</p>
        </div>`;
      return;
    }
    state.filtered.forEach((album, idx) => {
      elAlbumsGrid.appendChild(renderAlbumCard(album, idx));
    });
  }

  function renderAlbumCard(album, idx) {
    const card = document.createElement('article');
    card.className = 'album-card';
    card.style.animationDelay = `${Math.min(idx, 12) * 40}ms`;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `打开相册 ${album.title}，共 ${album.count} 张照片`);
    card.innerHTML = `
      <div class="album-cover">
        <div class="skeleton"></div>
        <img loading="lazy" alt="${escapeHtml(album.title)}" draggable="false" />
      </div>
      <div class="album-meta">
        <div class="album-title-line">
          <span class="album-title-text">${escapeHtml(album.title)}</span>
          ${album.location ? `<span class="album-loc">${escapeHtml(album.location)}</span>` : ''}
        </div>
        <div class="album-sub">
          ${album.year ? `<span>${formatDate(album.date)}</span>` : ''}
          <span class="dot">·</span>
          <span>${album.count} 张</span>
        </div>
        ${album.description ? `<p class="album-desc">${escapeHtml(album.description)}</p>` : ''}
        ${album.tags && album.tags.length ? `
          <div class="album-tags">
            ${album.tags.slice(0, 3).map((t) => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('')}
          </div>` : ''}
      </div>
    `;

    const img = card.querySelector('img');
    const skel = card.querySelector('.skeleton');
    const coverSrc = album.cover || '';
    const isDirectUrl = /^(https?:)?\/\/|\/|\.\.?\//.test(coverSrc);
    img.src = coverSrc
      ? (isDirectUrl ? coverSrc : imageUrl(`${photosRoot()}/${album.folder}/${coverSrc}`))
      : '';

    img.addEventListener('load', () => {
      img.classList.add('loaded');
      skel.remove();
    }, { once: true });
    img.addEventListener('error', () => {
      skel.remove();
      img.replaceWith(Object.assign(document.createElement('div'), {
        textContent: '封面加载失败',
        style: 'position:absolute;inset:0;display:grid;place-items:center;color:#777;font-size:13px;',
      }));
    }, { once: true });

    card.addEventListener('click', () => openAlbum(album.folder));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openAlbum(album.folder);
      }
    });
    return card;
  }

  /* ============================================================
   * 统计
   * ============================================================ */
  function renderStats() {
    if (!state.albums.length) { elStats.hidden = true; return; }
    elStats.hidden = false;
    const photoTotal = state.albums.reduce((s, a) => s + a.count, 0);
    const provinces = new Set(state.albums.filter((a) => a.province).map((a) => a.province)).size;
    const cities = new Set(state.albums.filter((a) => a.location).map((a) => a.location)).size;
    elStatAlbums.textContent = state.albums.length;
    elStatPhotos.textContent = photoTotal;
    elStatProvinces.textContent = provinces;
    elStatCities.textContent = cities;
  }

  /* ============================================================
   * 地图点亮（ECharts + 国家标准中国行政区划数据）
   * ============================================================ */
  async function initMap() {
    if (typeof echarts === 'undefined') { console.warn('initMap: echarts CDN 加载失败'); return; }
    const hasPlace = state.albums.some((a) => a.province);
    if (!hasPlace) return;

    let geo = null;
    const sources = [
      'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json',
      'https://cdn.jsdelivr.net/npm/echarts@4.9.0/map/json/china.json',
    ];
    for (const src of sources) {
      try {
        const r = await fetch(src);
        if (r.ok) { geo = await r.json(); break; }
      } catch (e) { /* try next */ }
    }
    if (!geo) { console.warn('initMap: 中国行政区划数据加载失败，地图区块已隐藏'); return; }

    try {
      echarts.registerMap('china', geo);
      elMapSection.hidden = false;
      state.map = echarts.init(elChinaMap);
      state.map.resize();
      updateMap();
    } catch (e) {
      console.error('地图初始化失败：', e);
    }
  }

  function updateMap() {
    if (!state.map) return;
    const counts = {};
    state.albums.forEach((a) => {
      if (a.province) counts[a.province] = (counts[a.province] || 0) + 1;
    });
    // data 数组同时放全称（如"湖北省"）与简称（如"湖北"），兼容两种 geojson 数据源
    const data = [];
    Object.keys(counts).forEach((name) => {
      data.push({ name, value: counts[name] });
      const short = name.replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔/g, '');
      if (short && short !== name) data.push({ name: short, value: counts[name] });
    });
    const max = Math.max(1, ...data.map((d) => d.value));
    const provinceCount = new Set(Object.keys(counts)).size;

    // 城市光点（去重，含坐标的可标点）
    const citySeen = new Map();
    state.albums.forEach((a) => {
      if (!a.location || !CITY_COORDS[a.location]) return;
      const key = a.location;
      citySeen.set(key, (citySeen.get(key) || 0) + 1);
    });
    const cityData = [...citySeen.entries()].map(([name, cnt]) => ({
      name,
      value: [CITY_COORDS[name][0], CITY_COORDS[name][1], cnt],
    }));
    const cityCount = citySeen.size;

    elMapSub.textContent = `点亮 ${provinceCount} 个省 · ${cityCount} 个城市 · 每块亮色和每个光点都是你去过的地方`;

    state.map.setOption({
      geo: {
        map: 'china',
        roam: false,
        label: { show: false },
        itemStyle: {
          areaColor: '#1d1d1d',
          borderColor: '#3a3a3a',
          borderWidth: 0.6,
        },
        emphasis: {
          label: { show: false },
          itemStyle: { areaColor: '#e8b98a' },
        },
        regions: data.map((d) => ({
          name: d.name,
          itemStyle: { areaColor: getProvinceColor(d.value, max) },
        })),
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: '#1c1c1c',
        borderColor: 'rgba(255,255,255,.12)',
        textStyle: { color: '#eee', fontSize: 13 },
        formatter: (p) => {
          if (p.seriesType === 'effectScatter') {
            return `${p.name}<br><span style="color:#e8b98a">去过 ${p.value[2]} 次</span>`;
          }
          if (p.value == null || p.value === undefined) return `${p.name}<br><span style="color:#888">未点亮</span>`;
          return `${p.name}<br><span style="color:#e8b98a">去过 ${p.value} 次</span>`;
        },
      },
      series: [
        {
          type: 'effectScatter',
          coordinateSystem: 'geo',
          data: cityData,
          symbolSize: (v) => 12 + (v[2] - 1) * 2,
          rippleEffect: { scale: 3.5, brushType: 'fill', period: 4, color: 'rgba(255,180,107,0.45)' },
          label: {
            show: true,
            formatter: '{b}',
            color: '#ffe0b0',
            fontSize: 12,
            fontWeight: 500,
            position: 'right',
            distance: 8,
            textShadowColor: 'rgba(0,0,0,0.7)',
            textShadowBlur: 4,
          },
          itemStyle: {
            color: '#ff8c42',
            borderColor: '#ffffff',
            borderWidth: 1,
            shadowBlur: 10,
            shadowColor: 'rgba(255,140,66,0.9)',
          },
          zlevel: 10,
        },
      ],
    });
  }

  // 省份按去去次数着色（半透明暗琥珀 → 半透明亮琥珀，避免和城市点同色）
  function getProvinceColor(value, max) {
    if (!value) return 'rgba(45,45,45,.6)';
    if (max <= 1) return 'rgba(212,165,116,.45)';
    const t = value / max;
    if (t < 0.34) return 'rgba(110,82,48,.5)';
    if (t < 0.68) return 'rgba(160,118,72,.5)';
    return 'rgba(212,165,116,.5)';
  }

  /* ============================================================
   * 相册详情
   * ============================================================ */
  const photoState = { album: '', items: [], index: 0 };

  function showAlbumView() {
    elViewList.hidden = true;
    elViewAlbum.hidden = false;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  async function openAlbum(folder) {
    const album = state.albums.find((a) => a.folder === folder);
    if (!album) return;

    showAlbumView();
    elAlbumTitle.textContent = album.title;
    const elAlbumDesc = $('#album-desc');
    if (album.description) {
      elAlbumDesc.hidden = false;
      elAlbumDesc.textContent = album.description;
    } else {
      elAlbumDesc.hidden = true;
    }
    elAlbumMeta.textContent = `共 ${album.count} 张照片 · ${formatDate(album.date)}`;
    elPhotosGrid.innerHTML = '';
    photoState.album = folder;
    photoState.index = 0;

    // demo 模式：直接出片
    if (album.isDemo) {
      photoState.items = album.photos.map((n) => ({ name: n, url: demoUrl(n) }));
      renderPhotoGrid(album);
      return;
    }

    elAlbumMeta.textContent = '加载中…';
    try {
      const url = `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${photosRoot()}/${encodeURIComponent(folder)}`;
      const headers = GH.token
        ? { Authorization: `Bearer ${GH.token}`, Accept: 'application/vnd.github+json' }
        : { Accept: 'application/vnd.github+json' };
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const list = await res.json();
      const items = (Array.isArray(list) ? list : [])
        .filter((f) => f.type === 'file' && IMG_EXT.has(extOf(f.name)))
        .map((f) => ({ name: f.name, url: imageUrl(f.path) }));
      items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      photoState.items = items;
      elAlbumMeta.textContent = `共 ${items.length} 张照片 · ${formatDate(album.date)}`;
      renderPhotoGrid(album);
    } catch (err) {
      console.error(err);
      elAlbumMeta.textContent = '加载失败：' + (err.message || err);
    }
  }

  function renderPhotoGrid(album) {
    const items = photoState.items;
    if (!items.length) {
      elPhotosGrid.innerHTML = '<p style="text-align:center;color:var(--fg-muted);padding:64px;">这个相册里没有可识别的图片。</p>';
      return;
    }
    items.forEach((p, i) => {
      // 照片标注：优先 captions 映射，缺省用文件名（去扩展名）
      const cap = (album.captions && album.captions[p.name])
        ? album.captions[p.name]
        : p.name.replace(/\.[^.]+$/, '');
      const card = document.createElement('figure');
      card.className = 'photo-item';
      card.style.animationDelay = `${Math.min(i, 16) * 30}ms`;
      card.innerHTML = `
        <div class="skeleton"></div>
        <img loading="lazy" alt="${escapeHtml(cap)}" draggable="false" />
        <figcaption class="photo-cap">${escapeHtml(cap)}</figcaption>
      `;
      const img = card.querySelector('img');
      const skel = card.querySelector('.skeleton');
      img.src = p.url;
      img.addEventListener('load', () => { img.classList.add('loaded'); skel.remove(); }, { once: true });
      img.addEventListener('error', () => skel.remove(), { once: true });
      card.addEventListener('click', () => openLightbox(i));
      elPhotosGrid.appendChild(card);
    });
  }

  function closeAlbum() {
    elViewAlbum.hidden = true;
    elViewList.hidden = false;
    window.scrollTo({ top: 0, behavior: 'instant' });
    elPhotosGrid.innerHTML = '';
    photoState.items = [];
  }

  /* ============================================================
   * 灯箱
   * ============================================================ */
  function openLightbox(i) {
    if (!photoState.items.length) return;
    photoState.index = (i + photoState.items.length) % photoState.items.length;
    renderLightbox();
    elLightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    elLightbox.hidden = true;
    document.body.style.overflow = '';
  }

  function navLightbox(delta) {
    if (!photoState.items.length) return;
    photoState.index = (photoState.index + delta + photoState.items.length) % photoState.items.length;
    renderLightbox();
  }

  function renderLightbox() {
    const item = photoState.items[photoState.index];
    elLbImg.src = item.url;
    elLbImg.alt = item.name;
    elLbCurrent.textContent = photoState.index + 1;
    elLbTotal.textContent = photoState.items.length;
  }

  /* ============================================================
   * 事件绑定
   * ============================================================ */
  function bindEvents() {
    // 搜索
    let debounce = null;
    elSearch.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.query = elSearch.value.trim();
        elSearchClear.hidden = !state.query;
        applyFilters();
      }, 150);
    });
    elSearchClear.addEventListener('click', () => {
      elSearch.value = '';
      state.query = '';
      elSearchClear.hidden = true;
      applyFilters();
    });

    // 详情页
    $('.back-btn').addEventListener('click', closeAlbum);

    // 灯箱
    $('.lb-close').addEventListener('click', closeLightbox);
    $('.lb-prev').addEventListener('click', () => navLightbox(-1));
    $('.lb-next').addEventListener('click', () => navLightbox(1));
    elLightbox.addEventListener('click', (e) => {
      if (e.target === elLightbox) closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
      if (elLightbox.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') navLightbox(-1);
      if (e.key === 'ArrowRight') navLightbox(1);
    });
    let touchX = 0;
    elLightbox.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    elLightbox.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) navLightbox(dx > 0 ? -1 : 1);
    }, { passive: true });

    // 窗口尺寸变化 → 地图重绘
    window.addEventListener('resize', () => {
      if (state.map) state.map.resize();
    });
  }

  /* ---------- 启动 ---------- */
  function init() {
    applyBindings();
    bindEvents();
    if (CFG.demo) loadDemo();
    else loadAlbums();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
