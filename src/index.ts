import path from 'path'
import fsp from 'fs/promises'
import EventEmitter from 'events'
import chokidar from 'chokidar'
import { createUnplugin } from 'unplugin'

import type { ReactRouterRoute, Route, UserOptions } from './types'

// Include file extension to avoid being processed by file loader fallback in CRA
// otherwise would not be needed i.e. using custom webpack config.
// https://github.com/facebook/create-react-app/blob/eee8491d57d67dd76f0806a7512eaba2ce9c36f0/packages/react-scripts/config/webpack.config.js#L509
const VIRTUAL_ROUTE_IDS = ['~fs-routes']
const ESM_EXTENSION = '.mjs'

export const FsRoutesPlugin = createUnplugin<UserOptions>((options) => {
  const {
    routesDir = path.join(process.cwd(), 'src/pages'),
    routeExtensions = ['.tsx'],
    isDev = false,
    caseSensitive = false,
    reactRouterVersion = 5,
  } = options || {}

  if (reactRouterVersion !== 5 && reactRouterVersion !== 6)
    throw new Error('reactRouterVersion must be 5 or 6')

  const ctx = new Context({ routesDir, routeExtensions, isDev })

  return {
    name: 'webpack-fs-routes-unplugin',

    buildStart() {
      ctx.init()
    },

    resolveId(id, importer) {
      if (!VIRTUAL_ROUTE_IDS.includes(id)) return null
      ctx.emit('importRoutes', importer)
      return id + ESM_EXTENSION
    },

    async load(id) {
      if (!VIRTUAL_ROUTE_IDS.map(s => s + ESM_EXTENSION).includes(id))
        return null
      return ctx.resolveRoutes(caseSensitive)
    },

    // custom hooks for webpack
    // webpack(compiler) {}
  }
})

export default FsRoutesPlugin.webpack

//////////////////////////////////////////////////////////////////////
class Context extends EventEmitter {
  routeMap = new Map<string, { path: string; route: string }>()

  private _routesDir: string
  private _routeExtensions: string[]
  private _isDev: boolean
  private _routesImporter?: string
  // private _devServer: WebpackDevServer | null = null;

  constructor({
    routesDir,
    routeExtensions,
    isDev,
  }: {
    routesDir: string
    routeExtensions: string[]
    isDev: boolean
  }) {
    super()
    this._routesDir = routesDir
    this._routeExtensions = routeExtensions
    this._isDev = isDev
  }

  async init() {
    if (this._isDev) {
      const watcher = this._setupWatcher();
      ['SIGINT', 'SIGTERM'].forEach((signal) => {
        process.on(signal, () => {
          watcher.close()
          process.exit()
        })
      })

      this.once('importRoutes', (importer) => {
        this._routesImporter = importer
      })
    }

    this._searchGlob()
  }

  resolveRoutes(caseSensitive: boolean) {
    return new V5RouteResolver(caseSensitive).resolveRoutes(this.routeMap)
  }

  // TODO: use glob instead of fs.readdir to exclude test files
  private async _searchGlob() {
    for (const route of await this._getFiles(this._routesDir))
      await this._addRoute(route)
  }

  private _setupWatcher() {
    const watcher = chokidar
      .watch(this._routesDir, {
        persistent: true,
        ignoreInitial: true,
      })
      .on('add', async(route) => {
        this._addRoute(route)
        this._invalidate()
      })
      .on('unlink', async(route) => {
        this._removeRoute(route)
        this._invalidate()
      })

    return watcher
  }

  private async _invalidate() {
    // TODO: figure out a better way to invalidate for hmr
    this._routesImporter
      && (await fsp.writeFile(
        this._routesImporter,
        await fsp.readFile(this._routesImporter),
      ))
    // this._devServer.invalidate(); // didn't work :/
  }

  private _addRoute(route: string) {
    // Example:
    //   importer: <rootDir>/_virtual_~fs-routes.mjs
    //   importee: import Route53 from '<rootDir>/src/pages/index.tsx'
    this.routeMap.set(route, {
      path: route,
      route: path
        .relative(this._routesDir, route)
        .replace(path.extname(route), ''),
    })
  }

  private _removeRoute(route: string) {
    this.routeMap.delete(route)
  }

  private async _getFiles(dir: string) {
    const res: string[] = []
    for (const filename of await fsp.readdir(dir)) {
      const file = path.resolve(dir, filename)
      const stat = await fsp.lstat(file)

      if (stat.isDirectory()) {
        res.push(...(await this._getFiles(file)))
      }
      else if (stat.isFile()) {
        if (this._routeExtensions.includes(path.extname(file)))
          res.push(file)
      }
    }
    return res
  }
}

