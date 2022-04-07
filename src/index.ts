import path from 'path'
import fsp from 'fs/promises'
import EventEmitter from 'events'

import chokidar from 'chokidar'
import { createUnplugin } from 'unplugin'
import fg from 'fast-glob'

import type { FsRoute, ReactRouterRoute, ReactRouterRouteV5, ReactRouterRouteV6, Route, UserOptions } from './types'

const VIRTUAL_ROUTE_IDS = ['~fs-routes']
const ESM_EXTENSION = '.mjs'
const RESOLVE_ROUTES = 'resolve-routes'

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
      ctx.emit(RESOLVE_ROUTES, importer)
      return id + ESM_EXTENSION
    },

    async load(id) {
      if (!VIRTUAL_ROUTE_IDS.map(s => s + ESM_EXTENSION).includes(id))
        return null
      return ctx.resolveRoutes(caseSensitive, reactRouterVersion === 5)
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

      this.once(RESOLVE_ROUTES, (importer) => {
        this._routesImporter = importer
      })
    }

    this._searchGlob()
  }

  resolveRoutes(caseSensitive: boolean, isV5 = false) {
    if (isV5)
      return new V5RouteResolver(caseSensitive).resolveRoutes([...this.routeMap.values()])
    else
      return new V6RouteResolver(caseSensitive).resolveRoutes([...this.routeMap.values()])
  }

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
    const ext = this._routeExtensions.length > 1 ? `{${this._routeExtensions.join(',')}}` : this._routeExtensions[0] || ''

    const files = fg.sync(path.join(dir, `**/*${ext}`), {
      ignore: ['node_modules', '.git', '**/__*__/**'],
      onlyFiles: true,
    })

    return files
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

  async resolveRoutes(fsRoutes: FsRoute[]) {
    const routes = this.prepareRoutes(fsRoutes)
    const normalizedRoutes = this.normalizeRoutes(routes)
    const code = this.generateCode(normalizedRoutes)
    return code
  }

  abstract prepareRoutes(fsRoutes: FsRoute[]): Route[]
  abstract normalizeRoutes(routes: Route[]): ReactRouterRoute[]
  abstract generateCode(routes: ReactRouterRoute[]): string

  normalizeCase(str: string) {
    return this.caseSensitive ? str : str.toLowerCase()
  }

  normalizeRouteName(node: string) {
    const res = this.isDynamicRoute(node)
      ? this.isCatchAllRoute(node)
        ? 'all'
        : node.replace(DYNAMIC_ROUTE_RE, '$1')
      : node
    return res.toLowerCase()
  }

  isIndexRoute(node: string) {
    return this.normalizeCase(node) === 'index'
  }

  isDynamicRoute(node: string) {
    return DYNAMIC_ROUTE_RE.test(node)
  }

  isCatchAllRoute(node: string) {
    return CATCH_ALL_ROUTE_RE.test(node)
  }
}

class V6RouteResolver extends RouteResolver {
  prepareRoutes(fsRoutes: FsRoute[]) {
    const res: Route[] = []
    for (const fsRoute of this.sortRoutes(fsRoutes)) {
      let parentRoutes = res
      const pathNodes = fsRoute.route.split('/')
      let name = ''
      for (let i = 0; i < pathNodes.length; i++) {
        const node = pathNodes[i]
        name += name ? `-${this.normalizeRouteName(node)}` : this.normalizeRouteName(node)
        const route: Route = {
          name,
          path: '',
          rawRoute: pathNodes.slice(0, i + 1).join('/'),
        }

        if (i === pathNodes.length - 1)
          route.component = fsRoute.path

        if (!this.isIndexRoute(node))
          route.path = this.normalizeRoutePath(node)

        const parent = parentRoutes.find((parent) => {
          return pathNodes.slice(0, i).join('/') === parent.rawRoute
        })
        if (parent) {
          parent.children = parent.children || []
          parentRoutes = parent.children
        }

        const exits = parentRoutes.some((parent) => {
          return pathNodes.slice(0, i + 1).join('/') === parent.rawRoute
        })
        if (!exits)
          parentRoutes.push(route)
      }
    }
    return res
  }

