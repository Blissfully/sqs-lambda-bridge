const Promise = require("bluebird")
const AWS = require("aws-sdk")

const MAX_LAMBDA_TIMEOUT_MILLISECONDS = 900000
const TEN_PERCENT_INCLUSIVE = 1.1

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
  // When invoking lambdas with RequestResponse the connection to the lambda will remain open for as long
  // as the lambda is executing. The default timeout of the http connection that the AWS SDK uses is 120k ms(2 minutes).
  // Setting this to the maximum timeout for Lambda and some additional padding for establishing connections should prevent
  // timeouts.
  httpOptions: {
    timeout: MAX_LAMBDA_TIMEOUT_MILLISECONDS * TEN_PERCENT_INCLUSIVE
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