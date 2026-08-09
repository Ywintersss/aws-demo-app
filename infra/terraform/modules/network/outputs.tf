output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Consumed by the compute module: ALB and ECS tasks."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Consumed by the data module: the DB subnet group."
  value       = aws_subnet.private[*].id
}

output "alb_security_group_id" {
  value = aws_security_group.alb.id
}

output "ecs_security_group_id" {
  value = aws_security_group.ecs.id
}

output "db_security_group_id" {
  value = aws_security_group.db.id
}
