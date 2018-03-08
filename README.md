# SQS Lambda Bridge

Invoke AWS Lambda functions from SQS queues while adhering to strict concurrency limits. 

## Use

Instead of triggering your Lambda function with [`lambda.invoke`](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Lambda.html#invoke-property), use [`sqs.sendMessage`](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html#sendMessage-property) or [`sqs.sendMessageBatch`](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html#sendMessageBatch-property). Specify the name of the Lambda function via the [message attribute](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-message-attributes.html) `FunctionName`. The function payload should be the message body (JSON encoded).

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

## Configuration

Create an SQS queue and add a tag called `sqsLambdaBridge`. All queues with this tag will be polled continuously. Additional options are supported via tags:

|     Tag Name      | Default |                                                                                                                              |
| :---------------: | :-----: | :--------------------------------------------------------------------------------------------------------------------------: |
| `sqsLambdaBridge` | `false` |                                           If this isn't set, the queue is ignored.                                           |
|   `concurrency`   |    1    | [Max 1000 total across all lambdas, but you can ask AWS for more.](https://docs.aws.amazon.com/lambda/latest/dg/limits.html) |
|    `batchSize`    |   10    |                             Max is 10. Low values mean better utilization but more API traffic.                              |

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

There is exactly one O(1) operation in SQS and that is purgeQueue. It's not easy to scan through all jobs and delete only some of them, and there may always be jobs you can't see at the moment, and even viewing a message increments its receive count which may movie it closer to the DQL. Jobs are also immutable. **If there's a class of function invocation that we may need to cancel, dedicate a queue to this function.**

### 4. Queue-level features.

For example, normal queues can't do deduplication or guarantee ordering, and FIFO queues can't do delays on individual messages. **If you need mutually exclusive features, make more queues.**

## Installation

In this tutorial, we'll be deploying to [Amazon Fargate](https://aws.amazon.com/fargate/), but anywhere you can run `npm start` should work.

Before we begin, you should have installed and configured the official [AWS CLI](https://aws.amazon.com/cli/). You should be able to run e.g. `aws sqs list-queues` without error. We will also be using the _unofficial_ [Fargate CLI](https://github.com/jpignata/fargate). This will automatically use the same credentials as the official CLI. Download that and make sure that the executable file is in your `$PATH`. 

First, create an IAM role which can enumerate your SQS queues and their tags, and invoke your Lambda funcitons.

```sh
aws iam create-role \
  --role-name sqs-lambda-bridge \
  --assume-role-policy-document file://iam/role.json
  
aws iam put-role-policy \
  --role-name sqs-lambda-bridge \
  --policy-name sqs-lambda-bridge \
  --policy-document file://iam/role-policy.json
```

Next, create a cluster.

```sh
fargate service create --task-role sqs-lambda-bridge sqs-lambda-bridge
```

It takes a few minutes to provision and start the new container. You can view logs in real time.

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
