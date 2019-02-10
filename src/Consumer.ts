import AWS from "./aws"

const sqs = new AWS.SQS()

export enum State {
  Receive = "Receive",
  Invoke = "Invoke",
}

export default class Consumer {
  state: State | undefined

  constructor(public url: string, public batchSize: number, public queueName: string, public id: string) {}

  private get params(): AWS.SQS.ReceiveMessageRequest {
    return {
      QueueUrl: this.url,
      AttributeNames: ["All"],
      MessageAttributeNames: ["FunctionName"],
      MaxNumberOfMessages: this.batchSize,
      WaitTimeSeconds: 20,
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
      const { Messages } = await sqs.receiveMessage(this.params).promise()
      if (Messages) {
        this.setState(State.Invoke)
        await Promise.all(
          Messages.map(async (message: AWS.SQS.Message) => {
            try {
              const { region, functionName } = parseMessage(message)
              const lambda = getLambdaApi(region)

              await lambda
                .invoke({
                  FunctionName: functionName,
                  Payload: message.Body,
                  InvocationType: "RequestResponse",
                  LogType: "None",
                })
                .promise()

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
  const functionName = (message.MessageAttributes || {}).FunctionName.StringValue as string
  if (functionName.includes(":")) {
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
    lambdaApiCache[region] = new AWS.Lambda({ region })
  }
  return lambdaApiCache[region]
}
