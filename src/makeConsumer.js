const Consumer = require("sqs-consumer")
const AWS = require("./aws")

const sqs = new AWS.SQS()
const defaultLambda = new AWS.Lambda()

const makeConsumer = ({ queueUrl, batchSize, label }) => {
  const app = Consumer.create({
    sqs,
    batchSize,
    queueUrl,
    messageAttributeNames: ["FunctionName"],
    handleMessage,
  })

  console.info(label, "starting", { queueUrl, batchSize })

  // See https://github.com/bbc/sqs-consumer#events for event listing
  app.on("error", (err, message) => console.info(label, "error interactiing with queue", err, message))

  app.on("processing_error", (err, message) =>
    console.info(label, "error", message.MessageAttributes.FunctionName.StringValue)
  )

  app.on("message_received", message =>
    console.info(label, "received", message.MessageAttributes.FunctionName.StringValue)
  )

  app.on("message_processed", message =>
    console.info(label, "processed", message.MessageAttributes.FunctionName.StringValue)
  )

  if (batchSize > 1) {
    app.on("response_processed", () => console.info(label, "completed batch"))
  }

  app.on("stopped", () => console.info(label, "stopped"))

  app.on("empty", () => console.info(label, "queue is empty"))

  app.start()
}

const handleMessage = (message, done) =>
{
  const functionName = message.MessageAttributes.FunctionName.StringValue
  let lambda = defaultLambda

  if (functionName.startsWith("arn:")) {
    lambda = new AWS.Lambda({ region: functionName.split(":")[3] })
  }

  lambda.invoke(
    {
      FunctionName: functionName,
      Payload: message.Body,
      InvocationType: "RequestResponse",
      LogType: "None",
    },
    done
  )
}

module.exports = makeConsumer
