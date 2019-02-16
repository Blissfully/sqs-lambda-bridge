// sqs-consumer needs this
console.assert(process.env.AWS_REGION, "AWS_REGION must be set")

import getConfig from "./getConfig"
import { default as Consumer, State } from "./Consumer"
import { updateIn } from "immutable"
import util = require("util")

const sleep = util.promisify(setTimeout)

const calcBatchSizes = (concurrency: number, maxBatchSize: number, queueName: string) => {
  if (queueName.endsWith(".fifo")) {
    // Fifo queue now uses the literal batch number, not a calculated concurrency value
    return Array(Math.trunc(concurrency)).fill(maxBatchSize)
  } else {
    return Array(Math.trunc(concurrency / maxBatchSize))
      .fill(maxBatchSize)
      .concat(concurrency % maxBatchSize || [])
  }
}

const consumers = []

void (async function () {
  console.info("starting sqs-lambda-bridge")
  const config = await getConfig()
  console.info(JSON.stringify(config, null, 2))
  for (const queueName in config) {
    const batchSizes = calcBatchSizes(config[queueName].concurrency, config[queueName].batchSize, queueName)
    for (const consumerId in batchSizes) {
      const batchSize = batchSizes[consumerId]
      const consumer = new Consumer(config[queueName].url as string, batchSize, queueName, consumerId)
      consumers.push(consumer)
    }
  }
  for (const consumer of consumers) {
    console.log("starting", consumer.label)
    consumer.start()
  }
})()
