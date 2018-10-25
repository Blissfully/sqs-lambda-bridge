const AWS = require("./aws")
const sqs = new AWS.SQS()

// Queues which have a "sqsLambdaBridge" tag are expected to include messages describing requested lambda invocations

const defaultOptions = {
  concurrency: 1,
  batchSize: 10,
}

const getConfig = () =>
  sqs
    .listQueues()
    .promise()
    .get("QueueUrls")
    .reduce(
      (acc, QueueUrl) =>
        sqs
          .listQueueTags({ QueueUrl })
          .promise()
          .then(({ Tags }) => {
            if (!!Tags && typeof Tags.sqsLambdaBridge !== "undefined") {
              const options = Object.assign({}, defaultOptions)
              for (tagName in defaultOptions) {
                if (tagName in Tags) {
                  options[tagName] = Tags[tagName]
                }
              }
              if (QueueUrl.endsWith(".fifo")) {
                console.log(`Forcing ${QueueUrl} to use batchSize 1 because it is FIFO.`)
                options.batchSize = 1
              }
              acc[QueueUrl] = options
            } else {
              console.log(`Ignoring ${QueueUrl} due to no config tags`)
            }
            return acc
          }),
      {}
    )

module.exports = getConfig
