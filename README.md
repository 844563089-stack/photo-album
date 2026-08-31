# 📷 阿包旅行图册

一个零成本、零密钥的静态旅行摄影网站。把照片按日期文件夹推到 GitHub，访问网站自动展示——上传即更新。

> 图床密钥？不存在的。公开 GitHub 仓库 + jsDelivr CDN 全部免认证。

## 🎯 它是什么

- 单页静态站点（HTML / CSS / JS，零构建）
- 通过 GitHub Contents API 读取仓库目录
- jsDelivr CDN 全球加速图片（国内访问也快）
- 暗色主题、左侧时间轴、省份地图点亮、标签筛选、全文搜索、瀑布流相册、键盘 / 触屏灯箱

## ✨ 功能清单

| 功能 | 说明 |
|------|------|
| 🖼️ 相册网格 | 桌面一排 3 个 / 平板 2 个 / 手机 1 个 |
| 🔢 排序 | 按相册日期自动排序（最新在前） |
| 📍 地图点亮 | 省份色块 + 城市光点双层点亮（hover 查看去过次数） |
| 🏷️ 标签筛选 | 点选标签组合筛选（多个标签取并集） |
| 🔍 全文搜索 | 搜相册名 / 地点 / 日期 / 省份 / 标签 |
| 📊 数据统计 | 相册数 / 照片数 / 去过省份 / 去过城市 |
| 💬 相册简介 | 每个相册一句话心情（meta.json 的 `description`） |
| 🖼️ 照片标注 | 每张照片底部命名 / 景点标注（meta.json 的 `captions`，或默认文件名） |
| 🖼️ 灯箱 | 大图预览、键盘 ←→、触屏滑动、Esc 关闭 |

## 🚀 5 分钟搭建

### 1. 创建 GitHub 仓库

```bash
# 把本目录的文件推到 GitHub
git init
git add .
git commit -m "init: photo album site"
git branch -M main
git remote add origin git@github.com:YOUR_NAME/photo-album.git
git push -u origin main
```

> 仓库必须是 **Public**（公开）。私有仓库需要填 token，已为你预留字段。

### 2. 改配置

打开 `config.js`，把 `github.owner` 和 `github.repo` 改成你自己的：

```js
github: {
  owner: 'your-github-username',   // ← 改这里
  repo:  'photo-album',             // ← 改这里
  branch: 'main',
  photosPath: 'photos',
},
```

### 3. 改站点信息（可选）

```js
site: {
  title:            '阿包旅行图册',
  tagline:          '记录生活，定格美好',
  subtitle:         '用镜头捕捉每一个值得珍藏的瞬间',
  xiaohongshuUrl:   'https://www.xiaohongshu.com/user/profile/你的主页ID',
  xiaohongshuLabel: '小红书 @你的ID',
  footer:           '© 阿包旅行图册 · Powered by GitHub + jsDelivr',
},
```

### 4. 上传照片（基本用法）

在 GitHub 仓库网页上：

```
photos/
├── 2026-05-16/
│   ├── 01.jpg
│   ├── 02.jpg
│   └── 03.jpg
├── 2026-05-01/
│   └── ...
```

文件夹名用 `YYYY-MM-DD` 格式（`2026-08-31`），也可以带文字（`2026-05-16武汉东湖`，仍按日期识别）。
封面默认取文件夹内第一张图（可按文件名排序控制），或指定 `cover.jpg`。

> **支持的格式**：`.jpg .jpeg .png .webp .avif .gif`
> **建议尺寸**：封面 2000px 以内，单张 < 2 MB

### 5. 上传照片（进阶：地点 / 标签 / 地图点亮）

在相册文件夹里放一个 `meta.json`，就能点亮地图、显示地点、标签与照片标注：

```json
{
  "title": "武汉东湖",
  "location": "武汉",
  "province": "湖北",
  "description": "樱花季的东湖，骑行绿道，湖风正好。",
  "tags": ["城市漫步", "湖光"],
  "cover": "cover.jpg",
  "captions": {
    "01.jpg": "东湖绿道入口",
    "02.jpg": "磨山樱园"
  }
}
```

