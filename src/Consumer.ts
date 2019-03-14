import AWS from "./aws"

const sqs = new AWS.SQS({ logger: console })

export enum State {
  Receive = "Receive",
  Invoke = "Invoke",
}

export default class Consumer {
  state: State | undefined

  constructor(public url: string, public batchSize: number, public queueName: string, public id: string) {}

  private get receiveMessageParams(): AWS.SQS.ReceiveMessageRequest {
    return {
      QueueUrl: this.url,
      AttributeNames: ["All"],
      MessageAttributeNames: ["FunctionName"],
      MaxNumberOfMessages: this.batchSize,
      WaitTimeSeconds: 20,
    }
  }

  private get invokeParams() {
    return {
      InvocationType: "RequestResponse",
      LogType: "None",
    }
  }

  public get label() {
    return `${this.queueName}#${this.id}`
  }

  private setState(stateName: State) {
    this.state = stateName
    // console.log(this.label, this.state)
  }

  public async start() {
    while (true) {
      this.setState(State.Receive)
      const { Messages } = await sqs.receiveMessage(this.receiveMessageParams).promise()
      if (Messages) {
        this.setState(State.Invoke)
        await Promise.all(
          Messages.map(async (message: AWS.SQS.Message) => {
            try {
              const { region, FunctionName } = parseMessage(message)
              const lambda = getLambdaApi(region)

              const { FunctionError, Payload } = await lambda
                .invoke({ FunctionName, Payload: message.Body, ...this.invokeParams })
                .promise()

              // If FunctionError exists, the function itself failed (not the
              // AWS Lambda API). We want to treat either case as a retryable
              // error, and not delete the message.
              switch (FunctionError) {
                case "Handled":
                  const { errorMessage } = JSON.parse(Payload as string)
                  throw new Error(errorMessage)
                case "Unhandled":
                  throw new Error(FunctionError)
              }

              sqs.deleteMessage({ QueueUrl: this.url, ReceiptHandle: message.ReceiptHandle as string }).send()
            } catch (err) {
              console.log(err)
            }
          })
        )
      }
    }
  }
}

const parseMessage = (message: AWS.SQS.Message) => {
  const FunctionName = (message.MessageAttributes || {}).FunctionName.StringValue as string
  if (FunctionName.includes(":")) {
    // This is an ARN, not a function name.
    const arn = parseLambdaArn(FunctionName)
    return {
      FunctionName: arn.name,
      region: arn.region,
    }
  } else {
    // Just an unqualified function name. Assume its in the same region.
    return {
      FunctionName,
      region: AWS.config.region as string,
    }
  }
}

// arn:aws:lambda:region:account-id:function:function-name
const parseLambdaArn = (arn: string) => {
  const [, , lambda, region, accountId, type, name, qualifier] = arn.split(":")
  if (lambda === "lambda" && type === "function") {
    return { region, accountId, name, qualifier }
  } else {
    throw new Error(`ARN is not of a Lambda function`)
  }
}

const lambdaApiCache: { [region: string]: AWS.Lambda } = {}
const getLambdaApi = (region: string) => {
  if (!(region in lambdaApiCache)) {
    console.log(`Adding new Lambda API instance for ${region}`)
    lambdaApiCache[region] = new AWS.Lambda({ region, logger: console })
  }
  return lambdaApiCache[region]
}
