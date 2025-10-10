resource "aws_scheduler_schedule" "youtube_notifier" {
  name                = "youtube-notifier-scheduler"
  schedule_expression = "rate(1 hours)"
  flexible_time_window {
    mode                      = "FLEXIBLE"
    maximum_window_in_minutes = 10
  }

  target {
    arn      = aws_lambda_function.main["youtube-notifier"].arn
    role_arn = aws_iam_role.youtube_notifier_scheduler_role.arn

    input = jsonencode({
      "invokedFromScheduler" : true
    })

    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}

resource "aws_scheduler_schedule" "ip_range_fetcher" {
  name                = "ip-range-fetcher-scheduler"
  schedule_expression = "rate(12 hours)"
  flexible_time_window {
    mode                      = "FLEXIBLE"
    maximum_window_in_minutes = 60
  }

  target {
    arn      = aws_lambda_function.main["ip-range-fetcher"].arn
    role_arn = aws_iam_role.ip_range_fetcher_scheduler_role.arn

    retry_policy {
      maximum_retry_attempts = 2
    }
  }
}

resource "aws_iam_role" "youtube_notifier_scheduler_role" {
  name = "youtube_notifier_scheduler_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "scheduler.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role" "ip_range_fetcher_scheduler_role" {
  name = "ip_range_fetcher_scheduler_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "scheduler.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_policy" "youtube_notifier_scheduler_policy" {
  name        = "youtube_notifier_scheduler_policy"
  description = "Allow EventBridge Scheduler to invoke YouTube Notifier Lambda"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = "lambda:InvokeFunction"
        Effect   = "Allow"
        Resource = aws_lambda_function.main["youtube-notifier"].arn
      }
    ]
  })
}

resource "aws_iam_policy" "ip_range_fetcher_scheduler_policy" {
  name        = "ip_range_fetcher_scheduler_policy"
  description = "Allow EventBridge Scheduler to invoke IP Range Fetcher Lambda"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = "lambda:InvokeFunction"
        Effect   = "Allow"
        Resource = aws_lambda_function.main["ip-range-fetcher"].arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "youtube_notifier_scheduler_policy_attachment" {
  role       = aws_iam_role.youtube_notifier_scheduler_role.name
  policy_arn = aws_iam_policy.youtube_notifier_scheduler_policy.arn
}


resource "aws_iam_role_policy_attachment" "ip_range_fetcher_scheduler_policy_attachment" {
  role       = aws_iam_role.ip_range_fetcher_scheduler_role.name
  policy_arn = aws_iam_policy.ip_range_fetcher_scheduler_policy.arn
}
