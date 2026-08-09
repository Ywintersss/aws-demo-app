locals {
  db_host       = var.use_aurora ? aws_rds_cluster.aurora[0].endpoint : aws_db_instance.postgres[0].address
  db_port       = var.use_aurora ? aws_rds_cluster.aurora[0].port : aws_db_instance.postgres[0].port
  db_secret_arn = var.use_aurora ? aws_rds_cluster.aurora[0].master_user_secret[0].secret_arn : aws_db_instance.postgres[0].master_user_secret[0].secret_arn
}

output "db_host" {
  value = local.db_host
}

output "db_port" {
  value = local.db_port
}

output "db_name" {
  value = var.db_name
}

output "db_username" {
  value = var.db_username
}

output "db_secret_arn" {
  value = local.db_secret_arn
}

output "s3_bucket_name" {
  value = aws_s3_bucket.attachments.id
}
