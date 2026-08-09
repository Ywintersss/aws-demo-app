output "region" {
  value = var.region
}

output "vpc_id" {
  value = module.network.vpc_id
}

output "public_subnet_ids" {
  value = module.network.public_subnet_ids
}

output "private_subnet_ids" {
  value = module.network.private_subnet_ids
}

output "db_host" {
  value = module.data.db_host
}

output "db_secret_arn" {
  value = module.data.db_secret_arn
}

output "s3_bucket_name" {
  value = module.data.s3_bucket_name
}

output "alb_dns_name" {
  value = module.compute.alb_dns_name
}

output "ecs_cluster_name" {
  value = module.compute.ecs_cluster_name
}

output "ecs_service_name" {
  value = module.compute.ecs_service_name
}

output "ecr_repository_url" {
  value = module.compute.ecr_repository_url
}

output "jwt_secret_arn" {
  value = aws_secretsmanager_secret.jwt.arn
}
