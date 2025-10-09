resource "aws_cloudwatch_log_metric_filter" "log_filters_error" {
  for_each = local.lambda_configs

  name           = "${each.key}-error-filter"
  pattern        = "ERROR"
  log_group_name = aws_cloudwatch_log_group.lambda_logs[each.key].name

  metric_transformation {
    name      = "error"
    namespace = each.key
    value     = "1"
  }
}

resource "aws_cloudwatch_log_metric_filter" "log_filters_warn" {
  for_each = local.lambda_configs

  name           = "${each.key}-warn-filter"
  pattern        = "WARN"
  log_group_name = aws_cloudwatch_log_group.lambda_logs[each.key].name

  metric_transformation {
    name      = "warn"
    namespace = each.key
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "log_alarms_error" {
  for_each = local.lambda_configs

  alarm_name          = "${each.key}-error-alarm"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "error"
  namespace           = each.key
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Critical errors in ${each.key} Lambda function"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts[each.key].arn]
  ok_actions    = [aws_sns_topic.alerts[each.key].arn]
}

resource "aws_cloudwatch_metric_alarm" "log_alarms_warn" {
  for_each = local.lambda_configs

  alarm_name          = "${each.key}-warn-alarm"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "warn"
  namespace           = each.key
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Critical warnings in ${each.key} Lambda function"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts[each.key].arn]
  ok_actions    = [aws_sns_topic.alerts[each.key].arn]
}

resource "aws_sns_topic" "alerts" {
  for_each = local.lambda_configs

  name = "${each.key}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  for_each = aws_sns_topic.alerts

  topic_arn = each.value.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
