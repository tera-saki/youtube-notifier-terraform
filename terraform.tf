locals {
  region = "us-west-2"
}

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.15"
    }
  }
  required_version = ">= 1.13"
}

provider "aws" {
  region = local.region
}
