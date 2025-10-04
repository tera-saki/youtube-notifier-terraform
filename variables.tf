variable "slack_webhook_url" {
  description = "Slack Webhook URL"
  type        = string
  sensitive   = true
}

variable "alert_email" {
  description = "Email address for receiving alerts"
  type        = string
  sensitive   = true
}
