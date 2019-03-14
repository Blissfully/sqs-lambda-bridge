require("source-map-support").install()

// sqs-consumer needs this
console.assert(process.env.AWS_REGION, "AWS_REGION must be set")

import getConfig from "./getConfig"
import { default as Consumer, State } from "./Consumer"
import { updateIn } from "immutable"
import util = require("util")

const sleep = util.promisify(setTimeout)

const calcBatchSizes = (target: number, maxBatchSize: number) =>
  Array(Math.trunc(target / maxBatchSize))
    .fill(maxBatchSize)
    .concat(target % maxBatchSize || [])

const consumers = []

void (async function() {
  console.info("starting sqs-lambda-bridge")
  const config = await getConfig()
  console.info(JSON.stringify(config, null, 2))
  for (const queueName in config) {
    const batchSizes = calcBatchSizes(config[queueName].concurrency, config[queueName].batchSize)
    for (const consumerId in batchSizes) {
      const batchSize = batchSizes[consumerId]
      const consumer = new Consumer(config[queueName].url as string, batchSize, queueName, consumerId)
      consumers.push(consumer)
    }
  }
  for (const consumer of consumers) {
    consumer.start()
  }
  console.log(`Started ${consumers.length} consumers`)
  while (true) {
    summarizeConsumers(consumers)
    await sleep(1000 * 3)
  }
})()

type Summary = { [queue: string]: { [state: string]: number } }

function summarizeConsumers(consumers: Consumer[]) {
  const summary = consumers.reduce(
    (acc, consumer) => updateIn(acc, [consumer.queueName, consumer.state], 0, value => value + 1),
    {} as Summary
  )
  console.log(JSON.stringify({ summary }, null, 2))
}
