const Lib = require("webpack-fs-routes-plugin").default

module.exports = function override(config, env) {
  //do stuff with the webpack config...
  config.resolve.plugins = []
  config.plugins = (config.plugins || []).concat([
    Lib({
      isDev: env === 'development',
    }),
  ])
  return config
}
