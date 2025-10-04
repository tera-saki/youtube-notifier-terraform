# EventBridge Scheduler for YouTube Notifier Lambda
resource "aws_scheduler_schedule" "youtube_notifier" {
  name                = "youtube-notifier-scheduler"
  schedule_expression = "rate(10 minutes)"
  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.main["youtube-notifier"].arn
    role_arn = aws_iam_role.scheduler_role.arn

    input = jsonencode({
      "invokedFromScheduler" : true
    })

    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}

# IAM Role for EventBridge Scheduler
resource "aws_iam_role" "scheduler_role" {
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

# IAM Policy for EventBridge Scheduler to invoke Lambda
resource "aws_iam_policy" "scheduler_policy" {
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

# Attach the policy to the role
resource "aws_iam_role_policy_attachment" "scheduler_policy_attachment" {
  role       = aws_iam_role.scheduler_role.name
  policy_arn = aws_iam_policy.scheduler_policy.arn
}

