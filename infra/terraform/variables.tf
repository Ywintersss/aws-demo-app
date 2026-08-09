variable "region" {
  description = "AWS region. Learner Lab constrains this to us-east-1 (servicerestrictions.md: AMIs pinned to us-east-1/us-west-2, vockey exists only in us-east-1)."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  type    = string
  default = "aethelgard-demo"
}

variable "az_count" {
  description = "Number of Availability Zones to span. 3, not 2, so the plan output backs the three-zone claim in the report's B.6/B.11 rather than undercutting it. Confirmed against the account's actual AZs in Phase 0.3 of the Learner Lab configuration plan before first apply."
  type        = number
  default     = 3
}

variable "use_lab_role" {
  description = "true = look up the pre-existing Learner Lab LabRole via a data source rather than creating one. This configuration supports only true; a personal-account IAM path is a documented extension point, not built here."
  type        = bool
  default     = true

  validation {
    condition     = var.use_lab_role == true
    error_message = "This configuration only implements the Learner Lab (use_lab_role = true) path. See docs/RUNBOOK.md for the personal-account extension point."
  }
}

variable "enable_waf" {
  description = "true = attach a REGIONAL-scope AWS WAF web ACL to the ALB. WAF is on the Learner Lab permitted service list (only CloudFront is not); this is a real, buildable control, distinct from the CloudFront+WAF pairing the report's Section C names for the full architecture. Confirmed decision: build for one evidence-capture cycle, then set false for every later cycle, since a web ACL bills roughly USD 5-6/month regardless of how long the stack runs. See the Learner Lab configuration plan §2.1."
  type        = bool
  default     = true
}

variable "use_aurora" {
  description = "true = Aurora PostgreSQL (Provisioned) cluster. false = a single RDS PostgreSQL instance. The application only ever reads DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD, composed into one connection string in config/env.ts, so this is a pure infrastructure choice with zero application code changes either way. Confirmed decision: RDS is the default for every regular cycle; Aurora is a single dedicated proof-of-concept cycle, destroyed immediately after capturing terraform plan/apply output as T1 evidence. See the Learner Lab configuration plan §2.3."
  type        = bool
  default     = false
}

variable "db_multi_az" {
  description = "Only meaningful when use_aurora = false. An Aurora cluster is multi-AZ-capable by construction; this only toggles RDS single-instance Multi-AZ."
  type        = bool
  default     = false
}

variable "db_instance_class" {
  description = "Learner Lab RDS restriction: burstable classes only (nano/micro/small/medium). db.t4g.micro is the lean-profile default; Aurora's provisioned writer needs at least db.t4g.medium, set explicitly in environments/learnerlab.tfvars when use_aurora = true."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_name" {
  type    = string
  default = "aethelgard"
}

variable "db_username" {
  type    = string
  default = "aethelgard_app"
}

variable "image_tag" {
  type    = string
  default = "latest"
}

variable "app_version" {
  type    = string
  default = "0.1.0"
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "desired_count" {
  type    = number
  default = 2
}

variable "min_capacity" {
  type    = number
  default = 2
}

variable "max_capacity" {
  type    = number
  default = 4
}
