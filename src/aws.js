const AWS = require("aws-sdk")
const fullJitter = require("./fullJitter")

AWS.config.update({
  correctClockSkew: true,
  retryDelayOptions: {
    customBackoff: fullJitter(100, 30 * 1000),
  },
})

AWS.config.setPromisesDependency(require("bluebird"))

module.exports = AWS