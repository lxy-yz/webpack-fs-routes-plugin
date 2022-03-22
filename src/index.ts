import { createUnplugin } from "unplugin"
import chokidar from "chokidar"
import path from "path"
import fsp from "fs/promises"

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
  pagesDir: string
  isDev: boolean
  caseSensitive?: boolean
}

export const PageRoutesPlugin = createUnplugin<Options>((options) => {
  const MODULE_ID = "~routes"

  const ctx = new Context(options)

  return {
    name: "page-routes-unplugin",

    buildStart() {
      ctx.init()
    },

    resolveId(id) {
      if (id !== MODULE_ID) return null
      return id
    },

    async load(id) {
      if (id !== MODULE_ID) return null
      return ctx.resolveRoutes()
    },

    // custom hooks for webpack
    // webpack(compiler) {}
  }
})

export default PageRoutesPlugin.webpack

class Context {
  routeMap = new Map<string, { path: string; route: string }>()
  caseSensitive: boolean

  private _pagesDir: string
  private _isDev: boolean
  // private _devServer: WebpackDevServer | null = null;

  constructor({
    pagesDir,
    isDev,
    caseSensitive,
  }: { pagesDir?: string; isDev?: boolean; caseSensitive?: boolean } = {}) {
    this._pagesDir = pagesDir ?? "pages"
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
    }

    this._searchGlob()
  }

  resolveRoutes() {
    return resolveRoutes(this)
  }

  async _searchGlob() {
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
    const routesImporter = path.resolve("src/routes.ts")
    await fsp.writeFile(routesImporter, await fsp.readFile(routesImporter))
    // @ts-ignore
    // this._devServer.invalidate(); // didn't work :/
  }

  _addPage(page: string) {
    const route = path
      .relative(this._pagesDir, page)
      .replace(path.extname(page), "")
    this.routeMap.set(page, {
      path: page,
      route,
    })
  }

  _removePage(page: string) {
    this.routeMap.delete(page)
  }

  async _getFiles(dir: string) {
    const res: Array<string> = []
    for (const filename of await fsp.readdir(dir)) {
      const file = path.join(dir, filename)
      const stat = await fsp.lstat(file)

      if (stat.isDirectory()) {
        res.push(...(await this._getFiles(file)))
      } else if (stat.isFile()) {
        // only include jsx/tsx as route files
        if ([".jsx", ".tsx"].includes(path.extname(file))) {
          res.push(file)
        }
      }
    }
    return res
  }
}

interface Route {
  path: string
  component: string
  name: string
  exact?: boolean
  children?: Array<Route>
}

const dynamicRouteRE = /^\[(.+)\]$/
const catchAllRouteRE = /^\[\.{3}/

async function resolveRoutes(ctx: Context) {
  const { routeMap, caseSensitive } = ctx
  const normalizeCase = (str: string) =>
    caseSensitive ? str : str.toLowerCase()

  const pageRoutes = [...routeMap.values()].sort((a, b) => {
    // parent route first, catchall route last
    const slashCount = (s: string) => s.split("/").filter(Boolean).length
    if (catchAllRouteRE.test(a.route)) {
      return 1
    }
    if (catchAllRouteRE.test(b.route)) {
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
      const isDynamic = dynamicRouteRE.test(node)
      const isCatchAll = catchAllRouteRE.test(node)
      const normalizedName = normalizeCase(
        isDynamic
          ? isCatchAll
            ? "all"
            : node.replace(dynamicRouteRE, "$1")
          : node,
      )
      const normalizedPath = normalizeCase(normalizedName)
      route.name += route.name ? `-${normalizedName}` : normalizedName

      const parent = parentRoutes.find((node) => node.name === route.name)
      if (parent) {
        parent.children = parent.children || []
        parentRoutes = parent.children
      }

      if (normalizedPath === "index") {
        route.path += "/"
        route.exact = true
      } else if (isDynamic) {
        if (isCatchAll) {
          route.path += "/(.*)"
        } else {
          route.path += `/:${normalizedName}`
        }
      } else {
        route.path += `/${normalizedPath}`
      }
    }

    parentRoutes.push(route)
  })

  const finalRoutes = prepareRoutes(routes)
  const code = generateCode(finalRoutes)
  return code
}

type PreparedRoute = Exclude<Route, "children"> & {
  module: string
  routes?: Array<PreparedRoute>
}

function prepareRoutes(routes: Array<Route>): Array<PreparedRoute> {
  const res: Array<PreparedRoute> = []
  for (const route of routes) {
    const newRoute: PreparedRoute = {
      ...route,
      module: route.component,
    }
    if (route.children) {
      newRoute.routes = prepareRoutes(route.children)
      delete newRoute.children
    }
    res.push(newRoute)
  }
  return res
}

function generateCode(routes: Array<PreparedRoute>) {
  const { imports, stringRoutes } = stringifyRoutes(routes)
  imports.push('import React from "react"')
  return `${imports.join(
    ";\n",
  )};\n\nconst routes = ${stringRoutes};\n\nexport default routes;`
}

function stringifyRoutes(preparedRoutes: Array<PreparedRoute>) {
  const componentRE = /"(?:element|component)": ("(.*?)")/g
  const moduleRE = /"(?:module)": ("(.*?)")/g
  const imports: Array<string> = []

  const stringRoutes = JSON.stringify(preparedRoutes, null, 2)
    .replace(componentRE, componentReplacer)
    .replace(moduleRE, moduleReplacer)

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

  function moduleReplacer(
    str: string,
    replaceStr: string,
    path: string,
    offset: number,
  ) {
    const importName = "module" + offset
    const importStr = `import * as ${importName} from "${path}"`
    if (!imports.includes(importStr)) imports.push(importStr)
    return str.replace(replaceStr, importName)
  }
}
