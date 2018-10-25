const Promise = require("bluebird")
const AWS = require("aws-sdk")

/*
  https://www.awsarchitectureblog.com/2015/03/backoff.html
  Explore in the console with:
  [1,2,3,4,5,6,7,8,9,10].map(fullJitter)
*/
const cap = 30 * 1000
const base = 100
const randomBetween = (min, max) => Math.random() * (max - min) + min
const fullJitter = retryCount => {
  const temp = Math.min(cap, Math.pow(base * 2, retryCount))
  return temp / 2 + randomBetween(0, temp / 2)
}

AWS.config.update({
  correctClockSkew: true,
  retryDelayOptions: {
    customBackoff: fullJitter,
  },
  httpOptions: {
    timeout: 900000
  },
})

AWS.config.setPromisesDependency(Promise)

// if (process.env._X_AMZN_TRACE_ID) {
//   return require("aws-xray-sdk").captureAWS(AWS)
// } else {
//   console.log("Serverless Offline detected; skipping AWS X-Ray setup")
//   return AWS
// }

module.exports = AWS