| 字段 | 作用 |
|------|------|
| `title` | 相册标题（不填则显示日期） |
| `location` | **城市名**，用于地图城市点亮 + 卡片显示 + 「去过城市」统计 |
| `province` | **省份名**，用于省份点亮（写"湖北"或"湖北省"都行，会自动归一化） |
| `description` | 一句话简介（去了哪里、什么心情），显示在卡片和详情页 |
| `tags` | 标签数组，用于标签筛选 |
| `cover` | 封面文件名（可选，默认第一张） |
| `captions` | 照片标注映射：`文件名 → 给这张照片起的名字/景点名`（可选，缺省显示文件名） |

不加 `meta.json` 完全不影响使用，只是没有地点、标签和标注信息。

### 6. 部署上线（任选其一）

#### 方式 A：Vercel（推荐，国内访问友好）

1. 访问 https://vercel.com/new
2. 导入这个仓库
3. 直接 Deploy，30 秒拿到一个 `*.vercel.app` 域名
4. 想绑自己的域名？在 Vercel 控制台 → Settings → Domains 添加

#### 方式 B：Cloudflare Pages

1. 访问 https://pages.cloudflare.com
2. 连接 GitHub，选中这个仓库
3. 构建命令留空，输出目录填 `/`
4. Deploy，同样是 `*.pages.dev`

#### 方式 C：GitHub Pages

直接在仓库 Settings → Pages → Branch: `main` / folder: `/` 即可。免费但国内偶有抽风。

## 📁 文件结构

```
photo-album/
├── index.html        # 单页站点入口
├── style.css         # 样式
├── app.js            # 逻辑（GitHub API + meta 解析 + 时间轴/搜索/地图 + 灯箱）
├── config.js         # ← 你唯一需要手动改的文件
├── README.md         # 本说明
├── .gitignore        # 忽略上传中的临时文件
├── _tools/
│   ├── photo-tool.mjs        # ← 本地 CLI 工具：new / edit / push
│   ├── generate_demo_images.py
│   ├── shot.js               # 截图工具（开发用）
│   └── smoke.js              # 逻辑冒烟测试（开发用）
└── photos/           # 你的相册（按日期命名子目录）
```

## 📤 上传照片（三种方式，按需选）

### 方式 A：GitHub 网页拖文件（**新手首选**）

