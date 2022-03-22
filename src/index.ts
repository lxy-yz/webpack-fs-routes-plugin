import { createUnplugin } from "unplugin"
import chokidar from "chokidar"
import path from "path"
import fsp from "fs/promises"
import EventEmitter from "events"

// Next.js style page routes
// https://nextjs.org/docs/routing/introduction
//
// Examples:
//   pages/index.js → /
//   pages/blog/index.js → /blog
// nested
//   pages/blog/first-post.js → /blog/first-post
//   pages/dashboard/settings/username.js → /dashboard/settings/username
// dynamic
//   pages/blog/[slug].js → /blog/:slug (/blog/hello-world)
//   pages/[username]/settings.js → /:username/settings (/foo/settings)
//   pages/post/[...all].js → /post/* (/post/2020/id/title)

type Options = {
  /**
   * The path to the directory containing your page routes
   * @default <rootDir>/src/pages
   */
  pagesDir?: string
  /**
   * Supported file extensions for page routes
   * @default ['.tsx']
   */
  pageExtensions?: Array<string>
  /**
   * Development build
   */
  isDev: boolean
  /**
   * @default false
   */
  caseSensitive?: boolean
  /**
   * @default 5
   */
  reactRouterVersion?: number
}

export const PageRoutesPlugin = createUnplugin<Options>((options) => {
  // Include file extension to avoid being processed by file loader fallback in CRA
  // otherwise would not be needed i.e. custom webpack config.
  // https://github.com/facebook/create-react-app/blob/eee8491d57d67dd76f0806a7512eaba2ce9c36f0/packages/react-scripts/config/webpack.config.js#L509
  const MODULE_IDS = ["~fs-routes.js", "~fs-routes.ts"]

  const ctx = new Context(options)

  return {
    name: "page-routes-unplugin",

    buildStart() {
      ctx.init()
    },

    resolveId(id, importer) {
      if (!MODULE_IDS.includes(id)) return null
      ctx.emit("importRoutes", importer)
      return id
    },

    async load(id) {
      if (!MODULE_IDS.includes(id)) return null
      return ctx.resolveRoutes()
    },

    // custom hooks for webpack
    // webpack(compiler) {}
  }
})

export default PageRoutesPlugin.webpack

class Context extends EventEmitter {
  routeMap = new Map<string, { path: string; route: string }>()
  caseSensitive: boolean

  private _pagesDir: string
  private _pageExtensions: Array<string>
  private _isDev: boolean
  private _routesImporter?: string
  // private _devServer: WebpackDevServer | null = null;

  constructor({
    pagesDir,
    pageExtensions,
    isDev,
    caseSensitive,
  }: {
    pagesDir?: string
    pageExtensions?: Array<string>
    isDev?: boolean
    caseSensitive?: boolean
  } = {}) {
    super()
    this._pagesDir = pagesDir ?? path.join("src", "pages")
    this._pageExtensions = pageExtensions ?? [".tsx"]
    this._isDev = isDev ?? false
    this.caseSensitive = caseSensitive ?? false
  }

  async init() {
    if (this._isDev) {
      const watcher = this._setupWatcher()
      ;["SIGINT", "SIGTERM"].forEach((signal) => {
        process.on(signal, () => {
          watcher.close()
          process.exit()
        })
      })

      this.once("importRoutes", (importer) => {
        this._routesImporter = importer
      })
    }

    this._searchPages()
  }

  resolveRoutes() {
    return resolveRoutes(this)
  }

  async _searchPages() {
    for (const page of await this._getFiles(this._pagesDir)) {
      await this._addPage(page)
    }
  }

  _setupWatcher() {
    const watcher = chokidar
      .watch(this._pagesDir, {
        persistent: true,
        ignoreInitial: true,
      })
      .on("add", async (page) => {
        this._addPage(page)
        this._invalidate()
      })
      .on("unlink", async (page) => {
        this._removePage(page)
        this._invalidate()
      })

    return watcher
  }

  async _invalidate() {
    // TODO: figure out a better way to invalidate for hmr
    this._routesImporter &&
      (await fsp.writeFile(
        this._routesImporter,
        await fsp.readFile(this._routesImporter),
      ))
    // @ts-ignore
    // this._devServer.invalidate(); // didn't work :/
  }

  _addPage(page: string) {
    const route = path
      .relative(this._pagesDir, page)
      .replace(path.extname(page), "")

    // Example:
    // importer: <rootDir>/_virtual_~fs-routes.js
    // importee: import Route53 from './src/pages/index.tsx'
    this.routeMap.set(page, {
      path: "./" + page,
      route,
    })
  }

  _removePage(page: string) {
    this.routeMap.delete(page)
  }

