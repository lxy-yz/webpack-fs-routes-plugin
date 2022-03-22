**💛 You can help the author become a full-time open-source maintainer by [sponsoring him on GitHub](https://github.com/sponsors/egoist).**

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

---

# my-ts-lib

[![npm version](https://badgen.net/npm/v/my-ts-lib)](https://npm.im/my-ts-lib) [![npm downloads](https://badgen.net/npm/dm/my-ts-lib)](https://npm.im/my-ts-lib)

## Using this template

- Search `my-ts-lib` and replace it with your custom package name.
- Search `egoist` and replace it with your name.

Features:

- Package manager [pnpm](https://pnpm.js.org/), safe and fast
- Release with [semantic-release](https://npm.im/semantic-release)
- Bundle with [tsup](https://github.com/egoist/tsup)
- Test with [vitest](https://vitest.dev)

To skip CI (GitHub action), add `skip-ci` to commit message. To skip release, add `skip-release` to commit message.

## Install

```bash
npm i my-ts-lib
```

## Sponsors

[![sponsors](https://sponsors-images.egoist.sh/sponsors.svg)](https://github.com/sponsors/egoist)

## License

MIT &copy; [EGOIST](https://github.com/sponsors/egoist)
