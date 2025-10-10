resource "aws_apigatewayv2_api" "youtube_webhook" {
  name          = "youtube-webhook-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST"]
    allow_headers = ["content-type", "x-hub-signature"]
  }
}

resource "aws_apigatewayv2_stage" "youtube_webhook" {
  api_id      = aws_apigatewayv2_api.youtube_webhook.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
    })
  }

  default_route_settings {
    throttling_burst_limit = 5
    throttling_rate_limit  = 5
  }
}

resource "aws_apigatewayv2_integration" "youtube_webhook" {
  api_id                 = aws_apigatewayv2_api.youtube_webhook.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.main["youtube-notifier"].invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_authorizer" "ip_authorizer" {
  api_id          = aws_apigatewayv2_api.youtube_webhook.id
  authorizer_type = "REQUEST"
  name            = "google-ip-authorizer"

  authorizer_uri                    = aws_lambda_function.main["ip-authorizer"].invoke_arn
  authorizer_credentials_arn        = aws_iam_role.authorizer_invocation_role.arn
  authorizer_payload_format_version = "2.0"
  authorizer_result_ttl_in_seconds  = 600
  enable_simple_responses           = true
  identity_sources                  = ["$context.identity.sourceIp"]
}

resource "aws_iam_role" "authorizer_invocation_role" {
  name = "api_gateway_auth_invocation"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "apigateway.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "authorizer_invocation_policy" {
  name = "api_gateway_auth_invocation_policy"
  role = aws_iam_role.authorizer_invocation_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action   = "lambda:InvokeFunction"
      Effect   = "Allow"
      Resource = aws_lambda_function.main["ip-authorizer"].arn
    }]
  })
}

resource "aws_lambda_permission" "authorizer" {
  statement_id  = "AllowAPIGatewayInvokeAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.main["ip-authorizer"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.youtube_webhook.execution_arn}/authorizers/${aws_apigatewayv2_authorizer.ip_authorizer.id}"
}

resource "aws_apigatewayv2_route" "youtube_webhook_get" {
  api_id    = aws_apigatewayv2_api.youtube_webhook.id
  route_key = "GET /callback"
  target    = "integrations/${aws_apigatewayv2_integration.youtube_webhook.id}"

  authorizer_id      = aws_apigatewayv2_authorizer.ip_authorizer.id
  authorization_type = "CUSTOM"
}

resource "aws_apigatewayv2_route" "youtube_webhook_post" {
  api_id    = aws_apigatewayv2_api.youtube_webhook.id
  route_key = "POST /callback"
  target    = "integrations/${aws_apigatewayv2_integration.youtube_webhook.id}"

  authorizer_id      = aws_apigatewayv2_authorizer.ip_authorizer.id
  authorization_type = "CUSTOM"
}

resource "aws_cloudwatch_log_group" "apigw" {
  name              = "/aws/apigw/${aws_apigatewayv2_api.youtube_webhook.name}"
  retention_in_days = 30
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.main["youtube-notifier"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.youtube_webhook.execution_arn}/*/*"
}

resource "aws_iam_role_policy_attachment" "lambda_s3_access_authorizer" {
  role       = aws_iam_role.lambda["ip-authorizer"].name
  policy_arn = aws_iam_policy.s3_access.arn
}
