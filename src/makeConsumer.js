const Consumer = require("sqs-consumer")
const AWS = require("./aws")

const sqs = new AWS.SQS()

const makeConsumer = ({ queueUrl, batchSize, label }) => {
  const app = Consumer.create({
    sqs,
    batchSize,
    queueUrl,
    messageAttributeNames: [ "FunctionName" ],
    handleMessage,
  })

  console.info(label, "starting", { queueUrl, batchSize })

  // See https://github.com/bbc/sqs-consumer#events for event listing
  app.on("error", (err, message) => console.info(label, "error interacting with queue", err, message))

  app.on("processing_error", (err, message) =>
    console.info(label, "error", message.MessageAttributes.FunctionName.StringValue, err)
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

const handleMessage = (message, done) => {
  const { region, functionName } = parseMessage(message)
  getLambdaApi(region).invoke(
    {
      FunctionName: functionName,
      Payload: message.Body,
      InvocationType: "RequestResponse",
      LogType: "None",
    },
    done
  )
}

const parseMessage = message => {
  const functionName = message.MessageAttributes.FunctionName.StringValue
  if (functionName.includes(":"))  {
    // This is an ARN, not a function name.
    const arn = parseLambdaArn(functionName)
    return {
      functionName: arn.name,
      region: arn.region,
    }
  } else {
    // Just an unqualified function name. Assume its in the same region.
    return {
      functionName,
      region: AWS.config.region,
    }
  }
}

// arn:aws:lambda:region:account-id:function:function-name
const parseLambdaArn = string => {
  const [ , , lambda, region, accountId, type, name, qualifier ] = string.split(":")
  if (lambda === "lambda" && type === "function") {
    return { region, accountId, name, qualifier }
  } else {
    return new Error(`ARN is not of a Lambda function`)
  }
}

const lambdaApiCache = {}
const getLambdaApi = region => {
  if (!(region in lambdaApiCache)) {
    console.log(`Adding new Lambda API instance for ${region}`)
    lambdaApiCache[region] = new AWS.Lambda({ region })
  }
  return lambdaApiCache[region]
}

module.exports = makeConsumer
