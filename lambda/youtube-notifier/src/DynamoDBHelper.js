const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb')

class DynamoDBHelper {
  constructor() {
    const client = new DynamoDBClient({})
    this.docClient = DynamoDBDocumentClient.from(client)
  }

  async getItem(tableName, key) {
    const res = await this.docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: key,
      }),
    )
    return res.Item
  }

  async updateItem(tableName, key, props) {
    const updateExpression =
      'SET ' +
      Object.keys(props)
        .map((k) => `${k} = :${k}`)
        .join(', ')
    const expressionAttributeValues = Object.fromEntries(
      Object.entries(props).map(([k, v]) => [`:${k}`, v]),
    )

    await this.docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      }),
    )
  }

  async deleteItem(tableName, key) {
    await this.docClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: key,
      }),
    )
  }

  async listItems(tableName) {
    let items = []
    let ExclusiveStartKey = undefined

    do {
      const res = await this.docClient.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey,
        }),
      )
      items = [...items, ...res.Items]
      ExclusiveStartKey = res.LastEvaluatedKey
    } while (ExclusiveStartKey)

    return items
  }
}

module.exports = new DynamoDBHelper()
