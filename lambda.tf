locals {
  lambda_configs = {
    "youtube-notifier" = {
      environment = {
        APIGATEWAY_ENDPOINT = aws_apigatewayv2_api.youtube_webhook.api_endpoint
        DYNAMODB_TABLE_NAME = aws_dynamodb_table.youtube_channel_status.name
        SLACK_WEBHOOK_URL   = var.SLACK_WEBHOOK_URL
      }
      timeout = 120
    }
  }
}


resource "aws_iam_role" "lambda" {
  for_each = local.lambda_configs
  name     = "lambda_exec_role_${each.key}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "lambda_logs" {
  for_each = local.lambda_configs

  name              = "/aws/lambda/${each.key}"
  retention_in_days = 30
}

resource "aws_lambda_function" "main" {
  for_each = local.lambda_configs

  function_name    = each.key
  filename         = "lambda/${each.key}/dist/function.zip"
  role             = aws_iam_role.lambda[each.key].arn
  handler          = "src/index.handler"
  runtime          = "nodejs22.x"
  memory_size      = 256
  timeout          = each.value.timeout
  source_code_hash = filesha256("lambda/${each.key}/dist/function.zip")

  environment {
    variables = lookup(each.value, "environment", {})
  }

  # CloudWatch Logs グループの依存関係を追加
  depends_on = [aws_cloudwatch_log_group.lambda_logs]
}

resource "aws_iam_role_policy_attachment" "lambda" {
  for_each = local.lambda_configs

  role       = aws_iam_role.lambda[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
