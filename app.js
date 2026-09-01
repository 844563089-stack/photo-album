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

  // 地点 → 拼音 / 拉丁化译名。
  // 凡是 pinyin-pro 默认输出错的（如"西安"应该带撇号 Xi'an、"拉萨"用 Lhasa 不是 La Sa），
  // 都放进白名单里精确覆盖；其余输入全交给 pinyin-pro 自动转，**用户无需再维护这张表**。
  const LOC_PINYIN = {
    '西安': "Xi'an",       // pinyin-pro → "xi an"，需要撇号
    '拉萨': 'Lhasa',       // 拉丁化译名（藏语英译）
    '哈尔滨': 'Harbin',    // 拉丁化译名（满语英译）
    '乌鲁木齐': 'Urumqi',  // 拉丁化译名（维语英译）
    '呼和浩特': 'Hohhot',  // 拉丁化译名（蒙语英译）
    '喀什': 'Kashgar',     // 拉丁化译名（维语英译）
    '吐鲁番': 'Turpan',    // 拉丁化译名
    '香格里拉': 'Shangri-La',
    '青海湖': 'Qinghai Lake',  // pinyin-pro → "qinghai hu"，英文习惯加 Lake
  };
  // 全自动中文 → 拼音：pinyin-pro 覆盖所有汉字，去空格 + 首字母大写即可。
  // 白名单（LOC_PINYIN）只覆盖拉丁化译名/特殊拼写。
  const locPinyin = (s) => {
    if (!s) return s;
    if (LOC_PINYIN[s]) return LOC_PINYIN[s];
    const P = (typeof window !== 'undefined' && window.pinyinPro) ||
              (typeof globalThis !== 'undefined' && globalThis.pinyinPro);
    if (P && typeof P.pinyin === 'function') {
      try {
        const py = P.pinyin(s, { toneType: 'none', type: 'string', v: true, nonZh: 'consecutive' });
        if (py) return py.replace(/\s+/g, '').replace(/^[a-z]/, (c) => c.toUpperCase());
      } catch { /* 失败兜底 */ }
    }
    return s;
  };

  function utf8ToBase64(s) {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  // 数据清洗：删除所有 ASCII 控制字符（如 \u0006 这类脏字符）+ 首尾空白
  // 浏览器自动填充/输入法偶发会塞入控制字符，写入 GitHub 前必须清掉，否则 title/location 变乱码
  function sanitizeStr(s) {
    if (typeof s !== 'string') return s;
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x20 || c === 0x7f) continue;   // 跳过控制字符（\n\t\r 也一并清理，标题/地点不需要）
      out += s[i];
    }
    return out.trim();
  }

  // 判断字符串是否"有实质内容"（含中文/日文假名/字母/数字），仅剩标点或空 → false
  // 配合 sanitizeStr 兜底：清洗后只剩裸标点（如历史脏数据 '\u0006 → '）时回退旧值
  function isMeaningful(s) {
    if (!s) return false;
    for (let i = 0; i < s.length; i++) {
      if (/[\u4e00-\u9fff\u3040-\u30ffa-zA-Z0-9]/.test(s[i])) return true;
    }
    return false;
  }

  // 修复 mojibake：历史遗留数据把 UTF-8 字节当 latin1 逐字节误读（如"大理"→"å¤§ç"）
  // 关键判断：mojibake 的特征是「所有字符的 charCodeAt 都 ≤ 0xFF」（单字节 latin1）。
  // 正常中文字符（CJK 0x4E00-0x9FFF）charCodeAt 远大于 0xFF，绝不是 mojibake，必须原样放行。
  function fixMojibake(s) {
    if (typeof s !== 'string' || !s) return s;
    let allLatin1 = true;   // 是否所有字符都在 latin1 单字节范围内
    let hasHigh = false;    // 是否含 ≥0x80 的高位 latin1（纯 ASCII 无需处理）
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c > 0xFF) { allLatin1 = false; break; }  // 含正常 Unicode（中文等）→ 不是 mojibake
      if (c >= 0x80) hasHigh = true;
    }
    if (!allLatin1 || !hasHigh) return s;
    // 把 latin1 字符的低字节当 UTF-8 字节重新解码
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch { return s; }
  }
  function fixMetaObj(m) {
    if (!m || typeof m !== 'object') return m;
    const out = {};
    Object.keys(m).forEach((k) => {
      const v = m[k];
      if (typeof v === 'string') out[k] = sanitizeStr(fixMojibake(v));
      else if (Array.isArray(v)) out[k] = v.map((x) => typeof x === 'string' ? sanitizeStr(fixMojibake(x)) : x);
      else out[k] = v;
    });
    return out;
  }

  // GitHub Contents API 工具（主作用域：管理面板 / 设封面 复用）
  function ghHeaders(token) {
    return {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };
  }
  async function ghGetSha(token, path) {
    const url = `https://api.github.com/repos/${encodeURIComponent(GH.owner)}/${encodeURIComponent(GH.repo)}/contents/${path}`;
    try {
      const res = await fetch(url, { headers: ghHeaders(token) });
      if (!res.ok) return null;
      const data = await res.json();
      return data.sha || null;
    } catch { return null; }
  }
  async function ghPutFile(token, path, contentB64, message) {
    const sha = await ghGetSha(token, path);
    const body = { message, content: contentB64, branch: GH.branch || 'main' };
    if (sha) body.sha = sha;
    const url = `https://api.github.com/repos/${encodeURIComponent(GH.owner)}/${encodeURIComponent(GH.repo)}/contents/${path}`;
    const res = await fetch(url, { method: 'PUT', headers: ghHeaders(token), body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    purgeJsdelivr(path);   // 写入成功后清 jsDelivr 缓存，让 CDN 上的 meta.json/照片也实时
    return true;
  }
  // 清 jsDelivr 单文件缓存（免费公开服务；失败不影响主流程，raw 兜底仍可实时读）
  function purgeJsdelivr(rel) {
    try {
      const eo = encodeURIComponent(GH.owner);
      const er = encodeURIComponent(GH.repo);
      fetch(`https://purge.jsdelivr.net/gh/${eo}/${er}@${GH.branch || 'main'}/${rel}`, { cache: 'no-cache' })
        .catch(() => {});
    } catch { /* ignore */ }
  }

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

    // 文件树获取：git/trees API 优先（认证/限速），失败 → jsDelivr Data API（实时索引，国内稳定）
    let data = null;
    try {
      const url = `https://api.github.com/repos/${encodeURIComponent(GH.owner)}/${encodeURIComponent(GH.repo)}/git/trees/${GH.branch}?recursive=1`;
      const res = await fetch(url, { headers });
      if (res.ok) data = await res.json();
    } catch { data = null; }
    if (!data) {
      try {
        const dUrl = `https://data.jsdelivr.com/v1/packages/gh/${encodeURIComponent(GH.owner)}/${encodeURIComponent(GH.repo)}@${GH.branch}?structure=flat`;
        const res = await fetch(dUrl, { cache: 'no-cache' });
        if (res.ok) {
          const d = await res.json();
          // data.jsdelivr 返回 { files: [{ name: '/photos/...' }] }，映射成与 git/trees 相同的结构
          data = {
            tree: (d.files || []).map((f) => ({
              type: 'blob',
              path: String(f.name || '').replace(/^\//, ''),
            })),
          };
        }
      } catch { data = null; }
    }
    if (!data) {
      showStatus(`
        <strong>无法读取相册列表</strong><br>
        GitHub API 与 jsDelivr 数据源暂时都不可达，请稍后刷新重试。
      `, { error: true });
      return;
    }
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

      try {
        await fetchAllMeta(state.albums);
        // 关键过滤：meta.json 拉不到的相册（说明 meta 已删除/不存在）不显示。
        // 防止 jsDelivr Data API 索引同步延迟期间，已删除的相册靠 CDN 残留"复活"成空壳。
        state.albums = state.albums.filter((a) => a.metaLoaded && a.photos.length > 0);
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

  /* 拉取各相册 meta.json（带 token 的 API 优先 → raw → jsDelivr 兜底） */
  async function fetchAllMeta(albums) {
    const withMeta = albums.filter((a) => a.hasMeta);
    const chunk = 4;
    for (let i = 0; i < withMeta.length; i += chunk) {
      await Promise.all(withMeta.slice(i, i + chunk).map(async (a) => {
        const rel = `${photosRoot()}/${a.folder}/meta.json`;
        // ① 优先 raw.githubusercontent.com（实时 commit 快照 + 时间戳，无 CDN 缓存；国内多数网络可达）
        //    其次 jsDelivr CDN（国内稳定，理论最长 12h 缓存；写端成功后已 purge，此处为兜底）
        //    api.github.com 在国内网络不稳定（实测经常连接失败），放最后兜底并带 8s 超时防卡页
        let m = null;
        // ① 优先带 token 的 GitHub Contents API：实时认证、无 CDN 缓存（token 存在时最可靠，
        //    避免 raw 不稳/jsDelivr 旧缓存导致封面等字段刷新后丢失）
        if (GH.token) {
          try {
            const apiUrl = `https://api.github.com/repos/${encodeURIComponent(GH.owner)}/${encodeURIComponent(GH.repo)}/contents/${rel}`;
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 8000);
            const r = await fetch(apiUrl, {
              headers: ghHeaders(GH.token),
              signal: ctrl.signal,
            });
            clearTimeout(timer);
            if (r.ok) {
              const d = await r.json();
              // GitHub API 的 content 字段是 base64 编码的 UTF-8 字节
              // 正确解码：先 atob 拿二进制，再 TextDecoder 转 UTF-8（不能直接 atob 当字符串）
              const bin = atob((d.content || '').replace(/\n/g, ''));
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              const txt = new TextDecoder('utf-8').decode(bytes);
              m = JSON.parse(txt);
            }
          } catch { m = null; }
        }
        // ② raw 兜底（实时快照 + 时间戳；国内时通时断）
        if (!m) {
          const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(GH.owner)}/${encodeURIComponent(GH.repo)}/${GH.branch}/${rel}?_t=${Date.now()}`;
          try {
            const r = await fetch(rawUrl, { cache: 'no-cache' });
            if (r.ok) {
              const tmp = await r.json();
              if (tmp && typeof tmp === 'object') m = tmp;
            }
          } catch { m = null; }
        }
        // ③ jsDelivr 最后兜底（国内稳定，但可能命中 CDN 缓存返回旧数据，仅作保底）
        if (!m) {
          try {
            const r = await fetch(imageUrl(rel), { cache: 'no-cache' });
            if (r.ok) {
              const tmp = await r.json();
              if (tmp && typeof tmp === 'object') m = tmp;
            }
          } catch { m = null; }
        }
        if (m && typeof m === 'object') {
          m = fixMetaObj(m);                     // 修复旧 mojibake 字符串（已含 sanitizeStr）
          // 兜底：CDN fallback 时可能拿到历史脏数据，sanitizeStr 清掉控制字符但保留合法标点
          // 用 isMeaningful 把"只剩标点/纯数字"的异常值挡掉，宁可不显示也不显示脏值
          if (m.title && isMeaningful(m.title)) a.title = m.title;
          if (m.location) a.location = m.location;            // location 允许为空字符串
          if (m.province) a.province = normalizeProvince(m.province);
          if (m.description && isMeaningful(m.description)) a.description = String(m.description).trim();
          if (m.captions && typeof m.captions === 'object') {
            const cap = {};
            Object.keys(m.captions).forEach((k) => {
              if (a.photos.includes(k) && m.captions[k]) cap[k] = String(m.captions[k]).trim();
            });
            a.captions = cap;
          }
          if (Array.isArray(m.tags)) {
            a.tags = m.tags.map((t) => String(t).trim()).filter((t) => t && isMeaningful(t));
          }
          if (m.cover && a.photos.includes(m.cover)) a.cover = m.cover;
          a.metaLoaded = true;
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
          ${album.location ? `<span class="album-loc">${escapeHtml(locPinyin(album.location))}</span>` : ''}
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
    // jsDelivr 边缘节点偶发失败时，自动重试一次 raw.githubusercontent.com 兜底；
    // raw 仍失败才显示"加载失败"，避免单次网络抖动直接锁死。
    img.addEventListener('error', () => {
      if (!img.dataset.retried && !isDirectUrl && coverSrc) {
        img.dataset.retried = '1';
        const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(GH.owner)}/${encodeURIComponent(GH.repo)}/${GH.branch || 'main'}/${photosRoot()}/${album.folder}/${encodeURIComponent(coverSrc)}`;
        img.src = rawUrl;
        return;
      }
      skel.remove();
      img.replaceWith(Object.assign(document.createElement('div'), {
        textContent: '封面加载失败',
        style: 'position:absolute;inset:0;display:grid;place-items:center;color:#777;font-size:13px;',
      }));
    });

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
    const isCurrentCover = (n) => album.cover && album.cover === n;
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
        <button type="button" class="photo-cover-btn ${isCurrentCover(p.name) ? 'is-cover' : ''}" data-set-cover="${escapeHtml(p.name)}" aria-label="${isCurrentCover(p.name) ? '当前封面' : '设为封面'}" title="${isCurrentCover(p.name) ? '当前封面' : '设为封面'}">${isCurrentCover(p.name) ? '★' : '☆'}</button>
        <figcaption class="photo-cap">${escapeHtml(cap)}</figcaption>
      `;
      const img = card.querySelector('img');
      const skel = card.querySelector('.skeleton');
      img.src = p.url;
      img.addEventListener('load', () => { img.classList.add('loaded'); skel.remove(); }, { once: true });
      img.addEventListener('error', () => skel.remove(), { once: true });
      // 设封面按钮：阻止冒泡（不打开灯箱）
      const btn = card.querySelector('.photo-cover-btn');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setAlbumCover(album, p.name, btn);
      });
      card.addEventListener('click', () => openLightbox(i));
      elPhotosGrid.appendChild(card);
    });
  }

  // 把某张照片设为封面：调用 API 更新 meta.json 的 cover 字段
  async function setAlbumCover(album, photoName, btn) {
    const token = localStorage.getItem(TOKEN_KEY) || GH.token;
    if (!token) {
      elAlbumMeta.textContent = '设封面需要 GitHub 密钥，先去右下角 ⚙ 管理面板粘贴 token';
      return;
    }
    btn.disabled = true;
    try {
      // 白名单重建 meta.json：只保留用户可编辑字段，避免污染运行时字段（字段值过 sanitizeStr 防乱码）
      const clean = {
        title: sanitizeStr(album.title),
        location: sanitizeStr(album.location),
        province: sanitizeStr(album.province),
        description: sanitizeStr(album.description),
        tags: Array.isArray(album.tags) ? album.tags.map((t) => sanitizeStr(t)).filter(Boolean) : [],
        cover: photoName,
      };
      Object.keys(clean).forEach((k) => { if (clean[k] === undefined || clean[k] === null || clean[k] === '') delete clean[k]; });
      const metaB64 = utf8ToBase64(JSON.stringify(clean, null, 2));
      const metaPath = `${photosRoot()}/${album.folder}/meta.json`;
      // 复用 ghPutFile：内部已含 ghGetSha + PUT + purgeJsdelivr（清 jsDelivr 缓存，
      // 否则刷新时 raw 失败会 fallback 到 jsDelivr 旧数据 → 封面丢失）
      await ghPutFile(token, metaPath, metaB64, `set cover: ${album.folder}/${photoName}`);
      // 本地 album 状态同步
      album.cover = photoName;
      // 重新渲染所有按钮状态：当前封面 = 实心★，其余 = 空心☆
      elPhotosGrid.querySelectorAll('.photo-cover-btn').forEach((b) => {
        const on = b.dataset.setCover === photoName;
        b.classList.toggle('is-cover', on);
        b.textContent = on ? '★' : '☆';
        b.title = on ? '当前封面' : '设为封面';
        b.setAttribute('aria-label', on ? '当前封面' : '设为封面');
      });
    } catch (e) {
      alert('设封面失败：' + (e.message || e));
    } finally {
      btn.disabled = false;
    }
  }

  function closeAlbum() {
    elViewAlbum.hidden = true;
    elViewList.hidden = false;
    window.scrollTo({ top: 0, behavior: 'instant' });
    elPhotosGrid.innerHTML = '';
    photoState.items = [];
    applyFilters();              // 退出详情时刷新列表：让封面修改 / 统计即时生效
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
   * 管理面板（网页直传照片 + 自动写 meta.json）
   * ============================================================ */
  const elAdminFab        = $('#admin-fab');
  const elAdminOverlay    = $('#admin-overlay');
  const elAdminClose      = $('#admin-close');
  const elAdminToken      = $('#admin-token');
  const elAdminTokenSave  = $('#admin-token-save');
  const elAdminTokenClear = $('#admin-token-clear');
  const elAdminTokenOk    = $('#admin-token-ok');
  const elAdminTokenActions = $('#admin-token-actions');
  const elAdminDate       = $('#admin-date');
  const elAdminTitle      = $('#admin-title');
  const elAdminLocation   = $('#admin-location');
  const elAdminProvince   = $('#admin-province');
  const elAdminDesc       = $('#admin-desc');
  const elAdminFiles      = $('#admin-files');
  const elAdminFileList   = $('#admin-file-list');
  const elAdminUpload     = $('#admin-upload');
  const elAdminStatus     = $('#admin-status');

  const PROVINCES = ['北京','天津','上海','重庆','河北','山西','辽宁','吉林','黑龙江','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','广西','海南','四川','贵州','云南','西藏','陕西','甘肃','青海','宁夏','新疆','内蒙古','中国香港','中国澳门','中国台湾'];
  const TOKEN_KEY = 'pa_token_v1';
  let adminFiles = [];

  // 城市 → 省份映射（输入地点时自动识别省份）
  const CITY_PROVINCE = {
    '北京': '北京', '天津': '天津', '上海': '上海', '重庆': '重庆',
    '武汉': '湖北', '黄石': '湖北', '宜昌': '湖北', '襄阳': '湖北', '十堰': '湖北',
    '荆州': '湖北', '荆门': '湖北', '恩施': '湖北', '神农架': '湖北', '长沙': '湖南',
    '株洲': '湖南', '湘潭': '湖南', '衡阳': '湖南', '岳阳': '湖南', '张家界': '湖南',
    '婺源': '江西', '南昌': '江西', '九江': '江西', '景德镇': '江西', '赣州': '江西',
    '杭州': '浙江', '宁波': '浙江', '温州': '浙江', '绍兴': '浙江', '乌镇': '浙江',
    '西塘': '浙江', '舟山': '浙江',
    '南京': '江苏', '苏州': '江苏', '无锡': '江苏', '扬州': '江苏', '镇江': '江苏',
    '广州': '广东', '深圳': '广东', '珠海': '广东', '汕头': '广东', '佛山': '广东',
    '东莞': '广东', '中山': '广东',
    '成都': '四川', '九寨沟': '四川', '峨眉山': '四川', '乐山': '四川', '都江堰': '四川',
    '西安': '陕西', '华山': '陕西', '宝鸡': '陕西', '延安': '陕西',
    '昆明': '云南', '大理': '云南', '丽江': '云南', '西双版纳': '云南', '腾冲': '云南',
    '香格里拉': '云南',
    '桂林': '广西', '南宁': '广西', '北海': '广西',
    '敦煌': '甘肃', '兰州': '甘肃', '张掖': '甘肃', '嘉峪关': '甘肃',
    '拉萨': '西藏', '日喀则': '西藏', '林芝': '西藏',
    '乌鲁木齐': '新疆', '吐鲁番': '新疆', '喀什': '新疆', '伊犁': '新疆',
    '西宁': '青海', '青海湖': '青海', '格尔木': '青海',
    '银川': '宁夏', '中卫': '宁夏',
    '呼和浩特': '内蒙古', '包头': '内蒙古', '额济纳': '内蒙古',
    '哈尔滨': '黑龙江', '齐齐哈尔': '黑龙江', '漠河': '黑龙江',
    '长春': '吉林', '吉林': '吉林', '延边': '吉林', '长白山': '吉林',
    '沈阳': '辽宁', '大连': '辽宁', '丹东': '辽宁',
    '石家庄': '河北', '承德': '河北', '秦皇岛': '河北',
    '太原': '山西', '大同': '山西', '平遥': '山西', '五台山': '山西',
    '济南': '山东', '青岛': '山东', '烟台': '山东', '泰山': '山东', '威海': '山东',
    '郑州': '河南', '洛阳': '河南', '开封': '河南', '少林寺': '河南',
    '合肥': '安徽', '黄山': '安徽', '宏村': '安徽',
    '福州': '福建', '厦门': '福建', '泉州': '福建', '武夷山': '福建', '土楼': '福建',
    '贵阳': '贵州', '遵义': '贵州', '黄果树': '贵州', '荔波': '贵州',
    '三亚': '海南', '海口': '海南',
    '香港': '中国香港', '澳门': '中国澳门', '台北': '中国台湾',
  };

  function initAdmin() {
    // 日期默认今天
    const d = new Date();
    elAdminDate.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // 省份下拉
    elAdminProvince.innerHTML = '<option value="">选择省份…</option>' + PROVINCES.map((p) => `<option value="${p}">${p}</option>`).join('');
    // token 恢复
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) {
      elAdminToken.value = saved;
      elAdminTokenOk.textContent = '✓ 已保存';
      elAdminTokenActions.hidden = false;
      GH.token = saved;               // 浏览相册时也用 token 提额
    }
    // 地点 → 省份自动识别（用户离开焦点时）
    if (!elAdminLocation.dataset.bound) {
      elAdminLocation.dataset.bound = '1';
      elAdminLocation.addEventListener('change', () => {
        const loc = sanitizeStr(elAdminLocation.value);
        const prov = CITY_PROVINCE[loc];
        if (prov) {
          elAdminProvince.value = prov;
          adminStatus(`已自动识别「${loc}」→ 省份「${prov}」`, true);
        } else if (loc) {
          adminStatus(`未识别「${loc}」对应省份，请手动选择`, false);
        }
      });
    }
  }

  function adminStatus(html, ok) {
    elAdminStatus.innerHTML = html;
    elAdminStatus.className = 'admin-status' + (ok ? ' ok' : ok === false ? ' err' : '');
  }

  // GitHub API 工具已提升到主作用域（设封面复用）

  // 客户端压缩图片：max 长边 2048px、quality 0.85（保证单图 < 5MB，GitHub 上传稳定）
  async function compressImage(file, maxDim = 2048, quality = 0.85) {
    if (!/image\/(jpeg|jpg|webp)/i.test(file.type)) return file;     // PNG/GIF/HEIC 不动
    const blobUrl = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = blobUrl;
    });
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    if (w0 <= maxDim && h0 <= maxDim && file.size < 5 * 1024 * 1024) {
      URL.revokeObjectURL(blobUrl);
      return file;
    }
    const scale = Math.min(1, maxDim / Math.max(w0, h0));
    const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(blobUrl);
    return await new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        const outName = file.name.replace(/\.(jpe?g|webp)$/i, '.jpg');
        resolve(new File([blob], outName, { type: 'image/jpeg' }));
      }, 'image/jpeg', quality);
    });
  }

  async function fileToBase64(file) {
    const f = await compressImage(file);
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = r.result;
        const idx = s.indexOf(',');
        resolve(idx >= 0 ? s.slice(idx + 1) : s);
      };
      r.onerror = () => reject(new Error('读取文件失败'));
      r.readAsDataURL(f);
    });
  }

  function renderAdminFileList() {
    elAdminFileList.innerHTML = adminFiles.map((f, i) => {
      const sz = (f.size / 1024 / 1024).toFixed(2);
      const oversized = f.size > 20 * 1024 * 1024;
      return `<li><span class="af-name">${escapeHtml(f.name)}</span><span class="af-size${oversized ? ' warn' : ''}">${sz} MB${oversized ? ' ⚠' : ''}</span></li>`;
    }).join('');
    // 无照片时：只要有任一表单内容就允许"仅更新相册信息"
    const hasMetaInput = !!(sanitizeStr(elAdminTitle.value) || sanitizeStr(elAdminLocation.value) || sanitizeStr(elAdminDesc.value));
    elAdminUpload.disabled = adminFiles.length === 0 && !hasMetaInput;
  }

  async function doUpload() {
    const token = elAdminToken.value.trim();
    if (!token) { adminStatus('请先填写并保存 GitHub 密钥', false); return; }
    localStorage.setItem(TOKEN_KEY, token);
    GH.token = token;

    const date = elAdminDate.value;
    if (!date) { adminStatus('请选择日期', false); return; }
    const folder = date;
    const root = photosRoot();

    // ① 先读旧 meta.json（如果存在 → 合并：用户没填的字段保留旧的）
    const metaPath = `${root}/${folder}/meta.json`;
    let oldMeta = {};
    try {
      const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(GH.owner)}/${encodeURIComponent(GH.repo)}/contents/${metaPath}`, { headers: ghHeaders(token) });
      if (r.ok) {
        const d = await r.json();
        // UTF-8 正确解码（GitHub API content 是 base64 编码的 UTF-8 字节）
        const bin = atob((d.content || '').replace(/\n/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const txt = new TextDecoder('utf-8').decode(bytes);
        oldMeta = fixMetaObj(JSON.parse(txt));
      }
    } catch { /* 旧 meta 不存在或读不到，忽略 */ }

    // ①.5 计算起始编号：目录已存在照片则续号（补传），否则从 01 开始
    let startNum = 1;
    try {
      const dirUrl = `https://api.github.com/repos/${encodeURIComponent(GH.owner)}/${encodeURIComponent(GH.repo)}/contents/${root}/${encodeURIComponent(folder)}`;
      const r = await fetch(dirUrl, { headers: ghHeaders(token) });
      if (r.ok) {
        const list = await r.json();
        if (Array.isArray(list)) {
          const nums = list
            .map((f) => f.name.match(/^(\d+)\./))
            .filter(Boolean)
            .map((m) => parseInt(m[1], 10))
            .filter((n) => !isNaN(n));
          if (nums.length) startNum = Math.max(...nums) + 1;
        }
      }
    } catch { /* 读目录失败则从 01 开始 */ }

    // ② 合并：用户填的字段优先，未填的字段保留旧值（已去除标签选项）
    //    全部过 sanitizeStr 清洗：防止输入法/自动填充塞入控制字符导致乱码
    const userTitle = sanitizeStr(elAdminTitle.value);
    const userLoc   = sanitizeStr(elAdminLocation.value);
    const userProv  = sanitizeStr(elAdminProvince.value);
    const userDesc  = sanitizeStr(elAdminDesc.value);
    const meta = {
      // isMeaningful 兜底：清洗后只剩标点（无中文/字母/数字）视为无效输入，回退旧值/日期
      title: isMeaningful(userTitle) ? userTitle : (oldMeta.title || date),
      location: isMeaningful(userLoc) ? userLoc : (oldMeta.location || ''),
      province: userProv || oldMeta.province || '',
      description: isMeaningful(userDesc) ? userDesc : (oldMeta.description || ''),
      tags: [],                                                    // 管理面板不再写标签
    };
    if (oldMeta.cover) meta.cover = oldMeta.cover;     // 保留旧封面设置

    elAdminUpload.disabled = true;
    adminStatus('上传中…', true);

    try {
      // ① 照片：续号命名（已有 01…12 则新图为 13、14…）逐个压缩 + 上传 + 统计失败
      //    没选照片（仅更新相册信息）时跳过此循环
      const results = [];
      const failed = [];
      const appendMode = startNum > 1;   // 已有照片 = 补传模式
      const isMetaOnly = adminFiles.length === 0;
      if (isMetaOnly) {
        adminStatus('仅更新相册信息（无照片）…', true);
      }
      for (let i = 0; i < adminFiles.length; i++) {
        const f = adminFiles[i];
        const num = String(startNum + i).padStart(2, '0');
        const ext = extOf(f.name) || '.jpg';
        const name = `${num}${ext}`;
        const path = `${root}/${folder}/${name}`;
        try {
          const b64 = await fileToBase64(f);
          await ghPutFile(token, path, b64, `upload photo ${folder}/${name}`);
          results.push(name);
          adminStatus(`上传照片中… ${i + 1}/${adminFiles.length}`, true);
        } catch (e) {
          failed.push({ name: f.name, err: e.message || String(e) });
          adminStatus(`上传照片中… ${i + 1}/${adminFiles.length}（${f.name} 失败，已跳过）`, false);
        }
      }

      // ② meta.json
      const metaPath = `${root}/${folder}/meta.json`;
      const metaB64 = utf8ToBase64(JSON.stringify(meta, null, 2));
      await ghPutFile(token, metaPath, metaB64, `add album meta ${folder}`);

      const failHtml = failed.length
        ? `<br>⚠️ 失败 ${failed.length} 张：${failed.map(f => `${escapeHtml(f.name)}（${escapeHtml(f.err.slice(0, 30))}）`).join('，')}<br>请尝试把原图压缩后再传（建议单张 ≤ 5MB）。`
        : '';
      const photoPart = isMetaOnly
        ? `✅ 相册信息已更新（未传照片）`
        : `${appendMode ? '✅ 补传完成' : '✅ 上传完成'}：${results.length} 张照片${appendMode ? `（已续号为 ${String(startNum).padStart(2, '0')} 起）` : ''}`;
      adminStatus(
        `${photoPart} + 相册信息已发布到 GitHub。<br>` +
        `jsDelivr 同步约 1–5 分钟，之后刷新页面即可看到「${escapeHtml(meta.title)}」。` +
        failHtml,
        failed.length === 0
      );
      adminFiles = [];
      renderAdminFileList();
      // 上传成功后自动刷新相册列表，让新相册立即可见（无需手动刷新页面）
      setTimeout(() => { try { loadAlbums(); } catch { /* 刷新失败不影响上传结果 */ } }, 1500);
    } catch (e) {
      adminStatus(`❌ 上传失败：${escapeHtml(e.message)}`, false);
    } finally {
      const hasMetaInput = !!(elAdminTitle.value.trim() || elAdminLocation.value.trim() || elAdminDesc.value.trim());
      elAdminUpload.disabled = adminFiles.length === 0 && !hasMetaInput;
    }
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

    // 管理面板
    elAdminFab.addEventListener('click', () => {
      elAdminOverlay.hidden = false;
      initAdmin();
    });
    elAdminClose.addEventListener('click', () => { elAdminOverlay.hidden = true; });
    elAdminOverlay.addEventListener('click', (e) => {
      if (e.target === elAdminOverlay) elAdminOverlay.hidden = true;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !elAdminOverlay.hidden) elAdminOverlay.hidden = true;
    });

    elAdminTokenSave.addEventListener('click', () => {
      const t = elAdminToken.value.trim();
      if (!t) { adminStatus('密钥不能为空', false); return; }
      localStorage.setItem(TOKEN_KEY, t);
      GH.token = t;
      elAdminTokenOk.textContent = '✓ 已保存';
      elAdminTokenActions.hidden = false;
      adminStatus('密钥已保存（仅存本机浏览器，不会上传服务器）', true);
      // 保存后立即用新 token 重新拉取数据，无需手动刷新
      try { loadAlbums(); } catch { /* 数据重载失败不影响密钥保存 */ }
    });
    elAdminTokenClear.addEventListener('click', () => {
      localStorage.removeItem(TOKEN_KEY);
      elAdminToken.value = '';
      GH.token = '';
      elAdminTokenActions.hidden = true;
      adminStatus('密钥已清除', true);
    });

    elAdminFiles.addEventListener('change', () => {
      adminFiles = [...elAdminFiles.files];
      renderAdminFileList();
      adminStatus('');
    });
    // 表单输入时刷新按钮状态（仅填信息不传照片也能上传）
    [elAdminTitle, elAdminLocation, elAdminProvince, elAdminDesc].forEach((el) => {
      el.addEventListener('input', () => { renderAdminFileList(); });
      el.addEventListener('change', () => { renderAdminFileList(); });
    });
    elAdminUpload.addEventListener('click', doUpload);
  }

  /* ---------- 启动 ---------- */
  function init() {
    // 页面加载时立即从 localStorage 恢复 token（供 fetchAllMeta / 设封面使用）
    try {
      const savedToken = localStorage.getItem(TOKEN_KEY);
      if (savedToken) GH.token = savedToken;
    } catch { /* localStorage 不可用时忽略 */ }
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
