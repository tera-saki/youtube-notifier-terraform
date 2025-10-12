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
