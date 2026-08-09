module "network" {
  source         = "./modules/network"
  project_name   = var.project_name
  az_count       = var.az_count
  container_port = var.container_port
  tags           = local.tags
}

# Appended to the bucket name for global S3 uniqueness. Generated once here,
# not inside the data module, so re-running terraform plan never proposes a
# new bucket name for an existing bucket.
resource "random_id" "s3_suffix" {
  byte_length = 4
}

module "data" {
  source                = "./modules/data"
  project_name          = var.project_name
  private_subnet_ids    = module.network.private_subnet_ids
  db_security_group_id  = module.network.db_security_group_id
  use_aurora            = var.use_aurora
  db_multi_az           = var.db_multi_az
  db_instance_class     = var.db_instance_class
  db_name               = var.db_name
  db_username           = var.db_username
  s3_bucket_suffix      = random_id.s3_suffix.hex
  tags                  = local.tags
}

# ---- JWT_SECRET shell, value set once out of band ----
# recovery_window_in_days = 0 so repeated destroy/apply cycles don't
# collide with Secrets Manager's default 7-day recovery window. The value
# itself is set via `aws secretsmanager put-secret-value` after apply,
# never through Terraform, and ignore_changes protects it from being
# blanked on a later apply. See the Learner Lab configuration plan Phase 6.
resource "aws_secretsmanager_secret" "jwt" {
  name                    = "${var.project_name}-jwt-secret"
  recovery_window_in_days = 0
  tags                    = local.tags

  lifecycle {
    ignore_changes = [description]
  }
}

module "compute" {
  source                 = "./modules/compute"
  project_name           = var.project_name
  vpc_id                 = module.network.vpc_id
  public_subnet_ids      = module.network.public_subnet_ids
  alb_security_group_id  = module.network.alb_security_group_id
  ecs_security_group_id  = module.network.ecs_security_group_id
  container_port         = var.container_port
  image_tag               = var.image_tag
  desired_count           = var.desired_count
  min_capacity            = var.min_capacity
  max_capacity            = var.max_capacity
  enable_waf              = var.enable_waf
  db_host                 = module.data.db_host
  db_port                 = module.data.db_port
  db_name                 = module.data.db_name
  db_username             = module.data.db_username
  db_secret_arn           = module.data.db_secret_arn
  s3_bucket_name          = module.data.s3_bucket_name
  jwt_secret_arn           = aws_secretsmanager_secret.jwt.arn
  tags                     = local.tags
}
