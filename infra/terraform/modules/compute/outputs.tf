output "alb_dns_name" {
  value = aws_lb.app.dns_name
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  value = aws_ecs_service.app.name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.app.name
}

output "waf_web_acl_arn" {
  description = "Null when enable_waf = false. Present only for the one-cycle evidence-capture run."
  value       = var.enable_waf ? aws_wafv2_web_acl.alb[0].arn : null
}
