import AWS from "./aws"
const sqs = new AWS.SQS({ logger: console })

import URL = require("url")
import path = require("path")

// Queues which have a "sqsLambdaBridge" tag are expected to include messages describing requested lambda invocations

const defaultOptions: QueueOptions = {
  url: undefined,
  concurrency: 1,
  batchSize: 10,
}

type Options = {
  [name: string]: QueueOptions
}

type QueueOptions = {
  url: string | undefined
  concurrency: number
  batchSize: number
}

export default async () => {
  const { QueueUrls } = await sqs.listQueues().promise()
  const config: Options = {}
  for (const QueueUrl of QueueUrls as string[]) {
    const { Tags } = await sqs.listQueueTags({ QueueUrl }).promise()
    if (Tags && typeof Tags.sqsLambdaBridge !== "undefined") {
      const options: QueueOptions = Object.assign({}, defaultOptions)
      for (const tagName in defaultOptions) {
        if (tagName in Tags) {
          // @ts-ignore
          options[tagName] = Tags[tagName]
        }
      }
      options.url = QueueUrl
      const name = path.basename(URL.parse(QueueUrl).path as string)
      config[name] = options
    } else {
      // console.log(`Ignoring ${QueueUrl} due to no config tags`)
    }
  }
  return config
}
