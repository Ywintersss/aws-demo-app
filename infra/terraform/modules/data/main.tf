resource "aws_db_subnet_group" "this" {
  name       = "${var.project_name}-db-subnets"
  subnet_ids = var.private_subnet_ids
  tags       = var.tags
}

# ---- Aurora PostgreSQL (Provisioned) — used when var.use_aurora = true ----
# Confirmed decision: this is a single dedicated proof-of-concept cycle, not
# the default. Deploy, capture terraform plan/apply output as the T1
# declarative-evidence artefact, then destroy immediately. See the Learner
# Lab configuration plan §2.3.
resource "aws_rds_cluster" "aurora" {
  count                       = var.use_aurora ? 1 : 0
  cluster_identifier          = "${var.project_name}-aurora"
  engine                      = "aurora-postgresql"
  engine_mode                 = "provisioned"
  database_name               = var.db_name
  master_username             = var.db_username
  manage_master_user_password = true
  db_subnet_group_name        = aws_db_subnet_group.this.name
  vpc_security_group_ids      = [var.db_security_group_id]
  skip_final_snapshot         = true
  apply_immediately           = true
  tags                        = var.tags
}

resource "aws_rds_cluster_instance" "aurora_writer" {
  count              = var.use_aurora ? 1 : 0
  identifier         = "${var.project_name}-aurora-writer"
  cluster_identifier = aws_rds_cluster.aurora[0].id
  engine             = aws_rds_cluster.aurora[0].engine
  # Aurora's provisioned writer has no true burstable class; db.t4g.medium
  # is the practical floor, set explicitly for the Aurora POC cycle in
  # environments/learnerlab.tfvars rather than relying on the RDS-oriented
  # db_instance_class default of db.t4g.micro.
  instance_class = var.db_instance_class
  tags            = var.tags
}

# ---- Single RDS PostgreSQL instance — the default for every regular cycle ----
# Confirmed decision: RDS is the default, not a fallback. Aurora costs
# roughly USD 130/month if forgotten against roughly USD 14/month for this,
# and carries the same seven-day auto-restart hazard at nine times the
# blast radius. See the Learner Lab configuration plan §2.3.
resource "aws_db_instance" "postgres" {
  count                       = var.use_aurora ? 0 : 1
  identifier                  = "${var.project_name}-postgres"
  engine                      = "postgres"
  instance_class              = var.db_instance_class
  allocated_storage           = 20
  storage_type                = "gp2"
  db_name                     = var.db_name
  username                    = var.db_username
  manage_master_user_password = true
  db_subnet_group_name        = aws_db_subnet_group.this.name
  vpc_security_group_ids      = [var.db_security_group_id]
  multi_az                    = var.db_multi_az
  publicly_accessible         = false
  skip_final_snapshot         = true
  apply_immediately           = true
  # Mandatory on Learner Lab: servicerestrictions.md states enhanced
  # monitoring is not supported and must be unchecked. The Terraform
  # provider default is already 0; set explicitly so nobody re-enables it
  # by accident.
  monitoring_interval = 0
  tags                 = var.tags
}

# ---- S3 bucket for future attachments — built now, not deferred ----
# Confirmed decision: infrastructure is provisioned regardless of whether
# the application-side attachment feature (presigned upload/download) ever
# lands. The bucket, versioning, Block Public Access, and lifecycle rule
# are the expensive-to-redo parts; the ObjectStore adapter and two presign
# endpoints are cheap application work that can follow later with zero
# infrastructure change. See the Learner Lab configuration plan §2.2 and
# decision 1.
resource "aws_s3_bucket" "attachments" {
  bucket        = "${var.project_name}-attachments-${var.s3_bucket_suffix}"
  force_destroy = true
  tags          = var.tags
}

resource "aws_s3_bucket_versioning" "attachments" {
  bucket = aws_s3_bucket.attachments.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "attachments" {
  bucket                  = aws_s3_bucket.attachments.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id
  rule {
    apply_server_side_encryption_by_default {
      # SSE-S3, not SSE-KMS. A customer-managed KMS key has a minimum
      # seven-day pending-deletion window, so it survives teardown and
      # keeps costing across cycles — declined for this reason, per the
      # Learner Lab configuration plan §1.2.
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id
  rule {
    id     = "glacier-instant-retrieval-90-days"
    status = "Enabled"
    filter {}
    transition {
      days          = 90
      storage_class = "GLACIER_IR"
    }
  }
}
