# webpack-fs-routes-plugin

Next.js style file system routes https://nextjs.org/docs/routing/introduction.

<details>
  <summary>Examples</summary>
  
    ```
    index route
        pages/index.js → /
        pages/blog/index.js → /blog
    nested route
        pages/blog/first-post.js → /blog/first-post
        pages/dashboard/settings/username.js → /dashboard/settings/username
    dynamic route
        pages/blog/[slug].js → /blog/:slug (/blog/hello-world)
        pages/[username]/settings.js → /:username/settings (/foo/settings)
        pages/post/[...all].js → /post/* (/post/2020/id/title)
    ```
</details>

## Install

```bash
npm i webpack-fs-routes-plugin
```

## Usage

```ts
import WebpackFsRoutesPlugin from 'webpack-fs-routes-plugin'

export interface UserOptions {
  /**
   * The path to the directory containing your page routes
   * @default <rootDir>/src/pages
   */
  routesDir?: string
  /**
   * Supported file extensions for page routes
   * @default ['.tsx']
   */
  routeExtensions?: string[]
  /**
   * Development build
   * @default false
   */
  isDev?: boolean
  /**
   * @default false
   */
  caseSensitive?: boolean
  /**
   * @default 5
   */
  reactRouterVersion?: 5 | 6
}
const options: UserOptions = {}

export default {
  // ...
  plugins: [
    WebpackFsRoutesPlugin(options),
  ],
}
```

Or checkout `config-overrides.js` in examples/.

---

<!-- [![npm version](https://badgen.net/npm/v/webpack-fs-routes-plugin)](https://npm.im/webpack-fs-routes-plugin) [![npm downloads](https://badgen.net/npm/dm/webpack-fs-routes-plugin)](https://npm.im/webpack-fs-routes-plugin) -->


## Sponsors

[![sponsors](https://sponsors-images.lxy-yz.sh/sponsors.svg)](https://github.com/sponsors/lxy-yz)

## License

MIT &copy; [lxy-yz](https://github.com/sponsors/lxy-yz)
