// Next.js の static image import 用 module 宣言。
//
// 通常は `next-env.d.ts` から `next/image-types/global` が参照されて
// 提供されるが、`next-env.d.ts` は git-ignore されており、
// `next dev` / `next build` が走るまで生成されない。
// CI は初回 build より前に `tsc --noEmit` を実行するため、その時点では
// 宣言が存在せず `.png` の import が TS2307 で fail する。
// このファイルで最低限の宣言を committed 状態で提供することで、
// 初回 build 前でも type-check が成功するようにする。

declare module '*.png' {
  import type { StaticImageData } from 'next/image';
  const src: StaticImageData;
  export default src;
}
