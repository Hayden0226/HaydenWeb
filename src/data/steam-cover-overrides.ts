// Steam 封面覆写：个别游戏在 CDN 上没有标准的 library_600x900 竖版图，
// 这里补上可用的竖版封面地址。4214820 走商店资产 CDN 的 hash 路径；
// 670290 的竖版图只有本机 Steam 客户端缓存里有，已作为静态资源提交到 public/covers/。
export const STEAM_COVER_OVERRIDES: Record<number, string> = {
  4214820: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4214820/d2b9b1c7433d22cd1c3c312d45c3230645f275ad/library_capsule.jpg',
  670290: '/covers/670290.jpg',
};
