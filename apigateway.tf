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
}

resource "aws_apigatewayv2_integration" "youtube_webhook" {
  api_id                 = aws_apigatewayv2_api.youtube_webhook.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.main["youtube-notifier"].invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "youtube_webhook_get" {
  api_id    = aws_apigatewayv2_api.youtube_webhook.id
  route_key = "GET /callback"
  target    = "integrations/${aws_apigatewayv2_integration.youtube_webhook.id}"
}

resource "aws_apigatewayv2_route" "youtube_webhook_post" {
  api_id    = aws_apigatewayv2_api.youtube_webhook.id
  route_key = "POST /callback"
  target    = "integrations/${aws_apigatewayv2_integration.youtube_webhook.id}"
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
