ephemeral "random_password" "hub_secret" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "hub_secret" {
  name             = "/youtube_notifier/hub_secret"
  type             = "SecureString"
  tier             = "Standard"
  value_wo         = ephemeral.random_password.hub_secret.result
  value_wo_version = var.hub_secret_version
}

resource "aws_ssm_parameter" "slack_app_signing_secret" {
  name  = "/youtube_notifier/slack_app_signing_secret"
  type  = "SecureString"
  tier  = "Standard"
  value = var.slack_app_secret
}
