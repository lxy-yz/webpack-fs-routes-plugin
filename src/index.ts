import { createUnplugin } from "unplugin"
import chokidar from "chokidar"
import path from "path"
import fsp from "fs/promises"
import EventEmitter from "events"

import type { ReactRouterRoute, Route, UserOptions } from "./types"

export const FsRoutesPlugin = createUnplugin<UserOptions>((options) => {
  // Include file extension to avoid being processed by file loader fallback in CRA
  // otherwise would not be needed i.e. custom webpack config.
  // https://github.com/facebook/create-react-app/blob/eee8491d57d67dd76f0806a7512eaba2ce9c36f0/packages/react-scripts/config/webpack.config.js#L509
  const VIRTUAL_ROUTE_IDS = ["~fs-routes"]
  const ESM_EXTENSION = ".mjs"

  const ctx = new Context(options)

  return {
    name: "webpack-fs-routes-unplugin",

    buildStart() {
      ctx.init()
    },

    resolveId(id, importer) {
      if (!VIRTUAL_ROUTE_IDS.includes(id)) return null
      ctx.emit("importRoutes", importer)
      return id + ESM_EXTENSION
    },

    async load(id) {
      if (!VIRTUAL_ROUTE_IDS.map((s) => s + ESM_EXTENSION).includes(id))
        return null
      return ctx.resolveRoutes()
    },

    // custom hooks for webpack
    // webpack(compiler) {}
  }
})

export default FsRoutesPlugin.webpack

//////////////////////////////////////////////////////////////////////
class Context extends EventEmitter {
  routeMap = new Map<string, { path: string; route: string }>()
  caseSensitive: boolean

  private _routesDir: string
  private _routeExtensions: Array<string>
  private _isDev: boolean
  private _routesImporter?: string
  // private _devServer: WebpackDevServer | null = null;

  constructor({
    routesDir,
    routeExtensions,
    isDev,
    caseSensitive,
  }: {
    routesDir?: string
    routeExtensions?: Array<string>
    isDev?: boolean
    caseSensitive?: boolean
  } = {}) {
    super()
    this._routesDir = routesDir ?? path.resolve("src/pages")
    this._routeExtensions = routeExtensions ?? [".tsx"]
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

    this._searchGlob()
  }

  resolveRoutes() {
    return resolveRoutes(this)
  }

  // TODO: use glob instead of fs.readdir to exclude test files
  async _searchGlob() {
    for (const route of await this._getFiles(this._routesDir)) {
      await this._addRoute(route)
    }
  }

  _setupWatcher() {
    const watcher = chokidar
      .watch(this._routesDir, {
        persistent: true,
        ignoreInitial: true,
      })
      .on("add", async (route) => {
        this._addRoute(route)
        this._invalidate()
      })
      .on("unlink", async (route) => {
        this._removeRoute(route)
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

  _addRoute(route: string) {
    // Example:
    //   importer: <rootDir>/_virtual_~fs-routes.mjs
    //   importee: import Route53 from '<rootDir>/src/pages/index.tsx'
    this.routeMap.set(route, {
      path: route,
      route: path
        .relative(this._routesDir, route)
        .replace(path.extname(route), ""),
    })
  }

  _removeRoute(route: string) {
    this.routeMap.delete(route)
  }

  async _getFiles(dir: string) {
    const res: Array<string> = []
    for (const filename of await fsp.readdir(dir)) {
      const file = path.resolve(dir, filename)
      const stat = await fsp.lstat(file)

      if (stat.isDirectory()) {
        res.push(...(await this._getFiles(file)))
      } else if (stat.isFile()) {
        if (this._routeExtensions.includes(path.extname(file))) {
          res.push(file)
        }
      }
    }
    return res
  }
}

//////////////////////////////////////////////////////////////////////
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
    return { name: normalizedName.toLowerCase(), path: normalizedPathNode }
  }

  const fsRoutes = [...routeMap.values()].sort((a, b) => {
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

  fsRoutes.forEach((fsRoute) => {
    const pathNodes = fsRoute.route.split("/")
    let parentRoutes = routes
    const route: Route = {
      path: "",
      name: "",
      component: fsRoute.path,
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
