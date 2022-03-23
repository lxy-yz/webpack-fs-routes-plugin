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
  component: string
  /**
   * child routes
   * @default []
   */
  children?: Route[]
}

export interface ReactRouterRoute extends Omit<Route, 'name' | 'children'> {
  /**
   * <Route exact />
   * @default false
   */
  exact?: boolean
  /**
   * child routes
   * @default []
   */
  routes?: ReactRouterRoute[]
}
