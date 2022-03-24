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

export interface FsRoute {
  path: string
  route: string
}

export interface Route {
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
  component?: string
  /**
   * child routes
   * @default []
   */
  children?: Route[]
  rawRoute?: string
}

export type ReactRouterRoute = ReactRouterRouteV5 | ReactRouterRouteV6

export interface ReactRouterRouteV5 extends Omit<Route, 'name' | 'children'> {
  /**
   * <Route exact />
   * @default false
   */
  exact?: boolean
  /**
   * v5 child routes
   * @default []
   */
  routes?: ReactRouterRouteV5[]
}

export interface ReactRouterRouteV6 {
  /**
   * <Route caseSensitive />
   * @default false
   */
  caseSensitive?: boolean
  /**
   * <Route path />
   */
  path?: string
  /**
   * <Route index />
   * @default false
   */
  index?: boolean
  /**
   * import specifier of <Route element />
   */
  element?: string
  /**
   * v6 child routes
   * @default []
   */
  children?: ReactRouterRouteV6[]
}
