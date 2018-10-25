"use strict"

// sqs-consumer needs this
console.assert(process.env.AWS_REGION, "AWS_REGION must be set")

const URL = require("url")
const path = require("path")

const getConfig = require("./src/getConfig")
const makeConsumer = require("./src/makeConsumer")

console.info("starting sqs-lambda-bridge")

getConfig().then(config => {
  console.info("config", JSON.stringify(config, null, 2))
  for (const queueUrl in config) {
    const queueName = getQueueName(queueUrl)
    const tags = config[queueUrl]
    const batchSizes = calcBatchSizes(tags.concurrency, tags.batchSize)
    for (const consumerId in batchSizes) {
      const batchSize = batchSizes[consumerId]
      makeConsumer({ queueUrl, batchSize, label: `${queueName}#${consumerId}` })
    }
  }
})

const calcBatchSizes = (target, maxBatchSize) =>
  Array(Math.trunc(target / maxBatchSize))
    .fill(maxBatchSize)
    .concat(target % maxBatchSize || [])

const getQueueName = QueueUrl => path.basename(URL.parse(QueueUrl).path)
