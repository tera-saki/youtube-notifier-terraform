locals {
  log_levels = {
    error = {
      pattern     = "ERROR"
      threshold   = 1
      description = "Critical errors in youtube-notifier Lambda"
    },
    warn = {
      pattern     = "WARN"
      threshold   = 1
      description = "Warning logs in youtube-notifier Lambda"
    }
  }

  lambda_name = "youtube-notifier"
}

resource "aws_cloudwatch_log_metric_filter" "log_filters" {
  for_each = local.log_levels

  name           = "${local.lambda_name}-${each.key}-filter"
  pattern        = each.value.pattern
  log_group_name = aws_cloudwatch_log_group.lambda_logs[local.lambda_name].name

  metric_transformation {
    name      = each.key
    namespace = "YouTubeNotifier"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "log_alarms" {
  for_each = local.log_levels

  alarm_name          = "${local.lambda_name}-${each.key}-alarm"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = each.key
  namespace           = "YouTubeNotifier"
  period              = 300
  statistic           = "Sum"
  threshold           = each.value.threshold
  alarm_description   = each.value.description
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_sns_topic" "alerts" {
  name = "youtube-notifier-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
