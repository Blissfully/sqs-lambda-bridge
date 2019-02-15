// sqs-consumer needs this
console.assert(process.env.AWS_REGION, "AWS_REGION must be set")

import getConfig from "./getConfig"
import { default as Consumer, State } from "./Consumer"
import { updateIn } from "immutable"
import util = require("util")

const sleep = util.promisify(setTimeout)

const calcBatchSizes = (concurrency: number, maxBatchSize: number) =>
  Array(Math.trunc(concurrency / maxBatchSize))
    .fill(maxBatchSize)
    .concat(concurrency % maxBatchSize || [])

const consumers = []

void (async function () {
  console.info("starting sqs-lambda-bridge")
  const config = await getConfig()
  console.info(JSON.stringify(config, null, 2))
  for (const queueName in config) {
    const batchSizes = calcBatchSizes(config[queueName].concurrency, config[queueName].batchSize)
    for (const consumerId in batchSizes) {
      let batchSize
      // At the moment the fifo queue handler iterates in order over each item
      // in a batch, the concurrency for a fifo queue should be set to what ever
      // number you'd expect
      if (queueName.endsWith(".fifo")) {
        batchSize = config[queueName].batchSize
      } else {
        batchSize = batchSizes[consumerId]
      }

      const consumer = new Consumer(config[queueName].url as string, batchSize, queueName, consumerId)
      consumers.push(consumer)
    }
  }
  for (const consumer of consumers) {
    consumer.start()
  }
})()
