variable "project_name" {
  type = string
}

variable "private_subnet_ids" {
  description = "From the network module. The database sits in the private tier only, never in the same subnets as the ALB or ECS tasks."
  type        = list(string)
}

variable "db_security_group_id" {
  description = "From the network module. Admits PostgreSQL from the ECS security group only."
  type        = string
}

variable "use_aurora" {
  type = bool
}

variable "db_multi_az" {
  type = bool
}

variable "db_instance_class" {
  type = string
}

variable "db_name" {
  type = string
}

variable "db_username" {
  type = string
}

variable "s3_bucket_suffix" {
  description = "Random suffix appended to the S3 bucket name for global uniqueness. Generated once in main.tf via random_id and passed in, rather than generated inside this module, so repeated terraform plan runs do not propose a new bucket name each time."
  type        = string
}

variable "tags" {
  type = map(string)
}
