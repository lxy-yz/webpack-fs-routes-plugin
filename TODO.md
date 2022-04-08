<!-- -Support RR 5 -->
<!-- - Support RR 6 -->
<!-- - fix failing test w/ vitest.mock 
    https://github.com/vitest-dev/vitest/tree/main/examples/mocks
    https://github.com/vitest-dev/vitest/commit/4dbefb59cd673f5620266c882e50a1744d4fcc99
    https://github.dev/vitest-dev/vitest/blob/8586ffdf0c1688c05f24a45919430749517c6820/packages/vitest/src/node/plugins/mock.ts#L35 -->
<!-- - Debug build dts error 
    ```
    src/index.ts(52,1): error TS2742: The inferred type of 'default' cannot be named without a reference to '.pnpm/webpack@5.70.0/node_modules/webpack'. This is likely not portable. A type annotation is necessary.
    ``` -->

- Update readme for build & release
- Cleanup `package.json` unplugin fork version 
