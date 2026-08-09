variable "project_name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  description = "ALB and ECS tasks both sit here. See the network module's design note: no NAT gateway, so Fargate tasks need assign_public_ip = true to reach ECR."
  type        = list(string)
}

variable "alb_security_group_id" {
  type = string
}

variable "ecs_security_group_id" {
  type = string
}

variable "container_port" {
  type = number
}

variable "image_tag" {
  type = string
}

variable "desired_count" {
  type = number
}

variable "min_capacity" {
  type = number
}

variable "max_capacity" {
  type = number
}

variable "enable_waf" {
  type = bool
}

# ---- Values injected from the data module, forming the configuration
# contract described in the Learner Lab configuration plan §5 ----
variable "db_host" {
  type = string
}

variable "db_port" {
  type = number
}

variable "db_name" {
  type = string
}

variable "db_username" {
  type = string
}

variable "db_secret_arn" {
  description = "The RDS/Aurora managed master-user secret. Injected via the task definition's secrets block, never as a plain environment variable."
  type        = string
}

variable "s3_bucket_name" {
  type = string
}

variable "jwt_secret_arn" {
  description = "Root-level Secrets Manager secret, created outside this module (Phase 6 of the Learner Lab configuration plan) since its value is set once, out of band, and must survive terraform destroy/apply cycles without a new ARN each time."
  type        = string
}

variable "tags" {
  type = map(string)
}
