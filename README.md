# SQS Lambda Bridge

Invoke AWS Lambda functions from SQS queues while adhering to strict concurrency limits. 

There is no official way to dispatch Lambda events from SQS. SQS Lambda Bridge provides a way to do this without any dependencies on DynamoDB or other persistence layer. It easily manages a high volume of invocations on the smallest available Fargate task size (less than $15/month). There is no inherent limit on how long invocations can take (even if the 5 minute limit is extended by Amazon). It will never perform more concurrent invocations than you configure, and will stay at that limit as long as there are messages in the queues.

## Use

A Dockerfile is provided to simplify deployment, but anywhere you can run `npm start` is sufficient. See [Installation](#installation) for details.

Instead of triggering your Lambda function with [`lambda.invoke`](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Lambda.html#invoke-property), use [`sqs.sendMessage`](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html#sendMessage-property) or [`sqs.sendMessageBatch`](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html#sendMessageBatch-property). Specify the name of the Lambda function via the [message attribute](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-message-attributes.html) `FunctionName`. The function payload should be the message body. Both are JSON encoded.

```js
const AWS = require("aws-sdk")
const sqs = new AWS.SQS()

const functionName = "my-function"
const payload = { widgetId: 1234 }

sqs
  .sendMessage({
    QueueUrl: `https://sqs.us-east-1.amazonaws.com/1234/my-queue`,
    MessageBody: JSON.stringify(payload),
    MessageAttributes: {
      FunctionName: {
        DataType: "String",
        StringValue: functionName,
      },
    },
  })
  .promise()

```

**If your Lambda returns a successful response, the message will be removed from the queue.** Otherwise, it will be retried until it expires, subject to any redrive policy on that queue.

## Configuration

Create an SQS queue and add a tag called `sqsLambdaBridge`. All queues with this tag will be polled continuously. Additional options are supported via tags:

|     Tag Name      | Default |                                                                                                                              |
| :---------------: | :-----: | :--------------------------------------------------------------------------------------------------------------------------: |
| `sqsLambdaBridge` | `false` |                                           If this isn't set, the queue is ignored.                                           |
|   `concurrency`   |    1    | [Max 1000 total across all lambdas, but you can ask AWS for more.](https://docs.aws.amazon.com/lambda/latest/dg/limits.html) |
|    `batchSize`    |   10    |                             Max is 10. Low values mean better utilization but more API traffic.                              |

> **Note:** The default visibility timeout for these queues must be at least as long as the longest timeout for the functions in that queue. If in doubt, 310 seconds is a reasonable value.

> **Note:** You should configure a dead letter queue, or else invocations which fail will be retried immediately and continue until they succeed or expire from the queue.

## Designing your queues

For the highest throughput, you'd want to have only one queue, with lots of workers pulling jobs from it. There are a few general rules about when it makes sense to split your work into different queues.

### 1. Priority

If all jobs are otherwise equal, but some need to be completed relatively sooner than others, **create a dedicated queue for time-critical work and add to it sparingly.** You may create separate queues for different classes of customers: free users vs. paying customers, or you may have separate queues for batch vs. interactive uses.

### 2. Different jobs consume different resources

With Lambda we have amazing scalability, right? But not all functions are stateless. A function may make a connection to RDS, which has a limit of 1000 concurrent connections, or it could hit a 3rd party API that has strict rate limits. **Each function should be sent to a queue named for the most scarce resource which it consumes.**

Example:
- `Lambda` for stateless stuff that is only limited by your account's Lambda concurrency.
- `Aurora` for functions which make a connection to the database. Set the `concurrency` tag to something conservative with respect to your Aurora connection limit (max 1000 probably).
- `Contentful` where [Contentful](https://www.contentful.com/) is a 3rd party API that you can't hit too often.

### 3. Purging

There is exactly one O(1) operation in SQS and that is purgeQueue. **If there's a class of function invocation that we may need to cancel, dedicate a queue to to it.** All SQS messages are immutable. Selectively deleting messages from the queue requires that you first recieve that message, making it invisible to other clients, and incrementing its recieve count, which may move it closer to the dead-letter queue, before you can delete it. In-flight messages are also invisible, so you won't necessarily find everything on the first pass.

### 4. Queue-level features.

For example, normal queues can't do deduplication or guarantee ordering, and FIFO queues can't do delays on individual messages. **If you need mutually exclusive features, make more queues.**

## Installation

In this tutorial, we'll be deploying to [Amazon Fargate](https://aws.amazon.com/fargate/), but anywhere you can run `npm start` should work.

Before we begin, you should have installed and configured the official [AWS CLI](https://aws.amazon.com/cli/). You should be able to run e.g. `aws sqs list-queues` without error. We will also be using the _unofficial_ [Fargate CLI](https://github.com/jpignata/fargate). This will automatically use the same credentials as the official CLI. Download that and make sure that the executable file is in your `$PATH`. 

First, create an IAM role which can enumerate your SQS queues and their tags, and invoke your Lambda functions.

```sh
aws iam create-role \
  --role-name sqs-lambda-bridge \
  --assume-role-policy-document file://iam/role.json
  
aws iam put-role-policy \
  --role-name sqs-lambda-bridge \
  --policy-name sqs-lambda-bridge \
  --policy-document file://iam/role-policy.json
```

Next, create a cluster. It takes a few minutes to provision and start the new container.

```sh
fargate service create --task-role sqs-lambda-bridge sqs-lambda-bridge
```

You can view logs in real time.

```sh
fargate service logs sqs-lambda-bridge -f
```

Deploying a new version is also trivial (and also takes a few minutes).

```sh
fargate service deploy sqs-lambda-bridge
```

The service only checks its configuration once, at startup. If you add or remove queues, or change their config tags, you'll need to restart it.

```sh
fargate service restart sqs-lambda-bridge
```

## Contributing

Bug reports and pull requests are welcome on GitHub at https://github.com/Blissfully/sqs-lambda-bridge. This project is intended to be a safe, welcoming space for collaboration, and contributors are expected to adhere to the [Contributor Covenant](http://contributor-covenant.org) code of conduct.


## License

The project is available as open source under the terms of the [MIT License](http://opensource.org/licenses/MIT).
