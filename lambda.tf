locals {
  lambda_configs = {
    "youtube-notifier" = {
      environment = {
        APIGATEWAY_ENDPOINT = aws_apigatewayv2_api.youtube_webhook.api_endpoint
        DYNAMODB_TABLE_NAME = aws_dynamodb_table.youtube_channel_status.name
        SLACK_WEBHOOK_URL   = var.slack_webhook_url
      }
      memory_size = 256
      timeout     = 600
    }
    "ip-range-fetcher" = {
      environment = {
        S3_BUCKET_NAME = aws_s3_bucket.google_ip_ranges.bucket
      }
      memory_size = 128
      timeout     = 10
    }
    "ip-authorizer" = {
      environment = {
        S3_BUCKET_NAME = aws_s3_bucket.google_ip_ranges.bucket
      }
      memory_size = 128
      timeout     = 10
    }
  }

  lambda_layer_hashes = {
    for k, v in local.lambda_configs : k => sha256(join("", [
      for file in ["package.json", "yarn.lock"] :
      filesha256("lambda/${k}/${file}")
    ]))
  }

  lambda_function_hashes = {
    for k, v in local.lambda_configs : k => sha256(join("", concat(
      [
        for file in fileset("lambda/${k}/src", "**/*.js") :
        filesha256("lambda/${k}/src/${file}")
      ],
      [
        for file in fileset("lambda/${k}/config", "*.json") :
        filesha256("lambda/${k}/config/${file}")
      ],
      [
        for file in fileset("lambda/${k}/credentials", "*.json") :
        filesha256("lambda/${k}/credentials/${file}")
      ]
    )))
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

resource "terraform_data" "lambda_layer" {
  for_each = local.lambda_configs

  input = {
    zip_file = "lambda/${each.key}/dist/layer.zip"
  }

  triggers_replace = {
    hash = local.lambda_layer_hashes[each.key]
  }

  provisioner "local-exec" {
    command = "lambda/scripts/build_lambda_layer.sh ${each.key}"
  }
}

resource "terraform_data" "lambda_function" {
  for_each = local.lambda_configs

  input = {
    zip_file = "lambda/${each.key}/dist/function.zip"
  }

  triggers_replace = {
    hash = local.lambda_function_hashes[each.key]
  }

  provisioner "local-exec" {
    command = "lambda/scripts/build.sh ${each.key}"
  }
}

resource "aws_lambda_layer_version" "main" {
  for_each = local.lambda_configs

  filename         = terraform_data.lambda_layer[each.key].output.zip_file
  layer_name       = "lambda_layer_${each.key}"
  source_code_hash = filesha256(terraform_data.lambda_layer[each.key].output.zip_file)

  compatible_runtimes = ["nodejs"]
}

resource "aws_lambda_function" "main" {
  for_each = local.lambda_configs

  function_name    = each.key
  filename         = terraform_data.lambda_function[each.key].output.zip_file
  role             = aws_iam_role.lambda[each.key].arn
  handler          = "src/index.handler"
  runtime          = "nodejs22.x"
  memory_size      = each.value.memory_size
  timeout          = each.value.timeout
  source_code_hash = filesha256(terraform_data.lambda_function[each.key].output.zip_file)

  layers = [
    aws_lambda_layer_version.main[each.key].arn
  ]

  environment {
    variables = lookup(each.value, "environment", {})
  }

  depends_on = [aws_cloudwatch_log_group.lambda_logs]
}

resource "aws_iam_role_policy_attachment" "lambda" {
  for_each = local.lambda_configs

  role       = aws_iam_role.lambda[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