  normalizeRoutes(routes: Route[]): ReactRouterRouteV6[] {
    const res: ReactRouterRouteV6[] = []
    for (const route of routes) {
      const { name, component, children, ...rawRoute } = route
      const newRoute: ReactRouterRouteV6 = { ...rawRoute, element: component, caseSensitive: this.caseSensitive }
      if (children)
        newRoute.children = this.normalizeRoutes(children)
      if (name.endsWith('index')) {
        newRoute.index = true
        delete newRoute.path
      }
      res.push(newRoute)
    }
    return res
  }

  sortRoutes(routes: FsRoute[]): FsRoute[] {
    return [...routes].sort((a, b) => slashCount(a.route) - slashCount(b.route))
  }

  normalizeRoutePath(node: string) {
    const path = this.normalizeRouteName(node)
    if (this.isDynamicRoute(node)) {
      if (this.isCatchAllRoute(node))
        return '*'

      return `:${path}`
    }
    return `${path}`
  }

  generateCode(routes: ReactRouterRoute[]) {
    const componentRE = /"(?:element)": ("(.*?)")/g
    const imports: string[] = []

    const stringRoutes = JSON.stringify(routes, null, 2).replace(
      componentRE,
      (str: string, replaceStr: string, path: string, offset: number) => {
        const importName = `route${offset}`
        const importStr = `import ${importName} from "${path}"`
        if (!imports.includes(importStr)) imports.push(importStr)
        return str.replace(replaceStr, `React.createElement(${importName})`)
      },
    )

    imports.push('import React from "react"')
    return `${imports.join(
      ';\n',
    )};\n\nconst routes = ${stringRoutes};\n\nexport default routes;`
  }
}

class V5RouteResolver extends RouteResolver {
  prepareRoutes(fsRoutes: FsRoute[]) {
    const res: Route[] = []
    for (const fsRoute of this.sortRoutes(fsRoutes)) {
      const route: Route = {
        path: '',
        name: '',
        component: fsRoute.path,
      }
      let parentRoutes = res
      const pathNodes = fsRoute.route.split('/')

      for (let i = 0; i < pathNodes.length; i++) {
        const node = pathNodes[i]
        const name = this.normalizeRouteName(node)
        const path = this.normalizeRoutePath(node)
        route.path += path
        route.name += route.name ? `-${name}` : name

        const parent = parentRoutes.find(node => node.name === route.name)
        if (parent) {
          parent.children = parent.children || []
          parentRoutes = parent.children
        }
      }
      parentRoutes.push(route)
    }
    return res
  }

  sortRoutes(routes: FsRoute[]): FsRoute[] {
    return [...routes].sort((a, b) => {
      // parent route first, catchall route last
      if (CATCH_ALL_ROUTE_RE.test(a.route))
        return 1

      if (CATCH_ALL_ROUTE_RE.test(b.route))
        return -1

      return slashCount(a.route) - slashCount(b.route)
    })
  }

  normalizeRoutePath(node: string) {
    if (this.isIndexRoute(node))
      return '/'

    const path = this.normalizeCase(this.normalizeRouteName(node))
    if (this.isDynamicRoute(node)) {
      if (this.isCatchAllRoute(node))
        return '/(.*)'
      else
        return `/:${path}`
    }
    return `/${path}`
  }

  normalizeRoutes(routes: Route[]): ReactRouterRouteV5[] {
    const res: ReactRouterRouteV5[] = []
    for (const route of routes) {
      const { name, children, ...rawRoute } = route
      const newRoute: ReactRouterRouteV5 = { ...rawRoute }
      if (children)
        newRoute.routes = this.normalizeRoutes(children)
      if (name.endsWith('index'))
        newRoute.exact = true
      res.push(newRoute)
    }
    return res
  }

  generateCode(routes: ReactRouterRoute[]) {
    const componentRE = /"(?:component)": ("(.*?)")/g
    const imports: string[] = []

    const stringRoutes = JSON.stringify(routes, null, 2).replace(
      componentRE,
      (str: string, replaceStr: string, path: string, offset: number) => {
        const importName = `route${offset}`
        const importStr = `import ${importName} from "${path}"`
        if (!imports.includes(importStr)) imports.push(importStr)
        return str.replace(replaceStr, importName)
      },
    )

    imports.push('import React from "react"')
    return `${imports.join(
      ';\n',
    )};\n\nconst routes = ${stringRoutes};\n\nexport default routes;`
  }
}

function slashCount(s: string) {
  return s.split('/').filter(Boolean).length
}
