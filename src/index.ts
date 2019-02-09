// sqs-consumer needs this
console.assert(process.env.AWS_REGION, "AWS_REGION must be set")

import getConfig from "./getConfig"
// const makeConsumer = require("./src/makeConsumer")

const calcBatchSizes = (target: number, maxBatchSize: number) =>
  Array(Math.trunc(target / maxBatchSize))
    .fill(maxBatchSize)
    .concat(target % maxBatchSize || [])

void (async function() {
  console.info("starting sqs-lambda-bridge")
  const config = await getConfig()
  console.info(JSON.stringify(config, null, 2))
  for (const queueName in config) {
    const batchSizes = calcBatchSizes(config[queueName].concurrency, config[queueName].batchSize)
    for (const consumerId in batchSizes) {
      const batchSize = batchSizes[consumerId]
      console.log({ queueName, ...config[queueName], batchSize })
      // makeConsumer({ queueUrl, batchSize, label: `${queueName}#${consumerId}` })
    }
  }
})()
