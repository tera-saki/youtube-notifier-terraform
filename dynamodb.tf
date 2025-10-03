# DynamoDB table
resource "aws_dynamodb_table" "youtube_channel_status" {
  name         = "youtube-channel-status"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "channelId"

  attribute {
    name = "channelId"
    type = "S"
  }
}

# IAM policy for Lambda to access DynamoDB
resource "aws_iam_policy" "dynamodb_access" {
  name        = "youtube_notifier_dynamodb_access"
  description = "IAM policy for DynamoDB access from Lambda"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem"
        ]
        Resource = [
          aws_dynamodb_table.youtube_channel_status.arn,
          "${aws_dynamodb_table.youtube_channel_status.arn}/index/*"
        ]
      }
    ]
  })
}

# Attach the DynamoDB policy to the Lambda role
resource "aws_iam_role_policy_attachment" "lambda_dynamodb" {
  role       = aws_iam_role.lambda["youtube-notifier"].name
  policy_arn = aws_iam_policy.dynamodb_access.arn
}