//////////////////////////////////////////////////////////////////////
const DYNAMIC_ROUTE_RE = /^\[(.+)\]$/
const CATCH_ALL_ROUTE_RE = /^\[\.{3}/

abstract class RouteResolver {
  readonly caseSensitive: boolean

  constructor(caseSenstive: boolean) {
    this.caseSensitive = caseSenstive
  }

  abstract resolveRoutes(routeMap: Map<string, { path: string; route: string }>): Promise<string>

  normalizeCase(str: string) {
    return this.caseSensitive ? str : str.toLowerCase()
  }

  isIndexRoute(node: string) {
    return this.normalizeCase(node) === 'index'
  }

  generateCode(routes: ReactRouterRoute[]) {
    const { imports, stringRoutes } = this.stringifyRoutes(routes)
    imports.push('import React from "react"')
    return `${imports.join(
      ';\n',
    )};\n\nconst routes = ${stringRoutes};\n\nexport default routes;`
  }

  stringifyRoutes(preparedRoutes: ReactRouterRoute[]) {
    const componentRE = /"(?:element|component)": ("(.*?)")/g
    const imports: string[] = []

    const stringRoutes = JSON.stringify(preparedRoutes, null, 2).replace(
      componentRE,
      (str: string, replaceStr: string, path: string, offset: number) => {
        const importName = `route${offset}`
        const importStr = `import ${importName} from "${path}"`
        if (!imports.includes(importStr)) imports.push(importStr)
        return str.replace(replaceStr, importName)
      },
    )

    return {
      imports,
      stringRoutes,
    }
  }
}

class V5RouteResolver extends RouteResolver {
  async resolveRoutes(routeMap: Map<string, { path: string; route: string }>) {
    const fsRoutes = [...routeMap.values()].sort((a, b) => {
      // parent route first, catchall route last
      const slashCount = (s: string) => s.split('/').filter(Boolean).length
      if (CATCH_ALL_ROUTE_RE.test(a.route))
        return 1

      if (CATCH_ALL_ROUTE_RE.test(b.route))
        return -1

      return slashCount(a.route) - slashCount(b.route)
    })
    const routes: Route[] = []

    fsRoutes.forEach((fsRoute) => {
      const pathNodes = fsRoute.route.split('/')
      let parentRoutes = routes
      const route: Route = {
        path: '',
        name: '',
        component: fsRoute.path,
      }

      for (let i = 0; i < pathNodes.length; i++) {
        const node = pathNodes[i]
        const { name, path } = this._buildRoutePathAndName(node)
        route.path += path
        route.name += route.name ? `-${name}` : name
        const parent = parentRoutes.find(node => node.name === route.name)
        if (parent) {
          parent.children = parent.children || []
          parentRoutes = parent.children
        }
      }

      parentRoutes.push(route)
    })

    const finalRoutes = this._prepareReactRoutes(routes)
    const code = this.generateCode(finalRoutes)
    // TODO:
    // debugger
    return code
  }

  private _buildRoutePathAndName(node: string) {
    const isDynamic = DYNAMIC_ROUTE_RE.test(node)
    const isCatchAll = CATCH_ALL_ROUTE_RE.test(node)
    const normalizedName = isDynamic
      ? isCatchAll
        ? 'all'
        : node.replace(DYNAMIC_ROUTE_RE, '$1')
      : node
    let normalizedPathNode = this.normalizeCase(normalizedName)
    if (this.isIndexRoute(node)) {
      normalizedPathNode = '/'
    }
    else if (isDynamic) {
      if (isCatchAll)
        normalizedPathNode = '/(.*)'

      else
        normalizedPathNode = `/:${normalizedPathNode}`
    }
    else {
      normalizedPathNode = `/${normalizedPathNode}`
    }
    return { name: normalizedName.toLowerCase(), path: normalizedPathNode }
  }

  private _prepareReactRoutes(routes: Route[]): ReactRouterRoute[] {
    const res: ReactRouterRoute[] = []
    for (const route of routes) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { name, children, ...rawRoute } = route
      const newRoute: ReactRouterRoute = { ...rawRoute, exact: false }
      if (route.children)
        newRoute.routes = this._prepareReactRoutes(route.children)

      if (route.path.endsWith('/'))
        newRoute.exact = true

      res.push(newRoute)
    }
    return res
  }
}
