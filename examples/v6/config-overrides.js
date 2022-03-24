const Lib = require("my-ts-lib").default

module.exports = function override(config, env) {
  //do stuff with the webpack config...
  config.resolve.plugins = []
  config.plugins = (config.plugins || []).concat([
    Lib({
      isDev: env === 'development',
      reactRouterVersion: 6,
    }),
  ])
  return config
}
