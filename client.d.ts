declare module '~fs-routes' {
  import type { RouteConfig } from 'react-router-config'
  import type { RouteObject } from 'react-router-dom'
  const routes: (RouteConfig | RouteObject)[]
  export default routes
}
