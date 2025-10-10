resource "aws_s3_bucket" "google_ip_ranges" {
  bucket = "google-ip-ranges"

  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "google_ip_ranges" {
  bucket = aws_s3_bucket.google_ip_ranges.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_iam_policy" "s3_access" {
  name        = "lambda_s3_google_ip_ranges_access"
  description = "Allow Lambda function to write to Google IP ranges S3 bucket"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.google_ip_ranges.arn,
          "${aws_s3_bucket.google_ip_ranges.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_s3_access_ip_range_fetcher" {
  role       = aws_iam_role.lambda["ip-range-fetcher"].name
  policy_arn = aws_iam_policy.s3_access.arn
}


resource "aws_iam_role_policy_attachment" "lambda_s3_access_ip_authorizer" {
  role       = aws_iam_role.lambda["ip-authorizer"].name
  policy_arn = aws_iam_policy.s3_access.arn
}
