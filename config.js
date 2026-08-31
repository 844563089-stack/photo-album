/* 正式配置 ── 指向阿包的 GitHub 仓库
 * 若仓库名仍为空格或中文，请在 GitHub Settings 里 Rename 为 photo-album（推荐）
 */
window.PHOTO_CONFIG = {
  github: { owner: '844563089-stack', repo: 'photo-album', branch: 'main', photosPath: 'photos', token: '' },
  cdn: 'jsdelivr',
  site: {
    title:           '阿包旅行图册',
    tagline:         '记录生活，定格美好',
    subtitle:        '用镜头捕捉每一个值得珍藏的瞬间',
    xiaohongshuUrl:  'https://www.xiaohongshu.com/user/profile/580754b6a9b2ed5167fdf297',
    xiaohongshuLabel:'小红书 @阿包 Booo',
    footer:          '© 阿包旅行图册 · 记录每一次出发',
  },
  demo: true,            // 真实相册接管后改为 false
  sort: 'desc',
};