  // TODO: use glob instead of fs.readdir to exclude test files
  async _getFiles(dir: string) {
    const res: Array<string> = []
    for (const filename of await fsp.readdir(dir)) {
      const file = path.join(dir, filename)
      const stat = await fsp.lstat(file)

      if (stat.isDirectory()) {
        res.push(...(await this._getFiles(file)))
      } else if (stat.isFile()) {
        if (this._pageExtensions.includes(path.extname(file))) {
          res.push(file)
        }
      }
    }
    return res
  }
}

interface Route {
  /**
   * name or identifier of current route
   */
  name: string
  /**
   * <Route path />
   */
  path: string
  /**
   * import specifier of <Route component />
   */
  component: string
  /**
   * child routes
   * @default []
   */
  children?: Array<Route>
}

const DYNAMIC_ROUTE_RE = /^\[(.+)\]$/
const CATCH_ALL_ROUTE_RE = /^\[\.{3}/

async function resolveRoutes(ctx: Context) {
  const { routeMap, caseSensitive } = ctx

  const normalizeCase = (str: string) =>
    caseSensitive ? str : str.toLowerCase()
  const isIndexRoute = (node: string) => normalizeCase(node) === "index"
  const buildRoutePathAndName = (node: string) => {
    const isDynamic = DYNAMIC_ROUTE_RE.test(node)
    const isCatchAll = CATCH_ALL_ROUTE_RE.test(node)
    const normalizedName = isDynamic
      ? isCatchAll
        ? "all"
        : node.replace(DYNAMIC_ROUTE_RE, "$1")
      : node
    let normalizedPathNode = normalizeCase(normalizedName)
    if (isIndexRoute(node)) {
      normalizedPathNode = "/"
    } else if (isDynamic) {
      if (isCatchAll) {
        normalizedPathNode = "/(.*)"
      } else {
        normalizedPathNode = `/:${normalizedPathNode}`
      }
    } else {
      normalizedPathNode = `/${normalizedPathNode}`
    }
    return { name: normalizedName, path: normalizedPathNode }
  }

  const pageRoutes = [...routeMap.values()].sort((a, b) => {
    // parent route first, catchall route last
    const slashCount = (s: string) => s.split("/").filter(Boolean).length
    if (CATCH_ALL_ROUTE_RE.test(a.route)) {
      return 1
    }
    if (CATCH_ALL_ROUTE_RE.test(b.route)) {
      return -1
    }
    return slashCount(a.route) - slashCount(b.route)
  })
  const routes: Array<Route> = []

  pageRoutes.forEach((page) => {
    const pathNodes = page.route.split("/")
    let parentRoutes = routes
    const route: Route = {
      path: "",
      name: "",
      component: page.path,
    }

    for (let i = 0; i < pathNodes.length; i++) {
      const node = pathNodes[i]
      const { name, path } = buildRoutePathAndName(node)
      route.path += path
      route.name += route.name ? `-${name}` : name
      const parent = parentRoutes.find((node) => node.name === route.name)
      if (parent) {
        parent.children = parent.children || []
        parentRoutes = parent.children
      }
    }

    parentRoutes.push(route)
  })

  const finalRoutes = prepareReactRoutes(routes)
  const code = generateCode(finalRoutes)
  // TODO:
  // debugger
  return code
}

interface ReactRouterRoute extends Omit<Route, "name" | "children"> {
  /**
   * <Route exact />
   * @default false
   */
  exact?: boolean
  /**
   * child routes
   * @default []
   */
  routes?: Array<ReactRouterRoute>
}

function prepareReactRoutes(routes: Array<Route>): Array<ReactRouterRoute> {
  const res: Array<ReactRouterRoute> = []
  for (const route of routes) {
    const { name, children, ...rawRoute } = route
    const newRoute: ReactRouterRoute = { ...rawRoute, exact: false }
    if (route.children) {
      newRoute.routes = prepareReactRoutes(route.children)
    }
    if (route.path.endsWith("/")) {
      newRoute.exact = true
    }
    res.push(newRoute)
  }
  return res
}

function generateCode(routes: Array<ReactRouterRoute>) {
  const { imports, stringRoutes } = stringifyRoutes(routes)
  imports.push('import React from "react"')
  return `${imports.join(
    ";\n",
  )};\n\nconst routes = ${stringRoutes};\n\nexport default routes;`
}

function stringifyRoutes(preparedRoutes: Array<ReactRouterRoute>) {
  const componentRE = /"(?:element|component)": ("(.*?)")/g
  const imports: Array<string> = []

  const stringRoutes = JSON.stringify(preparedRoutes, null, 2).replace(
    componentRE,
    componentReplacer,
  )

  return {
    imports,
    stringRoutes,
  }

  function componentReplacer(
    str: string,
    replaceStr: string,
    path: string,
    offset: number,
  ) {
    const importName = "route" + offset
    const importStr = `import ${importName} from "${path}"`
    if (!imports.includes(importStr)) imports.push(importStr)
    return str.replace(replaceStr, importName)
  }
}
