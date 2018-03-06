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
          .then(response => {
            if (!!response.Tags && typeof response.Tags.sqsLambdaBridge !== "undefined") {
              return Object.assign(acc, { [QueueUrl]: Object.assign({}, defaultOptions, response.Tags) })
            } else {
              return acc
            }
          }),
      {}
    )

module.exports = getConfig