> 📖 完整图文教程（可浏览器打开）：`上传照片教程.html`
> 官方链接：注册 [github.com/signup](https://github.com/signup) · 建仓库 [github.com/new](https://github.com/new) · 上传帮助 [docs.github.com/zh/repositories/working-with-files](https://docs.github.com/zh/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)

**六步走（第一次约 10 分钟）：**

1. **注册** GitHub 账号（[github.com/signup](https://github.com/signup)）
2. **建公开仓库** `photo-album`（[github.com/new](https://github.com/new) → 名字填 photo-album → 选 **Public**）页面底部 3 个可选选项：
   - Add README 添加 README → **可勾**（GitHub 给你生成占位 README，我们后面传文件会覆盖）
   - Add .gitignore 添加 .gitignore → **不勾**（项目自带）
   - Add license 添加许可证 → **推荐勾 MIT**（最宽松开放许可）
   点 <code>Create repository</code>
3. **把网站文件放进仓库**（只做一次）：仓库页 → `Add file` → `Upload files` → 拖入 index.html / style.css / app.js / config.js / README.md / photos/ → Commit
4. **建日期文件夹**：`Add file` → `Create new file` → 文件名输入 `photos/2026-08-31/meta.json`（带斜杠自动建目录）→ 粘贴 meta 内容（不写就填 `{}`）→ Commit
5. **拖照片**：进 `photos/2026-08-31/` → `Add file` → `Upload files` → 拖入照片（≤100 张/次，单张 < 25MB）→ Commit
6. **等 5 分钟** jsDelivr 同步 → 刷新网站

**以后每次上传 = 第 4 步（新建日期文件夹）+ 第 5 步（拖照片）+ 等 5 分钟。**

```text
photos/
├── 2026-08-31/          ← 每次旅行一个日期文件夹
│   ├── meta.json        ← 标题/地点/标签（可留空 {}）
│   ├── 01.jpg           ← 数字前缀决定相册内排序
│   └── 02.jpg
├── 2026-05-16/
└── ...
```

### 方式 B：本地 CLI 工具（`_tools/photo-tool.mjs`）

适合已经有 git 仓库在本地、想半自动化的人：

```bash
cd photo-album/

node _tools/photo-tool.mjs new
# 交互式问：日期 / 标题 / 城市 / 省份 / 描述 / 标签
# 自动生成 photos/<日期>/meta.json
# 提示你把照片放进 photos/<日期>/ 目录

# 照片放好后：
node _tools/photo-tool.mjs push
# 自动 git add + commit + push
# 5 分钟后 jsDelivr 同步，刷新网站可见

# 改既有相册的信息：
node _tools/photo-tool.mjs edit 2026-08-31
# 重新生成 meta.json，不影响照片文件
```

不需要任何依赖（用 Node 18+ 自带的 readline）。如果想改照片，可以手动 `mv` 到对应目录。

### 方式 C：纯 Git（开发者）

```bash
git add photos/2026-08-31/
git commit -m "add: 武汉东湖相册"
git push origin main
```

---

## ✏️ 编辑相册信息

三种方式都能编辑 `meta.json`：

| 需求 | 推荐工具 |
|---|---|
| 我就想改个标题 / 描述 | `node _tools/photo-tool.mjs edit 2026-08-31` → 一问一答改字段 |
| 一次批量改很多相册 | 用代码编辑器直接编辑 `photos/*/meta.json` 多个 |
| 我怕命令行 | GitHub Web：进文件夹 → 点 `meta.json` → 笔图标编辑 |

### `meta.json` 字段速查

```json
{
  "title":       "相册标题",
  "location":    "城市名（中文）",
  "province":    "省份名（如"湖北"或"湖北省"都行，自动归一化）",
  "description": "一句话心情",
  "tags":        ["标签1", "标签2"],
  "cover":       "cover.jpg",
  "captions":    { "01.jpg": "东湖绿道入口" }
}
```

不填任何字段都行——本地默认显示日期。仅有 photo 文件也照样能展示（只是没地点/标签）。

## ❌ 怎么上传新的照片到**老的**相册？

随便往 `photos/2026-08-31/` 拖新照片 → 重新 push，**会自动出现在相册里**（按字母序排）。想排序更精细：用数字前缀，如 `01.jpg`、`02.jpg`、`03.jpg`。

## 🔐 关于"密钥不写代码"

采用此方案时 **不需要任何密钥**：
- 公开仓库的 Contents API 走免认证读取
- 图片和 meta.json 走 jsDelivr CDN 也不需密钥

但 GitHub 公开 API 限 **每小时 60 次**（按 IP）。相册多或访问量大时，可在 `config.js` 加一个 fine-grained token：

```js
github: {
  owner: 'your-name',
  repo:  'photo-album',
  branch: 'main',
  photosPath: 'photos',
  token: 'ghp_xxxxxxxxxxxxx',   // ← 只勾 Public contents: read
},
```

token 的限频是 5000 次/小时。**此 token 仍会暴露在静态文件里**，仅适合个人非公开场景；正式生产请改走你自己的后端代理转发。

## 🎨 移动端体验

- 时间轴收成顶部可横向滑动的胶囊条（年份 + 月份）
- 单列相册卡片 / 双列瀑布流照片
- 灯箱支持 **左右滑动** 切换
- 触屏禁用 hover 动画（不抖动）
- 关闭动效完全可选（`prefers-reduced-motion`）

## ⌨️ 快捷键（灯箱）

| 按键 | 作用 |
|------|------|
| `←` / `→` | 上一张 / 下一张 |
| `Esc` | 关闭灯箱 |
| 点击背景 | 关闭灯箱 |

## 🛠️ 自定义小贴士

- **改主色**：编辑 `style.css` 中的 `--accent` 变量
- **改主题色**：编辑 `--bg` `--fg` `--fg-muted` 三个变量
- **修改相册排序**：`config.js` 中 `sort: 'asc'` 改为最早相册在前

## 📜 License

MIT — 自用 / 商用 / 改造都行，记得给个 star ✨
